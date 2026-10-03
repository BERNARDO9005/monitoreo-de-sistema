"""
Backend de Monitoreo de Sistema Operativo Nativo v2.0
====================================================
Servidor de telemetría de alto rendimiento basado en FastAPI, Uvicorn, WebSockets y psutil.
Diseñado para mínima sobrecarga de CPU/RAM, medición asíncrona no bloqueante,
broadcast concurrente a múltiples clientes y tolerancia a fallos por hardware/SO.
"""

import asyncio
import json
import logging
import socket
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import psutil

# Rutas estáticas para distribución compilada (React/Vite)
BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"
DIST_INDEX = DIST_DIR / "index.html"
DIST_ASSETS = DIST_DIR / "assets"

# Configuración de logging para producción
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("system-monitor")

# =====================================================================
# GESTOR DE CONEXIONES WEBSOCKET (CONCURRENT BROADCAST)
# =====================================================================
class ConnectionManager:
    """Administra conexiones activas y realiza difusiones concurrentes no bloqueantes."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
            logger.info("Cliente WebSocket conectado. Clientes activos: %d", len(self.active_connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)
            logger.info("Cliente WebSocket desconectado. Clientes activos: %d", len(self.active_connections))

    async def broadcast(self, message: str) -> None:
        """Transmite el mensaje a todos los clientes conectados de manera concurrente."""
        if not self.active_connections:
            return

        async with self._lock:
            recipients = list(self.active_connections)

        if not recipients:
            return

        # Difusión concurrente utilizando asyncio.gather con tolerancia a fallos
        tasks = [client.send_text(message) for client in recipients]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Limpiar de forma segura cualquier conexión que haya fallado o cerrado abruptamente
        disconnected_clients = []
        for client, result in zip(recipients, results):
            if isinstance(result, Exception):
                logger.debug("Error enviando datos a cliente WebSocket: %s", result)
                disconnected_clients.append(client)

        if disconnected_clients:
            async with self._lock:
                for dead_client in disconnected_clients:
                    self.active_connections.discard(dead_client)
            logger.info("Se removieron %d conexiones huérfanas.", len(disconnected_clients))


manager = ConnectionManager()

# =====================================================================
# COLECTOR DE MÉTRICAS NATIVAS DEL SISTEMA (LOW-LEVEL OS TELEMETRY)
# =====================================================================
class SystemMetricsCollector:
    """
    Colector de métricas de hardware y sistema operativo.
    Utiliza psutil de forma no bloqueante con diferenciales de tiempo
    para tasas de I/O de red y almacenamiento.
    """

    def __init__(self) -> None:
        self.last_time: float = time.time()
        self.last_disk_io: Optional[Any] = None
        self.last_net_io: Optional[Dict[str, int]] = None

        # Inicialización previa (priming) de psutil para evitar llamadas bloqueantes
        psutil.cpu_percent(interval=None)
        psutil.cpu_percent(interval=None, percpu=True)
        self.last_disk_io = psutil.disk_io_counters()
        self.last_net_io = self._get_aggregated_net_io_snapshot()

    def _get_cpu_temperature(self) -> Optional[float]:
        """
        Obtiene la temperatura del CPU en grados Celsius.
        
        Nota sobre SO nativo y fallbacks:
        En Linux y macOS, psutil.sensors_temperatures() provee las lecturas térmicas del kernel.
        En Windows nativo, psutil no expone sensores térmicos directamente (AttributeError o vacío).
        Para entornos Windows donde se requiera temperatura de CPU en producción, se recomienda integrar:
          1. OpenHardwareMonitor / LibreHardwareMonitor mediante su DLL o WMI (root/OpenHardwareMonitor).
          2. WMI nativo: wmi.WMI(namespace="root/wmi").MSAcpi_ThermalZoneTemperature (sujeto a soporte ACPI).
        En ausencia de soporte nativo o permisos, la función retorna None de forma segura y transparente.
        """
        try:
            if not hasattr(psutil, "sensors_temperatures"):
                return None
            temps = psutil.sensors_temperatures()
            if not temps:
                return None

            # Buscar sensores térmicos comunes según plataforma
            for sensor_name in ("coretemp", "cpu_thermal", "k10temp", "acpitz", "zenpower", "soc_thermal"):
                if sensor_name in temps and temps[sensor_name]:
                    entries = temps[sensor_name]
                    for entry in entries:
                        if entry.current is not None and entry.current > 0:
                            return round(float(entry.current), 1)

            # Si no coincide con los nombres estándar, tomar la primera lectura válida
            for entries in temps.values():
                for entry in entries:
                    if entry.current is not None and entry.current > 0:
                        return round(float(entry.current), 1)
        except Exception as exc:
            logger.debug("No se pudo obtener la temperatura de CPU: %s", exc)
            return None

        return None

    def _get_cpu_metrics(self) -> Dict[str, Any]:
        """Recolecta métricas de CPU de forma completamente no bloqueante."""
        cpu_total = round(float(psutil.cpu_percent(interval=None)), 1)
        cpu_per_core = [round(float(pct), 1) for pct in psutil.cpu_percent(interval=None, percpu=True)]

        # Frecuencia de operación (GHz)
        # psutil.cpu_freq() puede retornar None en máquinas virtuales o contenedores
        freq_current_ghz: Optional[float] = None
        freq_max_ghz: Optional[float] = None
        try:
            freq = psutil.cpu_freq()
            if freq and freq.current:
                freq_current_ghz = round(float(freq.current) / 1000.0, 2)
                if freq.max and freq.max > 0:
                    freq_max_ghz = round(float(freq.max) / 1000.0, 2)
        except Exception as exc:
            logger.debug("Error obteniendo cpu_freq: %s", exc)

        temp_c = self._get_cpu_temperature()

        # Evaluación de umbrales según regla de negocio
        cpu_status = "ok" if cpu_total < 70.0 else ("warning" if cpu_total <= 90.0 else "critical")

        temp_status: Optional[str] = None
        if temp_c is not None:
            temp_status = "ok" if temp_c < 70.0 else ("warning" if temp_c <= 80.0 else "critical")

        return {
            "usage_percent": cpu_total,
            "status": cpu_status,
            "frequency_current_ghz": freq_current_ghz,
            "frequency_max_ghz": freq_max_ghz,
            "temperature_c": temp_c,
            "temperature_status": temp_status,
            "core_count": len(cpu_per_core),
            "cores": cpu_per_core
        }

    def _get_ram_and_swap_metrics(self) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """Recolecta métricas de memoria RAM física y Swap/Paginación."""
        vm = psutil.virtual_memory()
        ram_used_gb = round(float(vm.used) / (1024.0 ** 3), 1)
        ram_total_gb = round(float(vm.total) / (1024.0 ** 3), 1)
        ram_pct = round(float(vm.percent), 1)
        ram_status = "ok" if ram_pct < 70.0 else ("warning" if ram_pct <= 90.0 else "critical")

        ram_data = {
            "used_gb": ram_used_gb,
            "total_gb": ram_total_gb,
            "percent": ram_pct,
            "status": ram_status
        }

        sm = psutil.swap_memory()
        swap_used_gb = round(float(sm.used) / (1024.0 ** 3), 1)
        swap_total_gb = round(float(sm.total) / (1024.0 ** 3), 1)
        swap_pct = round(float(sm.percent), 1)
        swap_status = "ok" if swap_pct < 30.0 else ("warning" if swap_pct <= 50.0 else "critical")

        swap_data = {
            "used_gb": swap_used_gb,
            "total_gb": swap_total_gb,
            "percent": swap_pct,
            "status": swap_status
        }

        return ram_data, swap_data

    def _get_storage_metrics(self, dt: float) -> Dict[str, Any]:
        """
        Recolecta particiones montadas y tasas de I/O de almacenamiento.
        Filtra con try/except (PermissionError, OSError) particiones no accesibles (CD-ROMs, unidades sin permiso).
        """
        partitions_list: List[Dict[str, Any]] = []

        try:
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    used_gb = round(float(usage.used) / (1024.0 ** 3), 1)
                    total_gb = round(float(usage.total) / (1024.0 ** 3), 1)
                    free_gb = round(float(usage.free) / (1024.0 ** 3), 1)
                    pct = round(float(usage.percent), 1)

                    # Regla de umbrales para espacio en disco
                    part_status = "ok" if pct < 80.0 else ("warning" if pct <= 95.0 else "critical")

                    partitions_list.append({
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total_gb": total_gb,
                        "used_gb": used_gb,
                        "free_gb": free_gb,
                        "percent": pct,
                        "status": part_status
                    })
                except (PermissionError, OSError):
                    # Silenciosamente ignorar particiones no accesibles o desconectadas
                    continue
        except Exception as exc:
            logger.debug("Error listando particiones: %s", exc)

        # Cálculo de tasas de lectura y escritura I/O mediante diferencial de tiempo
        current_io = psutil.disk_io_counters()
        read_mb_s = 0.0
        write_mb_s = 0.0
        active_time_pct = 0.0

        if current_io and self.last_disk_io and dt > 0:
            read_bytes_delta = max(0, current_io.read_bytes - self.last_disk_io.read_bytes)
            write_bytes_delta = max(0, current_io.write_bytes - self.last_disk_io.write_bytes)

            read_mb_s = round((read_bytes_delta / dt) / (1024.0 ** 2), 1)
            write_mb_s = round((write_bytes_delta / dt) / (1024.0 ** 2), 1)

            # Tiempo activo del disco (%):
            # En Linux se provee busy_time (ms).
            # En Windows se calcula a partir de read_time + write_time (ms).
            if hasattr(current_io, "busy_time") and current_io.busy_time is not None:
                delta_busy_ms = max(0, current_io.busy_time - self.last_disk_io.busy_time)
            else:
                curr_ms = getattr(current_io, "read_time", 0) + getattr(current_io, "write_time", 0)
                last_ms = getattr(self.last_disk_io, "read_time", 0) + getattr(self.last_disk_io, "write_time", 0)
                delta_busy_ms = max(0, curr_ms - last_ms)

            # Porcentaje de ocupación del disco en el intervalo dt (ms transcurridos = dt * 1000)
            active_time_pct = round(min(100.0, max(0.0, (delta_busy_ms / (dt * 1000.0)) * 100.0)), 1)

        self.last_disk_io = current_io

        active_time_status = "ok" if active_time_pct < 60.0 else ("warning" if active_time_pct <= 85.0 else "critical")

        return {
            "io": {
                "read_mb_s": read_mb_s,
                "write_mb_s": write_mb_s,
                "active_time_percent": active_time_pct,
                "active_time_status": active_time_status
            },
            "partitions": partitions_list
        }

    def _get_active_physical_interfaces(self) -> List[str]:
        """
        Filtra y devuelve únicamente las interfaces de red físicas activas:
        - Excluye loopback / lo
        - Excluye interfaces con isup=False
        - Excluye interfaces sin IP válida asignada (IPv4/IPv6 no-loopback)
        """
        active_nics: List[str] = []
        try:
            stats = psutil.net_if_stats()
            addrs = psutil.net_if_addrs()

            for nic, st in stats.items():
                nic_lower = nic.lower()
                # Excluir loopback o interfaces virtuales típicas
                if not st.isup or "loopback" in nic_lower or nic_lower == "lo" or "teredo" in nic_lower:
                    continue

                nic_addrs = addrs.get(nic, [])
                has_valid_ip = any(
                    addr.family in (socket.AF_INET, getattr(socket, "AF_INET6", -1))
                    and not addr.address.startswith("127.")
                    and addr.address != "::1"
                    for addr in nic_addrs
                )

                if has_valid_ip:
                    active_nics.append(nic)
        except Exception as exc:
            logger.debug("Error filtrando interfaces de red activas: %s", exc)

        return active_nics

    def _get_aggregated_net_io_snapshot(self) -> Dict[str, int]:
        """Agrega los contadores de red acumulados de todas las interfaces activas."""
        active_nics = self._get_active_physical_interfaces()
        totals = {
            "bytes_sent": 0,
            "bytes_recv": 0,
            "packets_sent": 0,
            "packets_recv": 0,
            "errin": 0,
            "errout": 0,
            "dropin": 0,
            "dropout": 0
        }

        try:
            per_nic_io = psutil.net_io_counters(pernic=True)
            for nic in active_nics:
                if nic in per_nic_io:
                    io = per_nic_io[nic]
                    totals["bytes_sent"] += io.bytes_sent
                    totals["bytes_recv"] += io.bytes_recv
                    totals["packets_sent"] += io.packets_sent
                    totals["packets_recv"] += io.packets_recv
                    totals["errin"] += io.errin
                    totals["errout"] += io.errout
                    totals["dropin"] += io.dropin
                    totals["dropout"] += io.dropout
        except Exception as exc:
            logger.debug("Error agregando contadores de red: %s", exc)

        return totals

    def _get_network_metrics(self, dt: float) -> Dict[str, Any]:
        """
        Calcula el ancho de banda en tiempo real y estadísticas de paquetes
        para todas las interfaces físicas activas consolidadas.
        """
        active_nics = self._get_active_physical_interfaces()
        curr_totals = self._get_aggregated_net_io_snapshot()

        download_mb_s = 0.0
        upload_mb_s = 0.0
        download_kb_s = 0.0
        upload_kb_s = 0.0
        drop_percent = 0.0
        errors_delta = 0

        if self.last_net_io and dt > 0:
            bytes_recv_delta = max(0, curr_totals["bytes_recv"] - self.last_net_io["bytes_recv"])
            bytes_sent_delta = max(0, curr_totals["bytes_sent"] - self.last_net_io["bytes_sent"])

            download_mb_s = round((bytes_recv_delta / dt) / (1024.0 ** 2), 1)
            upload_mb_s = round((bytes_sent_delta / dt) / (1024.0 ** 2), 1)
            download_kb_s = round((bytes_recv_delta / dt) / 1024.0, 1)
            upload_kb_s = round((bytes_sent_delta / dt) / 1024.0, 1)

            # Estadísticas de paquetes perdidos y errores
            packets_delta = max(0, (curr_totals["packets_recv"] + curr_totals["packets_sent"]) -
                                  (self.last_net_io["packets_recv"] + self.last_net_io["packets_sent"]))
            drop_delta = max(0, (curr_totals["dropin"] + curr_totals["dropout"]) -
                               (self.last_net_io["dropin"] + self.last_net_io["dropout"]))
            errors_delta = max(0, (curr_totals["errin"] + curr_totals["errout"]) -
                                  (self.last_net_io["errin"] + self.last_net_io["errout"]))

            if packets_delta > 0:
                drop_percent = round((drop_delta / packets_delta) * 100.0, 1)

        self.last_net_io = curr_totals

        # Evaluación de umbrales para paquetes perdidos
        # 0 % ("ok") | 0.1–5 % ("warning") | > 5 % ("critical")
        if drop_percent == 0.0:
            packet_drop_status = "ok"
        elif drop_percent <= 5.0:
            packet_drop_status = "warning"
        else:
            packet_drop_status = "critical"

        return {
            "download_mb_s": download_mb_s,
            "upload_mb_s": upload_mb_s,
            "download_kb_s": download_kb_s,
            "upload_kb_s": upload_kb_s,
            "packet_drop_percent": drop_percent,
            "packet_drop_status": packet_drop_status,
            "errors_count": errors_delta,
            "active_interfaces": active_nics
        }

    def collect(self) -> Dict[str, Any]:
        """Recolecta de forma centralizada todas las métricas requeridas."""
        now = time.time()
        dt = max(0.001, now - self.last_time)
        self.last_time = now

        cpu = self._get_cpu_metrics()
        ram, swap = self._get_ram_and_swap_metrics()
        storage = self._get_storage_metrics(dt)
        network = self._get_network_metrics(dt)

        return {
            "timestamp": round(now, 1),
            "cpu": cpu,
            "ram": ram,
            "swap": swap,
            "storage": storage,
            "network": network
        }


collector = SystemMetricsCollector()

# =====================================================================
# TAREA EN SEGUNDO PLANO: CICLO DE LECTURA Y BROADCAST (500 ms)
# =====================================================================
async def telemetry_broadcast_loop() -> None:
    """Ejecuta el muestreo cada 500 ms y transmite el payload a los clientes conectados."""
    logger.info("Iniciando bucle asíncrono de telemetría (intervalo: 500 ms)")
    while True:
        try:
            # Medición en modo no bloqueante
            metrics = collector.collect()
            payload = json.dumps(metrics)
            await manager.broadcast(payload)
        except asyncio.CancelledError:
            logger.info("Bucle de telemetría cancelado.")
            break
        except Exception as exc:
            logger.error("Error inesperado en ciclo de telemetría: %s", exc)

        await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicialización al arrancar
    broadcast_task = asyncio.create_task(telemetry_broadcast_loop())
    yield
    # Limpieza al detener
    broadcast_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass


# =====================================================================
# APLICACIÓN FASTAPI Y ENDPOINTS
# =====================================================================
app = FastAPI(
    title="Dashboard de Monitoreo de Sistema Operativo Nativo v2.0",
    description="Telemetría en tiempo real mediante WebSockets con latencia ultra-baja y modo no bloqueante.",
    version="2.0.0",
    lifespan=lifespan
)

# Soporte CORS para entorno de desarrollo (React / Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """Endpoint de comprobación de salud del backend."""
    return JSONResponse({
        "status": "healthy",
        "active_clients": len(manager.active_connections),
        "timestamp": time.time()
    })


@app.get("/metrics/current")
async def get_current_metrics() -> JSONResponse:
    """Devuelve una instantánea única de las métricas en formato JSON."""
    return JSONResponse(collector.collect())


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Canal WebSocket bidireccional para transmisión continua de métricas cada 500 ms."""
    await manager.connect(websocket)
    try:
        # Enviar inmediatamente el primer estado para evitar retraso inicial
        initial_payload = json.dumps(collector.collect())
        await websocket.send_text(initial_payload)

        while True:
            # Mantener la conexión abierta a la espera de ping o mensajes del cliente
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as exc:
        logger.debug("Excepción en conexión WebSocket: %s", exc)
        await manager.disconnect(websocket)


# =====================================================================
# CLIENTE WEB INTEGRADO (VISTA PREVIA INMEDIATA EN NAVEGADOR)
# =====================================================================
@app.get("/", response_class=HTMLResponse)
async def serve_embedded_dashboard() -> str:
    """
    Entrega un dashboard interactivo de alta fidelidad directamente desde el servidor.
    Permite visualizar el sistema de inmediato abriendo http://localhost:8000
    sin necesidad de compilar el frontend previamente.
    """
    return """<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>System Monitor Dashboard v2.0</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 900: '#0f172a', 800: '#1e293b', 700: '#334155' }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #0f172a; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; }
    .status-ok { background-color: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
    .status-warning { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
    .status-critical { background-color: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }
    .status-unknown { background-color: rgba(148, 163, 184, 0.15); color: #94a3b8; border-color: rgba(148, 163, 184, 0.3); }
  </style>
</head>
<body class="min-h-screen bg-[#0f172a] text-slate-100 p-4 md:p-6">
  <!-- Banner de Reconexión / Desconexión -->
  <div id="connectionBanner" class="hidden mb-6 p-4 rounded-xl border border-amber-500/40 bg-amber-950/40 text-amber-300 flex items-center justify-between shadow-lg">
    <div class="flex items-center space-x-3">
      <span class="relative flex h-3 w-3">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
      </span>
      <span class="font-medium" id="bannerMessage">Conexión interrumpida. Visualización pausada con datos congelados...</span>
    </div>
    <span class="text-xs font-mono uppercase bg-amber-900/60 px-2.5 py-1 rounded" id="bannerStatusBadge">RECONECTANDO</span>
  </div>

  <!-- Header -->
  <header class="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-4 border-b border-slate-800 gap-4">
    <div>
      <div class="flex items-center space-x-3">
        <div class="h-3.5 w-3.5 rounded-full bg-emerald-500 animate-pulse" id="headerLiveDot"></div>
        <h1 class="text-2xl font-bold tracking-tight text-white">Dashboard de Monitoreo de Sistema Operativo</h1>
      </div>
      <p class="text-xs text-slate-400 mt-1">Telemetría nativa en tiempo real (500 ms) &bull; Modo No Bloqueante &bull; Dark Mode Nativo</p>
    </div>
    <div class="flex items-center space-x-3 text-xs font-mono">
      <div class="bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg flex items-center space-x-2">
        <span class="text-slate-400">ESTADO:</span>
        <span id="socketStatusText" class="text-emerald-400 font-semibold">CONECTADO</span>
      </div>
      <div class="bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg flex items-center space-x-2">
        <span class="text-slate-400">MUESTRAS:</span>
        <span id="sampleCounter" class="text-indigo-400 font-semibold">0</span>
      </div>
    </div>
  </header>

  <!-- Grid de 4 Cuadrantes -->
  <main class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- Cuadrante 1: CPU -->
    <section class="bg-[#1e293b] border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
            <h2 class="text-lg font-bold text-slate-100">Unidad Central de Procesamiento (CPU)</h2>
          </div>
          <span id="cpuBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full border status-ok">OK</span>
        </div>

        <!-- Métricas Principales -->
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span class="text-xs text-slate-400 block mb-1">Carga Global</span>
            <span id="cpuUsage" class="text-2xl font-black text-white">0.0%</span>
          </div>
          <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span class="text-xs text-slate-400 block mb-1">Frecuencia Actual</span>
            <span id="cpuFreq" class="text-2xl font-black text-white">-- GHz</span>
          </div>
          <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span class="text-xs text-slate-400 block mb-1">Temperatura</span>
            <span id="cpuTemp" class="text-2xl font-black text-white">-- °C</span>
          </div>
        </div>

        <!-- Matriz de Núcleos / Core Breakdown -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Desglose por Núcleo (<span id="coreCount">--</span> Hilos)</span>
          </div>
          <div id="coreGrid" class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            <!-- Renderizado dinámico de núcleos -->
          </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span>Frecuencia Máxima: <b id="cpuFreqMax" class="text-slate-200">--</b></span>
        <span>Umbral Crítico: &gt; 90% / &gt; 80°C</span>
      </div>
    </section>

    <!-- Cuadrante 2: Memoria RAM y Swap -->
    <section class="bg-[#1e293b] border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <h2 class="text-lg font-bold text-slate-100">Memoria del Sistema (RAM & Swap)</h2>
          </div>
          <span id="ramBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full border status-ok">OK</span>
        </div>

        <!-- RAM Física -->
        <div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800 mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-semibold text-slate-300">Memoria Física (RAM)</span>
            <span id="ramDetail" class="text-xs font-mono text-slate-400">0.0 / 0.0 GB (0.0%)</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden">
            <div id="ramBar" class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500 mt-1">
            <span>0%</span>
            <span>Alerta: &gt; 70% | Crítico: &gt; 90%</span>
            <span>100%</span>
          </div>
        </div>

        <!-- Swap / Archivo de Paginación -->
        <div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div class="flex justify-between items-center mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-sm font-semibold text-slate-300">Swap / Paginación</span>
              <span id="swapBadge" class="text-[10px] font-semibold px-2 py-0.2 rounded border status-ok">OK</span>
            </div>
            <span id="swapDetail" class="text-xs font-mono text-slate-400">0.0 / 0.0 GB (0.0%)</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden">
            <div id="swapBar" class="bg-amber-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500 mt-1">
            <span>0%</span>
            <span>Alerta: &gt; 30% | Crítico: &gt; 50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
        <span>Prevención de saturación OOM</span>
        <span class="font-mono" id="ramFreeDetail">Disponible: -- GB</span>
      </div>
    </section>

    <!-- Cuadrante 3: Almacenamiento (HDD/SSD) -->
    <section class="bg-[#1e293b] border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7zm0 4h16m-4 5h.01" /></svg>
            <h2 class="text-lg font-bold text-slate-100">Almacenamiento (HDD / SSD)</h2>
          </div>
          <span id="diskActiveBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full border status-ok">ACTIVO: 0%</span>
        </div>

        <!-- Transferencia I/O & Tiempo Activo -->
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span class="text-xs text-slate-400 block mb-1">Lectura I/O</span>
            <span id="diskReadSpeed" class="text-xl font-black text-sky-400">0.0 MB/s</span>
          </div>
          <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span class="text-xs text-slate-400 block mb-1">Escritura I/O</span>
            <span id="diskWriteSpeed" class="text-xl font-black text-indigo-400">0.0 MB/s</span>
          </div>
          <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span class="text-xs text-slate-400 block mb-1">Tiempo Ocupado</span>
            <span id="diskActiveTime" class="text-xl font-black text-white">0.0%</span>
          </div>
        </div>

        <!-- Lista de Particiones -->
        <div class="space-y-3" id="partitionsContainer">
          <div class="text-xs text-slate-500 py-2">Consultando unidades de almacenamiento...</div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
        <span>Particiones montadas activas</span>
        <span>Exclusión automática de unidades extraíbles vacías</span>
      </div>
    </section>

    <!-- Cuadrante 4: Red (Internet / LAN) -->
    <section class="bg-[#1e293b] border border-slate-700/60 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <h2 class="text-lg font-bold text-slate-100">Interfaz de Red (Internet / LAN)</h2>
          </div>
          <span id="packetDropBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full border status-ok">DROP: 0%</span>
        </div>

        <!-- Velocidades de Red -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span class="text-xs text-slate-400 block">Bajada (Download)</span>
              <span id="netDownload" class="text-2xl font-black text-emerald-400">0.0 MB/s</span>
              <span id="netDownloadKb" class="text-[11px] text-slate-500 font-mono block">(0.0 KB/s)</span>
            </div>
            <svg class="w-8 h-8 text-emerald-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </div>

          <div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span class="text-xs text-slate-400 block">Subida (Upload)</span>
              <span id="netUpload" class="text-2xl font-black text-sky-400">0.0 MB/s</span>
              <span id="netUploadKb" class="text-[11px] text-slate-500 font-mono block">(0.0 KB/s)</span>
            </div>
            <svg class="w-8 h-8 text-sky-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
          </div>
        </div>

        <!-- Diagnóstico de Red & Interfaces Agregadas -->
        <div class="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">Paquetes Descartados (Drop):</span>
            <span id="netDropValue" class="font-mono text-slate-200">0.0%</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">Errores de Transmisión/Recepción:</span>
            <span id="netErrorsValue" class="font-mono text-slate-200">0</span>
          </div>
          <div class="pt-2 border-t border-slate-800/80 text-xs">
            <span class="text-slate-400 block mb-1">Interfaces Físicas Agregadas:</span>
            <div id="activeNicsContainer" class="flex flex-wrap gap-1.5">
              <span class="px-2 py-0.5 bg-slate-800 rounded text-slate-300 text-[11px] font-mono">Cargando...</span>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 flex justify-between">
        <span>Consolidación automática (Excluye loopback e inactivas)</span>
        <span>Umbral de Alerta: &gt; 0% Drop</span>
      </div>
    </section>

  </main>

  <!-- Script Cliente con Reconexión y Manejo Resiliente -->
  <script>
    let socket = null;
    let retryTimeout = null;
    let retryDelay = 1000;
    let sampleCount = 0;

    const banner = document.getElementById('connectionBanner');
    const bannerStatus = document.getElementById('bannerStatusBadge');
    const socketStatusText = document.getElementById('socketStatusText');
    const liveDot = document.getElementById('headerLiveDot');
    const sampleCounter = document.getElementById('sampleCounter');

    function updateBadge(el, status, text) {
      if (!el) return;
      el.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-full border ';
      if (status === 'ok') el.classList.add('status-ok');
      else if (status === 'warning') el.classList.add('status-warning');
      else if (status === 'critical') el.classList.add('status-critical');
      else el.classList.add('status-unknown');
      el.textContent = text || (status ? status.toUpperCase() : 'N/A');
    }

    function renderMetrics(data) {
      sampleCount++;
      sampleCounter.textContent = sampleCount;

      // 1. CPU
      const cpu = data.cpu || {};
      document.getElementById('cpuUsage').textContent = (cpu.usage_percent !== undefined ? cpu.usage_percent : '--') + '%';
      document.getElementById('cpuFreq').textContent = cpu.frequency_current_ghz ? cpu.frequency_current_ghz + ' GHz' : 'N/A';
      document.getElementById('cpuFreqMax').textContent = cpu.frequency_max_ghz ? cpu.frequency_max_ghz + ' GHz' : 'N/A';
      document.getElementById('cpuTemp').textContent = cpu.temperature_c !== null && cpu.temperature_c !== undefined ? cpu.temperature_c + ' °C' : 'N/A';
      document.getElementById('coreCount').textContent = cpu.core_count || (cpu.cores ? cpu.cores.length : '--');
      updateBadge(document.getElementById('cpuBadge'), cpu.status);

      // Core Breakdown Grid
      const coreGrid = document.getElementById('coreGrid');
      if (cpu.cores && Array.isArray(cpu.cores)) {
        if (coreGrid.children.length !== cpu.cores.length) {
          coreGrid.innerHTML = '';
          cpu.cores.forEach((_, idx) => {
            const div = document.createElement('div');
            div.className = 'bg-slate-900/90 border border-slate-800 p-2 rounded-lg text-center';
            div.innerHTML = `
              <div class="text-[10px] text-slate-400 font-mono mb-1">#${idx}</div>
              <div class="w-full bg-slate-800 rounded-full h-1.5 mb-1 overflow-hidden">
                <div id="core-bar-${idx}" class="h-full bg-indigo-500 transition-all duration-300" style="width: 0%"></div>
              </div>
              <div id="core-val-${idx}" class="text-[10px] font-mono text-slate-200">0%</div>
            `;
            coreGrid.appendChild(div);
          });
        }
        cpu.cores.forEach((val, idx) => {
          const bar = document.getElementById(`core-bar-${idx}`);
          const text = document.getElementById(`core-val-${idx}`);
          if (bar) {
            bar.style.width = Math.min(100, Math.max(0, val)) + '%';
            bar.className = 'h-full transition-all duration-300 ' + (val >= 90 ? 'bg-rose-500' : val >= 70 ? 'bg-amber-400' : 'bg-indigo-500');
          }
          if (text) text.textContent = val + '%';
        });
      }

      // 2. RAM & Swap
      const ram = data.ram || {};
      const swap = data.swap || {};
      document.getElementById('ramDetail').textContent = `${ram.used_gb || 0} / ${ram.total_gb || 0} GB (${ram.percent || 0}%)`;
      document.getElementById('ramFreeDetail').textContent = `Disponible: ${((ram.total_gb || 0) - (ram.used_gb || 0)).toFixed(1)} GB`;
      const ramBar = document.getElementById('ramBar');
      ramBar.style.width = Math.min(100, ram.percent || 0) + '%';
      ramBar.className = 'h-full rounded-full transition-all duration-300 ' + (ram.percent >= 90 ? 'bg-rose-500' : ram.percent >= 70 ? 'bg-amber-400' : 'bg-emerald-500');
      updateBadge(document.getElementById('ramBadge'), ram.status);

      document.getElementById('swapDetail').textContent = `${swap.used_gb || 0} / ${swap.total_gb || 0} GB (${swap.percent || 0}%)`;
      const swapBar = document.getElementById('swapBar');
      swapBar.style.width = Math.min(100, swap.percent || 0) + '%';
      swapBar.className = 'h-full rounded-full transition-all duration-300 ' + (swap.percent >= 50 ? 'bg-rose-500' : swap.percent >= 30 ? 'bg-amber-400' : 'bg-indigo-500');
      updateBadge(document.getElementById('swapBadge'), swap.status);

      // 3. Storage
      const storage = data.storage || {};
      const io = storage.io || {};
      document.getElementById('diskReadSpeed').textContent = `${io.read_mb_s || 0.0} MB/s`;
      document.getElementById('diskWriteSpeed').textContent = `${io.write_mb_s || 0.0} MB/s`;
      document.getElementById('diskActiveTime').textContent = `${io.active_time_percent || 0.0}%`;
      updateBadge(document.getElementById('diskActiveBadge'), io.active_time_status, `ACTIVO: ${io.active_time_percent || 0.0}%`);

      const partContainer = document.getElementById('partitionsContainer');
      if (storage.partitions && Array.isArray(storage.partitions)) {
        partContainer.innerHTML = '';
        storage.partitions.forEach(p => {
          const partDiv = document.createElement('div');
          partDiv.className = 'bg-slate-900/60 p-3 rounded-xl border border-slate-800';
          partDiv.innerHTML = `
            <div class="flex justify-between items-center text-xs mb-1.5">
              <div class="flex items-center space-x-2">
                <span class="font-bold text-slate-200">${p.mountpoint || p.device}</span>
                <span class="text-[10px] text-slate-500 uppercase font-mono">(${p.fstype || 'NTFS'})</span>
              </div>
              <span class="font-mono text-slate-300">${p.used_gb} / ${p.total_gb} GB (${p.percent}%)</span>
            </div>
            <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300 ${p.percent >= 95 ? 'bg-rose-500' : p.percent >= 80 ? 'bg-amber-400' : 'bg-sky-500'}" style="width: ${Math.min(100, p.percent)}%"></div>
            </div>
          `;
          partContainer.appendChild(partDiv);
        });
      }

      // 4. Network
      const net = data.network || {};
      document.getElementById('netDownload').textContent = `${net.download_mb_s || 0.0} MB/s`;
      document.getElementById('netDownloadKb').textContent = `(${net.download_kb_s || 0.0} KB/s)`;
      document.getElementById('netUpload').textContent = `${net.upload_mb_s || 0.0} MB/s`;
      document.getElementById('netUploadKb').textContent = `(${net.upload_kb_s || 0.0} KB/s)`;
      document.getElementById('netDropValue').textContent = `${net.packet_drop_percent || 0.0}%`;
      document.getElementById('netErrorsValue').textContent = `${net.errors_count || 0}`;
      updateBadge(document.getElementById('packetDropBadge'), net.packet_drop_status, `DROP: ${net.packet_drop_percent || 0.0}%`);

      const nicsContainer = document.getElementById('activeNicsContainer');
      if (net.active_interfaces && Array.isArray(net.active_interfaces)) {
        nicsContainer.innerHTML = '';
        if (net.active_interfaces.length === 0) {
          nicsContainer.innerHTML = '<span class="text-slate-500 text-xs">Sin interfaces físicas activas</span>';
        } else {
          net.active_interfaces.forEach(nic => {
            const badge = document.createElement('span');
            badge.className = 'px-2 py-0.5 bg-slate-800 border border-slate-700/80 rounded text-slate-300 text-[11px] font-mono';
            badge.textContent = nic;
            nicsContainer.appendChild(badge);
          });
        }
      }
    }

    function initWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        banner.classList.add('hidden');
        socketStatusText.textContent = 'CONECTADO';
        socketStatusText.className = 'text-emerald-400 font-semibold';
        liveDot.className = 'h-3.5 w-3.5 rounded-full bg-emerald-500 animate-pulse';
        retryDelay = 1000;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          renderMetrics(data);
        } catch (err) {
          console.error('Error parseando payload JSON:', err);
        }
      };

      socket.onclose = () => {
        banner.classList.remove('hidden');
        bannerStatus.textContent = 'RECONECTANDO (' + (retryDelay / 1000) + 's)';
        socketStatusText.textContent = 'RECONECTANDO';
        socketStatusText.className = 'text-amber-400 font-semibold';
        liveDot.className = 'h-3.5 w-3.5 rounded-full bg-amber-500';

        clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(16000, retryDelay * 2);
          initWebSocket();
        }, retryDelay);
      };

      socket.onerror = (err) => {
        console.error('Error en WebSocket:', err);
        socket.close();
      };
    }

    window.addEventListener('DOMContentLoaded', initWebSocket);
  </script>
</body>
</html>
"""


# =====================================================================
# PUNTO DE ENTRADA DIRECTO
# =====================================================================
if __name__ == "__main__":
    import uvicorn
    logger.info("Iniciando servidor Uvicorn en http://0.0.0.0:8000")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False, access_log=False)

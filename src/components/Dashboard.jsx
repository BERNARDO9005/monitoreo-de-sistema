import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Wifi,
  AlertTriangle,
  Server,
  Zap,
  ArrowDown,
  ArrowUp,
  Clock,
  ShieldCheck,
  Radio
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

/**
 * Función auxiliar para obtener las clases CSS de colores correspondientes a los umbrales
 * 'ok', 'warning', 'critical' y 'unknown'.
 */
function getStatusStyles(status) {
  switch (status) {
    case 'ok':
      return {
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        dot: 'bg-emerald-500',
        bar: 'bg-emerald-500',
        text: 'text-emerald-400'
      };
    case 'warning':
      return {
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        dot: 'bg-amber-500',
        bar: 'bg-amber-400',
        text: 'text-amber-400'
      };
    case 'critical':
      return {
        badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        dot: 'bg-rose-500',
        bar: 'bg-rose-500',
        text: 'text-rose-400'
      };
    default:
      return {
        badge: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        dot: 'bg-slate-500',
        bar: 'bg-slate-500',
        text: 'text-slate-400'
      };
  }
}

/**
 * Formatea una marca de tiempo en segundos a formato de hora legible HH:MM:SS
 */
function formatTime(unixSec) {
  if (!unixSec) return '';
  const date = new Date(unixSec * 1000);
  return date.toTimeString().split(' ')[0];
}

export function Dashboard() {
  // Conexión dinámica: determina automáticamente si es ws: o wss: y usa el puerto 8000 por defecto
  const wsUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'ws://localhost:8000/ws';
    const isSecure = window.location.protocol === 'https:';
    // Si la app corre en Vite (puerto 5173 u otro), apunta al puerto 8000 de FastAPI
    const host = window.location.hostname || 'localhost';
    return `${isSecure ? 'wss:' : 'ws:'}//${host}:8000/ws`;
  }, []);

  const { status, data, error } = useWebSocket(wsUrl);

  // Buffers fijos para gráficos históricos (estrictamente máximo 60 muestras / 30 segundos)
  const [cpuHistory, setCpuHistory] = useState([]);
  const [netHistory, setNetHistory] = useState([]);

  // Actualización de buffers fijos con corte defensivo slice(-60)
  useEffect(() => {
    if (!data) return;

    const timeLabel = formatTime(data.timestamp);

    // Buffer de CPU
    setCpuHistory((prev) => {
      const point = {
        time: timeLabel,
        usage: data.cpu?.usage_percent || 0
      };
      const updated = [...prev, point];
      return updated.slice(-60);
    });

    // Buffer de Red
    setNetHistory((prev) => {
      const point = {
        time: timeLabel,
        download: data.network?.download_mb_s || 0,
        upload: data.network?.upload_mb_s || 0
      };
      const updated = [...prev, point];
      return updated.slice(-60);
    });
  }, [data]);

  // Si aún no hay datos iniciales de telemetría
  const isInitialLoading = !data && status === 'CONNECTING';

  const isConnected = status === 'CONNECTED';
  const cpu = data?.cpu || {};
  const ram = data?.ram || {};
  const swap = data?.swap || {};
  const storage = data?.storage || {};
  const io = storage.io || {};
  const partitions = storage.partitions || [];
  const network = data?.network || {};

  const cpuStyles = getStatusStyles(cpu.status);
  const ramStyles = getStatusStyles(ram.status);
  const swapStyles = getStatusStyles(swap.status);
  const diskActiveStyles = getStatusStyles(io.active_time_status);
  const packetDropStyles = getStatusStyles(network.packet_drop_status);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-4 md:p-6 lg:p-8 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      
      {/* Banner de Estado de Conexión y Resistencia a Desconexión */}
      {!isConnected && (
        <div className="mb-6 p-4 rounded-2xl border border-amber-500/40 bg-amber-950/30 backdrop-blur-md text-amber-200 flex items-center justify-between shadow-2xl transition-all animate-in fade-in duration-300">
          <div className="flex items-center space-x-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-200">
                {status === 'RECONNECTING'
                  ? 'Conexión interrumpida con el backend de telemetría'
                  : 'Intentando establecer conexión con el servidor nativo...'}
              </p>
              <p className="text-xs text-amber-300/80">
                Visualización congelada en la última muestra para prevenir pérdida de contexto. Reintentando automáticamente con backoff exponencial.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase bg-amber-900/60 border border-amber-700/50 px-3 py-1 rounded-lg text-amber-300">
              {status}
            </span>
          </div>
        </div>
      )}

      {/* Cabecera Principal */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                Dashboard de Monitoreo de Sistema Operativo
                <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                  v2.0 Nativo
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Telemetría nativa a bajo nivel &bull; Ciclo de muestreo: 500 ms &bull; Modo asíncrono no bloqueante
              </p>
            </div>
          </div>
        </div>

        {/* Indicadores de Conexión del Header */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          <div className="bg-[#1e293b] border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center space-x-2 shadow-sm">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-slate-400">ENLACE:</span>
            <span className={isConnected ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {status}
            </span>
          </div>

          <div className="bg-[#1e293b] border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center space-x-2 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">ÚLTIMA LECTURA:</span>
            <span className="text-indigo-300 font-semibold">
              {data?.timestamp ? formatTime(data.timestamp) : '--:--:--'}
            </span>
          </div>

          <div className="bg-[#1e293b] border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center space-x-2 shadow-sm">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">HISTORIAL:</span>
            <span className="text-slate-200 font-semibold">{cpuHistory.length} / 60</span>
          </div>
        </div>
      </header>

      {/* Pantalla de carga inicial si aún no conectó */}
      {isInitialLoading && (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium">Sincronizando socket de telemetría del sistema...</p>
        </div>
      )}

      {/* Maquetación Principal: CSS Grid de 4 Cuadrantes */}
      {data && (
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* =========================================================
              CUADRANTE 1: UNIDAD CENTRAL DE PROCESAMIENTO (CPU)
             ========================================================= */}
          <section className="bg-[#1e293b] border border-slate-700/70 rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div>
              {/* Encabezado del Cuadrante */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-wide">Procesador (CPU)</h2>
                    <p className="text-xs text-slate-400">Carga global, frecuencias y desglose monohilo</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${cpuStyles.badge}`}>
                    {cpu.status ? cpu.status.toUpperCase() : 'OK'}
                  </span>
                </div>
              </div>

              {/* Indicadores Principales */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/90">
                  <span className="text-xs text-slate-400 block mb-1">Carga Global</span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl md:text-3xl font-black text-white">{cpu.usage_percent ?? 0}</span>
                    <span className="text-sm font-semibold text-slate-400">%</span>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/90">
                  <span className="text-xs text-slate-400 block mb-1">Frecuencia Reloj</span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl md:text-3xl font-black text-white">
                      {cpu.frequency_current_ghz !== null ? cpu.frequency_current_ghz : 'N/A'}
                    </span>
                    {cpu.frequency_current_ghz !== null && (
                      <span className="text-xs font-semibold text-slate-400">GHz</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Máx: {cpu.frequency_max_ghz ? `${cpu.frequency_max_ghz} GHz` : 'N/A'}
                  </span>
                </div>

                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/90">
                  <span className="text-xs text-slate-400 block mb-1">Temperatura</span>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl md:text-3xl font-black text-white">
                      {cpu.temperature_c !== null ? cpu.temperature_c : 'N/A'}
                    </span>
                    {cpu.temperature_c !== null && (
                      <span className="text-xs font-semibold text-slate-400">°C</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {cpu.temperature_c !== null
                      ? `Estado: ${cpu.temperature_status}`
                      : 'Sensor Windows (WMI/ACPI)'}
                  </span>
                </div>
              </div>

              {/* Gráfico Histórico en Tiempo Real (Recharts - 60 muestras) */}
              <div className="mb-6 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/90">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    Historial de Carga (Últimas 60 muestras)
                  </span>
                  <span className="text-xs font-mono text-indigo-400 font-bold">{cpu.usage_percent}%</span>
                </div>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cpuHistory} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis dataKey="time" hide={true} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                          color: '#f8fafc'
                        }}
                        formatter={(val) => [`${val}%`, 'Uso']}
                      />
                      <Area
                        type="monotone"
                        dataKey="usage"
                        stroke="#818cf8"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#cpuGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Matriz de Núcleos / Core Breakdown (Monitoreo de Single-Thread Bottlenecks) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Desglose por Núcleo ({cpu.core_count ?? (cpu.cores?.length || 0)} Hilos Lógicos)
                  </span>
                  <span className="text-[11px] text-slate-400">Bottleneck &gt; 90%</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {cpu.cores && cpu.cores.map((coreVal, idx) => {
                    const isHigh = coreVal >= 90;
                    const isMed = coreVal >= 70 && coreVal < 90;
                    const barColor = isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-400' : 'bg-indigo-500';
                    return (
                      <div
                        key={idx}
                        className="bg-slate-900/90 border border-slate-800/90 p-2 rounded-xl text-center shadow-inner"
                      >
                        <div className="text-[10px] text-slate-400 font-mono mb-1">C{idx}</div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1 overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all duration-300`}
                            style={{ width: `${Math.min(100, Math.max(0, coreVal))}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-mono font-bold text-slate-200">
                          {coreVal}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Umbrales: &lt; 70% (OK) &bull; 70-90% (Alerta) &bull; &gt; 90% (Crítico)</span>
              <span>Temperatura &gt; 80°C (Alerta Térmica)</span>
            </div>
          </section>

          {/* =========================================================
              CUADRANTE 2: MEMORIA DEL SISTEMA (RAM & SWAP)
             ========================================================= */}
          <section className="bg-[#1e293b] border border-slate-700/70 rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div>
              {/* Encabezado */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-wide">Memoria (RAM & Swap)</h2>
                    <p className="text-xs text-slate-400">Capacidad física y archivo de paginación</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${ramStyles.badge}`}>
                  {ram.status ? ram.status.toUpperCase() : 'OK'}
                </span>
              </div>

              {/* Tarjeta de Memoria RAM Física */}
              <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800/90 mb-5">
                <div className="flex justify-between items-center mb-2.5">
                  <div>
                    <span className="text-sm font-bold text-slate-200 block">Memoria RAM Física</span>
                    <span className="text-xs text-slate-400">
                      Disponible: {((ram.total_gb || 0) - (ram.used_gb || 0)).toFixed(1)} GB
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-white font-mono">{ram.used_gb ?? 0}</span>
                    <span className="text-xs text-slate-400 font-mono"> / {ram.total_gb ?? 0} GB</span>
                    <span className="block text-xs font-bold text-emerald-400">({ram.percent ?? 0}%)</span>
                  </div>
                </div>

                {/* Barra de progreso con color reactivo */}
                <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${ramStyles.bar}`}
                    style={{ width: `${Math.min(100, ram.percent || 0)}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 mt-2 font-mono">
                  <span>0%</span>
                  <span>Alerta: &gt; 70% | Crítico: &gt; 90%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Tarjeta de Memoria Swap / Paginación */}
              <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800/90 mb-5">
                <div className="flex justify-between items-center mb-2.5">
                  <div className="flex items-center space-x-2">
                    <div>
                      <span className="text-sm font-bold text-slate-200 block">Swap / Archivo de Paginación</span>
                      <span className="text-xs text-slate-400">Detección temprana de saturación RAM</span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${swapStyles.badge}`}>
                      {swap.status ? swap.status.toUpperCase() : 'OK'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-white font-mono">{swap.used_gb ?? 0}</span>
                    <span className="text-xs text-slate-400 font-mono"> / {swap.total_gb ?? 0} GB</span>
                    <span className="block text-xs font-bold text-amber-400">({swap.percent ?? 0}%)</span>
                  </div>
                </div>

                {/* Barra de progreso de Swap */}
                <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${swapStyles.bar}`}
                    style={{ width: `${Math.min(100, swap.percent || 0)}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 mt-2 font-mono">
                  <span>0%</span>
                  <span>Alerta: &gt; 30% | Crítico: &gt; 50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Resumen de Asignación */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-xs text-slate-400 block">Total Físico + Virtual</span>
                  <span className="text-lg font-bold text-white font-mono">
                    {((ram.total_gb || 0) + (swap.total_gb || 0)).toFixed(1)} GB
                  </span>
                </div>
                <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-xs text-slate-400 block">En Uso Consolidado</span>
                  <span className="text-lg font-bold text-indigo-400 font-mono">
                    {((ram.used_gb || 0) + (swap.used_gb || 0)).toFixed(1)} GB
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Supervisión de fallos de página y prevención OOM</span>
              <span>Protección activa contra trashing</span>
            </div>
          </section>

          {/* =========================================================
              CUADRANTE 3: ALMACENAMIENTO (HDD / SSD)
             ========================================================= */}
          <section className="bg-[#1e293b] border border-slate-700/70 rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div>
              {/* Encabezado */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-wide">Almacenamiento (HDD / SSD)</h2>
                    <p className="text-xs text-slate-400">Tasas de transferencia I/O, tiempo de actividad y particiones</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${diskActiveStyles.badge}`}>
                  ACTIVO: {io.active_time_percent ?? 0}%
                </span>
              </div>

              {/* Métricas de Transferencia I/O & Tiempo Ocupado */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/90">
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
                    <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
                    <span>Lectura I/O</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-xl md:text-2xl font-black text-sky-400 font-mono">
                      {io.read_mb_s ?? 0}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">MB/s</span>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/90">
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
                    <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Escritura I/O</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-xl md:text-2xl font-black text-indigo-400 font-mono">
                      {io.write_mb_s ?? 0}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">MB/s</span>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/90">
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tiempo Activo</span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-xl md:text-2xl font-black text-white font-mono">
                      {io.active_time_percent ?? 0}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">%</span>
                  </div>
                </div>
              </div>

              {/* Lista Dinámica de Particiones */}
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-3">
                  Puntos de Montaje ({partitions.length} Unidades Activas)
                </span>
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {partitions.map((part, index) => {
                    const partStyles = getStatusStyles(part.status);
                    return (
                      <div
                        key={index}
                        className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800/90"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{part.mountpoint || part.device}</span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                              {part.fstype || 'NTFS'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono text-slate-300 font-semibold">
                              {part.used_gb} / {part.total_gb} GB
                            </span>
                            <span className={`ml-2 text-xs font-bold ${partStyles.text}`}>
                              ({part.percent}%)
                            </span>
                          </div>
                        </div>

                        {/* Barra de partición */}
                        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${partStyles.bar}`}
                            style={{ width: `${Math.min(100, part.percent)}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                          <span>Libre: {part.free_gb} GB</span>
                          <span className={partStyles.text}>Estado: {part.status.toUpperCase()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Umbrales partición: &lt; 80% (OK) &bull; 80-95% (Alerta) &bull; &gt; 95% (Crítico)</span>
              <span>Actividad disco &gt; 85% (Saturación I/O)</span>
            </div>
          </section>

          {/* =========================================================
              CUADRANTE 4: INTERFAZ DE RED (INTERNET / LAN)
             ========================================================= */}
          <section className="bg-[#1e293b] border border-slate-700/70 rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div>
              {/* Encabezado */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-wide">Red (Internet / LAN)</h2>
                    <p className="text-xs text-slate-400">Tráfico consolidado de interfaces físicas activas</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${packetDropStyles.badge}`}>
                  DROP: {network.packet_drop_percent ?? 0}%
                </span>
              </div>

              {/* Tarjetas de Ancho de Banda en Tiempo Real */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/90 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
                      <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Bajada (Download)</span>
                    </div>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        {network.download_mb_s ?? 0}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">MB/s</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                      ({network.download_kb_s ?? 0} KB/s)
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400">
                    <ArrowDown className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/90 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
                      <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
                      <span>Subida (Upload)</span>
                    </div>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-2xl font-black text-sky-400 font-mono">
                        {network.upload_mb_s ?? 0}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">MB/s</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                      ({network.upload_kb_s ?? 0} KB/s)
                    </span>
                  </div>
                  <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400">
                    <ArrowUp className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Gráfico Dual en Tiempo Real (Recharts - 60 muestras) */}
              <div className="mb-5 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/90">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-violet-400" />
                    Tráfico en Tiempo Real (MB/s)
                  </span>
                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Download
                    </span>
                    <span className="flex items-center gap-1 text-sky-400">
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span> Upload
                    </span>
                  </div>
                </div>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={netHistory} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dlGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="ulGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis dataKey="time" hide={true} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                          color: '#f8fafc'
                        }}
                        formatter={(val, name) => [`${val} MB/s`, name === 'download' ? 'Download' : 'Upload']}
                      />
                      <Area
                        type="monotone"
                        dataKey="download"
                        stroke="#34d399"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#dlGradient)"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="upload"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#ulGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Diagnóstico de Calidad y Lista de Interfaces Físicas Agregadas */}
              <div className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800/90 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Paquetes Descartados (Drop):</span>
                  <span className="font-mono font-bold text-slate-200">
                    {network.packet_drop_percent ?? 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Errores de Transmisión/Recepción:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {network.errors_count ?? 0}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-xs text-slate-400 block mb-1.5">
                    Interfaces Físicas Consolidadas:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {network.active_interfaces && network.active_interfaces.length > 0 ? (
                      network.active_interfaces.map((nic, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 bg-slate-800/90 border border-slate-700/70 rounded-md text-slate-300 text-[11px] font-mono"
                        >
                          {nic}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">Sin interfaces físicas activas</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Agregación inteligente (Excluye loopback y desconectadas)</span>
              <span>Drop &gt; 5% (Crítico)</span>
            </div>
          </section>

        </main>
      )}

      {/* Pie de página con créditos técnicos */}
      <footer className="mt-8 pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <span>Arquitectura Full-Stack de Monitoreo de Sistema Operativo Nativo</span>
        <span className="font-mono">FastAPI + Uvicorn + WebSockets + React + Vite + Tailwind CSS</span>
      </footer>

    </div>
  );
}

export default Dashboard;

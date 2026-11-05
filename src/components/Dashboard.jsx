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
  Radio,
  Search,
  Flame,
  Trash2,
  XCircle,
  CheckCircle2,
  AlertOctagon,
  Terminal,
  Layers,
  User,
  X,
  Pin,
  PinOff,
  Minimize2,
  Minus
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { MiniWidget } from './MiniWidget';

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

  // Estado para el Administrador de Procesos
  const [sortMode, setSortMode] = useState('cpu'); // 'cpu' | 'memory'
  const [searchQuery, setSearchQuery] = useState('');
  const [targetProcToKill, setTargetProcToKill] = useState(null);
  const [isKilling, setIsKilling] = useState(false);
  const [toast, setToast] = useState(null);

  // Estado para Modo Mini-Widget y Always-on-Top
  const [windowMode, setWindowMode] = useState('normal'); // 'normal' | 'widget'
  const [isOnTop, setIsOnTop] = useState(false);

  // Sincronizar estado con telemetría del backend si cambia externamente (ej. desde menú de bandeja)
  useEffect(() => {
    if (data?.window) {
      if (data.window.mode && data.window.mode !== windowMode) {
        setWindowMode(data.window.mode);
      }
      if (data.window.on_top !== undefined) {
        setIsOnTop(data.window.on_top);
      }
    }
  }, [data?.window]);

  // Manejadores de control de ventana nativa
  const handleSetWindowMode = async (mode) => {
    setWindowMode(mode);
    try {
      await fetch(`${apiBaseUrl}/api/window/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
    } catch (err) {
      console.debug('Aviso: endpoint de ventana no respondió o corre en navegador web puro:', err);
    }
  };

  const handleTogglePin = async () => {
    const nextVal = !isOnTop;
    setIsOnTop(nextVal);
    try {
      await fetch(`${apiBaseUrl}/api/window/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on_top: nextVal })
      });
    } catch (err) {
      console.debug('Aviso: error toggling pin:', err);
    }
  };

  const handleMinimizeToTray = async () => {
    try {
      await fetch(`${apiBaseUrl}/api/window/minimize`, {
        method: 'POST'
      });
    } catch (err) {
      console.debug('Aviso: error enviando a bandeja:', err);
    }
  };

  // Auto-cierre de alertas emergentes (Toast) tras 4 segundos
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // URL base para peticiones HTTP a la API REST de FastAPI
  const apiBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'http://localhost:8000';
    const proto = window.location.protocol;
    const host = window.location.hostname || 'localhost';
    const port = window.location.port === '5173' ? '8000' : (window.location.port || (proto === 'https:' ? '443' : '80'));
    return `${proto}//${host}:${port}`;
  }, []);

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

  // Procesos en tiempo real
  const processes = data?.processes || { total_count: 0, top_cpu: [], top_memory: [] };
  const currentProcessList = sortMode === 'cpu' ? (processes.top_cpu || []) : (processes.top_memory || []);

  const [serverSearchResults, setServerSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Búsqueda en segundo plano que abarca todo el sistema operativo si se escribe un término
  useEffect(() => {
    if (!searchQuery.trim()) {
      setServerSearchResults(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${apiBaseUrl}/api/processes?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const json = await res.json();
          setServerSearchResults(json.processes || []);
        }
      } catch (err) {
        console.error("Error buscando procesos:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, apiBaseUrl]);

  // Selección de lista activa: Top 10 en vivo o resultados de búsqueda
  const displayProcesses = useMemo(() => {
    if (!searchQuery.trim()) {
      return currentProcessList.slice(0, 10);
    }
    if (serverSearchResults !== null) {
      return serverSearchResults;
    }
    const query = searchQuery.toLowerCase().trim();
    return currentProcessList.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        String(p.pid).includes(query) ||
        (p.username && p.username.toLowerCase().includes(query))
    );
  }, [searchQuery, serverSearchResults, currentProcessList]);

  const confirmKillProcess = async () => {
    if (!targetProcToKill) return;
    setIsKilling(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/processes/${targetProcToKill.pid}/kill`, {
        method: 'POST'
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setToast({
          type: 'success',
          message: result.message || `Proceso '${targetProcToKill.name}' finalizado correctamente.`
        });
        setTargetProcToKill(null);
        if (searchQuery.trim()) {
          const res = await fetch(`${apiBaseUrl}/api/processes?q=${encodeURIComponent(searchQuery.trim())}`);
          if (res.ok) {
            const json = await res.json();
            setServerSearchResults(json.processes || []);
          }
        }
      } else {
        setToast({
          type: 'error',
          message: result.error || 'No se pudo finalizar el proceso seleccionado.'
        });
      }
    } catch (err) {
      setToast({ type: 'error', message: `Error de comunicación con el backend: ${err.message}` });
    } finally {
      setIsKilling(false);
    }
  };

  if (windowMode === 'widget') {
    return (
      <MiniWidget
        data={data}
        isOnTop={isOnTop}
        onTogglePin={handleTogglePin}
        onExpand={() => handleSetWindowMode('normal')}
        onMinimizeToTray={handleMinimizeToTray}
      />
    );
  }

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

      {/* =========================================================
          SECCIÓN COMPLETA: ADMINISTRADOR DE PROCESOS EN TIEMPO REAL
         ========================================================= */}
      {data && (
        <section className="mt-8 bg-[#1e293b] border border-slate-700/70 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          {/* Header de la sección */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 pb-5 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-white tracking-wide">
                    Administrador de Procesos del Sistema
                  </h2>
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {processes.total_count ?? 0} Procesos Activos
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Telemetría en tiempo real con ranking Top 10 CPU / RAM, buscador y terminación segura
                </p>
              </div>
            </div>

            {/* Controles: Ordenamiento y Búsqueda */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Selector de ordenamiento Top 10 */}
              <div className="bg-slate-900/90 border border-slate-800 p-1 rounded-2xl flex items-center">
                <button
                  onClick={() => {
                    setSortMode('cpu');
                    setSearchQuery('');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    sortMode === 'cpu' && !searchQuery
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Top 10 CPU
                </button>
                <button
                  onClick={() => {
                    setSortMode('memory');
                    setSearchQuery('');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    sortMode === 'memory' && !searchQuery
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Top 10 Memoria RAM
                </button>
              </div>

              {/* Barra de búsqueda interactiva */}
              <div className="flex flex-col">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar (ej. chrome, node, python)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full sm:w-64 bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 rounded-2xl pl-9 pr-8 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {isSearching ? (
                    <div className="w-3 h-3 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  ) : searchQuery ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Filtros rápidos / Tags */}
          <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
            <span className="text-[11px] text-slate-400 font-medium">Filtro rápido:</span>
            {['chrome', 'node', 'python', 'code', 'explorer'].map((tag) => (
              <button
                key={tag}
                onClick={() => setSearchQuery(searchQuery.toLowerCase() === tag ? '' : tag)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-mono transition-all ${
                  searchQuery.toLowerCase() === tag
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {tag}
              </button>
            ))}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 ml-1 underline transition-colors"
              >
                Restablecer vista Top 10
              </button>
            )}
          </div>

          {/* Tabla de Procesos */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[11px] font-mono text-slate-400 uppercase border-b border-slate-800/80">
                  <th className="pb-3 pl-3 font-semibold">Proceso / Aplicación</th>
                  <th className="pb-3 px-3 font-semibold">PID</th>
                  <th className="pb-3 px-3 font-semibold">Usuario</th>
                  <th className="pb-3 px-3 font-semibold">Uso CPU</th>
                  <th className="pb-3 px-3 font-semibold">Memoria RAM</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayProcesses.length > 0 ? (
                  displayProcesses.map((proc) => {
                    const cpuPercent = proc.cpu_percent ?? 0;
                    const isHighCpu = cpuPercent >= 30;
                    const isMedCpu = cpuPercent >= 10;
                    const cpuColor = isHighCpu
                      ? 'text-rose-400'
                      : isMedCpu
                      ? 'text-amber-400'
                      : 'text-indigo-300';
                    const cpuBarColor = isHighCpu
                      ? 'bg-rose-500'
                      : isMedCpu
                      ? 'bg-amber-400'
                      : 'bg-indigo-500';

                    const isProtected = proc.pid <= 4;

                    return (
                      <tr
                        key={proc.pid}
                        className="hover:bg-slate-900/50 transition-colors group"
                      >
                        {/* Nombre y tipo */}
                        <td className="py-3 pl-3">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 shrink-0">
                              <Layers className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            <span className="font-semibold text-slate-200 text-sm group-hover:text-white transition-colors truncate max-w-[180px] sm:max-w-xs block">
                              {proc.name}
                            </span>
                          </div>
                        </td>

                        {/* PID */}
                        <td className="py-3 px-3">
                          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                            #{proc.pid}
                          </span>
                        </td>

                        {/* Usuario */}
                        <td className="py-3 px-3">
                          <div className="flex items-center space-x-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span
                              className="font-mono text-xs text-slate-300 truncate max-w-[110px]"
                              title={proc.raw_username || proc.username}
                            >
                              {proc.username || 'SYSTEM'}
                            </span>
                          </div>
                        </td>

                        {/* CPU */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className={`font-mono font-bold ${cpuColor}`}>
                                {cpuPercent}%
                              </span>
                            </div>
                            <div className="w-20 sm:w-28 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${cpuBarColor} transition-all duration-300`}
                                style={{ width: `${Math.min(100, Math.max(0, cpuPercent * 2))}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* RAM */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2 font-mono">
                              <span className="text-emerald-400 font-bold">
                                {proc.memory_mb} MB
                              </span>
                              <span className="text-slate-500 text-[10px]">
                                ({proc.memory_percent}%)
                              </span>
                            </div>
                            <div className="w-20 sm:w-28 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, proc.memory_percent * 4))}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Acciones */}
                        <td className="py-3 pr-3 text-right">
                          <button
                            onClick={() => setTargetProcToKill(proc)}
                            disabled={isProtected}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                              isProtected
                                ? 'opacity-35 cursor-not-allowed text-slate-600 bg-slate-900 border border-slate-800'
                                : 'text-slate-400 hover:text-rose-300 bg-slate-900/80 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/40'
                            }`}
                            title={isProtected ? 'Proceso protegido del sistema' : 'Finalizar proceso'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Finalizar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Search className="w-8 h-8 text-slate-600" />
                        <p className="text-sm font-medium">
                          No se encontraron procesos que coincidan con "{searchQuery}"
                        </p>
                        <button
                          onClick={() => setSearchQuery('')}
                          className="text-xs text-indigo-400 hover:underline"
                        >
                          Restablecer a Top 10
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span>
              {searchQuery ? (
                <>Resultados de búsqueda: <b className="text-white font-mono">{displayProcesses.length}</b> procesos encontrados para "{searchQuery}"</>
              ) : (
                <>Mostrando ranking <b className="text-white font-mono">Top 10</b> ordenado por <span className="text-indigo-300 font-semibold">{sortMode === 'cpu' ? 'Carga de CPU' : 'Memoria RAM'}</span>.</>
              )}
            </span>
            <span className="text-slate-500 font-mono">
              Ciclo de telemetría: 1.5s &bull; API de control: /api/processes
            </span>
          </div>
        </section>
      )}

      {/* Modal de Confirmación para Finalizar Proceso */}
      {targetProcToKill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1e293b] border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Finalizar Proceso</h3>
                <p className="text-xs text-slate-400">Acción crítica del sistema operativo</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              ¿Estás seguro de que deseas forzar la finalización de <span className="font-mono font-bold text-rose-300 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-800/40">{targetProcToKill.name}</span> (PID: <span className="font-mono text-white font-bold">{targetProcToKill.pid}</span>)?
            </p>

            <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <div className="flex justify-between">
                <span>Usuario:</span>
                <span className="font-mono font-bold text-slate-200">{targetProcToKill.username || 'SYSTEM'}</span>
              </div>
              <div className="flex justify-between">
                <span>Carga de CPU:</span>
                <span className="font-mono font-bold text-slate-200">{targetProcToKill.cpu_percent}%</span>
              </div>
              <div className="flex justify-between">
                <span>Memoria RAM ocupada:</span>
                <span className="font-mono font-bold text-slate-200">{targetProcToKill.memory_mb} MB ({targetProcToKill.memory_percent}%)</span>
              </div>
              {targetProcToKill.pid <= 4 ? (
                <div className="text-[11px] text-rose-400 pt-2 border-t border-slate-800 flex items-center gap-1.5 font-semibold">
                  <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                  <span>Proceso del núcleo del sistema protegido. No puede ser finalizado.</span>
                </div>
              ) : (
                <div className="text-[11px] text-amber-400/90 pt-2 border-t border-slate-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Los datos no guardados por esta aplicación se perderán inmediatamente.</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setTargetProcToKill(null)}
                disabled={isKilling}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmKillProcess}
                disabled={isKilling || targetProcToKill.pid <= 4}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                {isKilling ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Finalizando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar y Finalizar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta flotante (Toast) */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center space-x-3 transition-all animate-in slide-in-from-bottom-5 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <div className="text-xs font-medium pr-2">{toast.message}</div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white transition p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
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

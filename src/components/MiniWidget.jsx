import React from 'react';
import {
  Cpu,
  Layers,
  HardDrive,
  Wifi,
  Pin,
  PinOff,
  Maximize2,
  Minus,
  Activity,
  Zap,
  ArrowDown,
  ArrowUp
} from 'lucide-react';

function getStatusColor(status) {
  switch (status) {
    case 'ok':
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500',
        border: 'border-emerald-500/30'
      };
    case 'warning':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500',
        border: 'border-amber-500/30'
      };
    case 'critical':
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-500',
        border: 'border-rose-500/30'
      };
    default:
      return {
        text: 'text-slate-400',
        bg: 'bg-slate-500',
        border: 'border-slate-500/30'
      };
  }
}

export function MiniWidget({
  data,
  isOnTop,
  onTogglePin,
  onExpand,
  onMinimizeToTray
}) {
  const cpu = data?.cpu || {};
  const ram = data?.ram || {};
  const storage = data?.storage || {};
  const io = storage.io || {};
  const network = data?.network || {};
  const processes = data?.processes || {};

  const cpuStyles = getStatusColor(cpu.status);
  const ramStyles = getStatusColor(ram.status);
  const diskStyles = getStatusColor(io.active_time_status);
  const netStyles = getStatusColor(network.packet_drop_status);

  // Top process por CPU
  const topProc = (processes.top_cpu && processes.top_cpu[0]) || null;

  // Formato de red
  const downSpeed =
    network.download_mb_s >= 0.1
      ? `${network.download_mb_s.toFixed(1)} MB/s`
      : `${(network.download_kb_s || 0).toFixed(0)} KB/s`;

  const upSpeed =
    network.upload_mb_s >= 0.1
      ? `${network.upload_mb_s.toFixed(1)} MB/s`
      : `${(network.upload_kb_s || 0).toFixed(0)} KB/s`;

  return (
    <div className="w-full h-screen bg-[#0f172a] text-slate-100 flex flex-col justify-between p-3 select-none overflow-hidden font-sans border border-slate-800">
      {/* Barra superior de control del Mini-Widget */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-2.5 h-2.5 rounded-full ${cpuStyles.bg} animate-pulse`}
            />
            <span
              className={`absolute w-4 h-4 rounded-full ${cpuStyles.bg} opacity-25`}
            />
          </div>
          <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">
            System Monitor
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            HUD
          </span>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-1">
          {/* Botón Always-on-top (Pin) */}
          <button
            onClick={onTogglePin}
            title={isOnTop ? 'Desfijar (Always-on-Top activo)' : 'Fijar sobre otras ventanas'}
            className={`p-1 rounded transition-colors ${
              isOnTop
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {isOnTop ? <Pin className="w-3.5 h-3.5 fill-current" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>

          {/* Botón Minimizar a Bandeja */}
          <button
            onClick={onMinimizeToTray}
            title="Minimizar a la Bandeja del Sistema"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Botón Expandir a Dashboard completo */}
          <button
            onClick={onExpand}
            title="Expandir a Dashboard Completo"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid de métricas principales 2x2 */}
      <div className="grid grid-cols-2 gap-2 my-1.5 flex-1">
        {/* Tarjeta CPU */}
        <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>CPU</span>
            </div>
            {cpu.frequency_current_ghz && (
              <span className="text-[10px] text-slate-400 font-mono">
                {cpu.frequency_current_ghz} GHz
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between my-1">
            <span className={`text-xl font-bold font-mono ${cpuStyles.text}`}>
              {cpu.usage_percent !== undefined ? `${cpu.usage_percent}%` : '--'}
            </span>
            <span className="text-[10px] text-slate-400">
              {cpu.core_count ? `${cpu.core_count} Cores` : ''}
            </span>
          </div>
          {/* Barra de progreso */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full ${cpuStyles.bg} transition-all duration-300`}
              style={{ width: `${Math.min(100, cpu.usage_percent || 0)}%` }}
            />
          </div>
        </div>

        {/* Tarjeta RAM */}
        <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>RAM</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {ram.used_gb || 0}/{ram.total_gb || 0} GB
            </span>
          </div>
          <div className="flex items-baseline justify-between my-1">
            <span className={`text-xl font-bold font-mono ${ramStyles.text}`}>
              {ram.percent !== undefined ? `${ram.percent}%` : '--'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Swap: {data?.swap?.percent || 0}%
            </span>
          </div>
          {/* Barra de progreso */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full ${ramStyles.bg} transition-all duration-300`}
              style={{ width: `${Math.min(100, ram.percent || 0)}%` }}
            />
          </div>
        </div>

        {/* Tarjeta Almacenamiento / Disco */}
        <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>DISCO I/O</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Activo
            </span>
          </div>
          <div className="flex items-baseline justify-between my-1">
            <span className={`text-xl font-bold font-mono ${diskStyles.text}`}>
              {io.active_time_percent !== undefined ? `${io.active_time_percent}%` : '0%'}
            </span>
            <div className="text-[10px] text-slate-400 text-right leading-tight font-mono">
              <div>R: {io.read_mb_s || 0}M</div>
              <div>W: {io.write_mb_s || 0}M</div>
            </div>
          </div>
          {/* Barra de progreso */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full ${diskStyles.bg} transition-all duration-300`}
              style={{ width: `${Math.min(100, io.active_time_percent || 0)}%` }}
            />
          </div>
        </div>

        {/* Tarjeta Red */}
        <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>RED</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {network.active_interfaces?.length || 1} NIC
            </span>
          </div>
          <div className="my-1 flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs font-mono text-emerald-400">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <ArrowDown className="w-3 h-3 text-emerald-400" /> DL
              </span>
              <span>{downSpeed}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-sky-400">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <ArrowUp className="w-3 h-3 text-sky-400" /> UL
              </span>
              <span>{upSpeed}</span>
            </div>
          </div>
          {/* Indicador de paquetes perdidos */}
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Drops</span>
            <span className={netStyles.text}>{network.packet_drop_percent || 0}%</span>
          </div>
        </div>
      </div>

      {/* Pie con Proceso Principal (Top CPU) */}
      <div className="bg-slate-950/70 rounded px-2 py-1 flex items-center justify-between text-[10px] text-slate-400 border border-slate-800/50">
        <div className="flex items-center gap-1.5 truncate max-w-[210px]">
          <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="truncate">
            Top: <strong className="text-slate-300 font-mono">{topProc ? topProc.name : 'Inactivo'}</strong>
          </span>
        </div>
        {topProc && (
          <span className="font-mono text-amber-400 font-semibold flex-shrink-0">
            {topProc.cpu_percent}% CPU
          </span>
        )}
      </div>
    </div>
  );
}

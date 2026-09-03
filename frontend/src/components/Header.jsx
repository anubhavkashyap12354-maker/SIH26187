import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Activity, 
  Clock, 
  Cpu, 
  Wifi, 
  WifiOff, 
  Camera, 
  ShieldAlert, 
  ShieldCheck,
  Server
} from 'lucide-react';

export default function Header({ 
  isConnected, 
  metadata, 
  activeThreatCount = 0,
  activeCamera = 'CAM-01',
  onCameraChange 
}) {
  const [timeStr, setTimeStr] = useState('');
  const [simulatedCpuLoad, setSimulatedCpuLoad] = useState(28);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2));
    };
    updateTime();
    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Dynamic CPU utilization variance based on latency
    const baseLoad = metadata?.latency_ms ? Math.min(85, Math.max(18, Math.round(metadata.latency_ms * 1.6))) : 24;
    setSimulatedCpuLoad(baseLoad);
  }, [metadata]);

  return (
    <header className="bg-slate-950/95 border-b border-slate-800 px-6 py-3 sticky top-0 z-50 backdrop-blur-lg select-none">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Brand & Sector Status */}
        <div className="flex items-center gap-3.5">
          <div className="relative p-2.5 bg-red-950/30 border border-red-500/40 rounded-xl text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.25)]">
            <Radio className="w-5 h-5 animate-pulse text-red-500" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-extrabold text-base tracking-widest text-slate-100 uppercase">
                BorderGuard <span className="text-red-500">Command</span>
              </h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-900 text-cyan-400 rounded border border-cyan-500/30 tracking-wider">
                SIH26187
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                activeThreatCount > 0 
                  ? 'bg-red-950/80 text-red-400 border-red-500/60 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]' 
                  : 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
              }`}>
                {activeThreatCount > 0 ? (
                  <>
                    <ShieldAlert className="w-3 h-3" />
                    DEFCON 2 // {activeThreatCount} ACTIVE INTRUSION{activeThreatCount > 1 ? 'S' : ''}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    PERIMETER SECURE
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Sector Alpha Autonomous Surveillance & Geofencing System
            </p>
          </div>
        </div>

        {/* Telemetry Status Bar */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          {/* Live UTC/Local Timestamp */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">ZULU:</span>
            <span className="font-bold text-cyan-300">{timeStr}</span>
          </div>

          {/* Active Camera Selector */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">CAM:</span>
            <select
              value={activeCamera}
              onChange={(e) => onCameraChange?.(e.target.value)}
              className="bg-transparent text-indigo-300 font-bold focus:outline-none cursor-pointer"
            >
              <option value="CAM-01" className="bg-slate-900 text-slate-200">CAM-01 (North Fence)</option>
              <option value="CAM-02" className="bg-slate-900 text-slate-200">CAM-02 (East River)</option>
              <option value="CAM-03" className="bg-slate-900 text-slate-200">CAM-03 (South Valley)</option>
              <option value="CAM-04" className="bg-slate-900 text-slate-200">CAM-04 (West Perimeter)</option>
            </select>
          </div>

          {/* Stream FPS */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">STREAM:</span>
            <span className="font-bold text-emerald-400">{metadata?.fps || 0} FPS</span>
          </div>

          {/* Inference Latency */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <Server className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">INFER:</span>
            <span className="font-bold text-amber-400">{metadata?.latency_ms || 0}ms</span>
          </div>

          {/* CPU Stats */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-400">CPU:</span>
            <span className="font-bold text-purple-300">{simulatedCpuLoad}%</span>
          </div>

          {/* WebSocket Status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold ${
            isConnected
              ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/40'
              : 'bg-red-950/50 text-red-400 border-red-500/40 animate-pulse'
          }`}>
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span>DISCONNECTED</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

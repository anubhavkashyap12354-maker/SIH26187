import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  ShieldX, 
  CheckCircle2, 
  Clock, 
  Camera, 
  Volume2, 
  VolumeX, 
  Filter, 
  Trash2,
  Download,
  Flame
} from 'lucide-react';

export default function AlertPanel({ alerts = [], onClearAlerts }) {
  const [isMuted, setIsMuted] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('ALL'); // 'ALL' | 'CRITICAL' | 'RECENT_5M'
  const lastChimeTimeRef = useRef(0);

  // Synthesize Tactical Radar Warning Chime via Web Audio API
  const playAlertChime = () => {
    if (isMuted) return;
    const now = Date.now();
    // Cooldown 2 seconds between audio chimes
    if (now - lastChimeTimeRef.current < 2000) return;
    lastChimeTimeRef.current = now;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Double-pulse tactical alarm tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch (e) {
      console.warn('Audio chime could not play:', e);
    }
  };

  // Trigger sound when new critical alert arrives
  useEffect(() => {
    if (alerts.length > 0) {
      const latest = alerts[0];
      if (latest?.severity === 'CRITICAL' || latest?.type === 'INTRUSION_ALERT') {
        playAlertChime();
      }
    }
  }, [alerts]);

  // Filter alerts by severity and timestamp
  const filteredAlerts = alerts.filter((alert) => {
    if (selectedFilter === 'CRITICAL') {
      return alert.severity === 'CRITICAL' || alert.type === 'INTRUSION_ALERT';
    }
    return true;
  });

  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL' || a.type === 'INTRUSION_ALERT').length;

  return (
    <div className={`bg-slate-900 border rounded-2xl p-4 flex flex-col h-full shadow-2xl transition-all duration-300 ${
      criticalCount > 0 
        ? 'border-red-500/70 shadow-[0_0_25px_rgba(239,68,68,0.2)]' 
        : 'border-slate-800'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border ${
            criticalCount > 0 
              ? 'bg-red-950/60 text-red-400 border-red-500/60 animate-pulse' 
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            <ShieldX className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              Threat Intelligence Log
              {criticalCount > 0 && (
                <Flame className="w-4 h-4 text-red-500 animate-bounce" />
              )}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Spatial Loitering & Intrusion Events
            </p>
          </div>
        </div>

        {/* Audio Mute & Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-1.5 rounded-lg border text-xs font-mono transition-all ${
              isMuted
                ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                : 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900/60'
            }`}
            title={isMuted ? 'Unmute siren chime' : 'Mute siren chime'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {alerts.length > 0 && (
            <button
              onClick={onClearAlerts}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 transition-all"
              title="Clear alert logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mt-3 pt-1">
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 flex-1 text-xs font-mono">
          <button
            onClick={() => setSelectedFilter('ALL')}
            className={`flex-1 py-1 px-2 rounded font-medium transition-all ${
              selectedFilter === 'ALL'
                ? 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ALL ({alerts.length})
          </button>
          <button
            onClick={() => setSelectedFilter('CRITICAL')}
            className={`flex-1 py-1 px-2 rounded font-medium transition-all flex items-center justify-center gap-1 ${
              selectedFilter === 'CRITICAL'
                ? 'bg-red-950/90 text-red-300 border border-red-500/50 shadow'
                : 'text-slate-400 hover:text-red-400'
            }`}
          >
            CRITICAL ({criticalCount})
          </button>
        </div>
      </div>

      {/* Scrollable Alert List */}
      <div className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1 min-h-[360px] max-h-[560px]">
        {filteredAlerts.length === 0 ? (
          <div className="h-60 flex flex-col items-center justify-center text-slate-500 space-y-2.5">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
            <p className="text-xs font-mono font-semibold tracking-wider text-slate-400">
              ZERO INTRUSIONS RECORDED
            </p>
            <p className="text-[11px] text-slate-600 text-center max-w-[220px]">
              Loitering threshold set to 3.0s. All geo-fenced sectors nominal.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert, idx) => {
            const isCrit = alert.severity === 'CRITICAL' || alert.type === 'INTRUSION_ALERT';
            const badgeBg = isCrit
              ? 'bg-red-500/20 text-red-400 border-red-500/50'
              : alert.severity === 'MEDIUM'
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';

            return (
              <div
                key={alert.alert_id || alert.id || idx}
                className={`p-3 rounded-xl border transition-all duration-200 space-y-2.5 ${
                  isCrit
                    ? 'bg-red-950/40 border-red-500/50 hover:bg-red-900/30'
                    : 'bg-slate-950/60 border-slate-800 hover:bg-slate-900/60'
                }`}
              >
                {/* Alert Title & Severity Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${isCrit ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />
                    <span className="text-xs font-mono font-bold text-slate-100 truncate">
                      {alert.type || 'INTRUSION_ALERT'}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${badgeBg}`}>
                    {alert.severity || 'HIGH'}
                  </span>
                </div>

                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                  {alert.message}
                </p>

                {/* Evidence Thumbnail Crop & Metadata */}
                <div className="flex items-center gap-3 pt-1 border-t border-slate-800/80">
                  {alert.snapshot_base64 && (
                    <img
                      src={alert.snapshot_base64}
                      alt="Intruder Thumbnail"
                      className="w-16 h-16 object-cover rounded-lg border-2 border-red-500/70 shadow-md shrink-0 bg-black"
                    />
                  )}

                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-300">
                    <span className="px-1.5 py-0.5 bg-red-900/70 text-red-200 rounded border border-red-700/60 font-bold">
                      ID: {alert.target_id || alert.object_type}
                    </span>
                    {alert.camera_id && (
                      <span className="px-1.5 py-0.5 bg-slate-900 text-cyan-300 rounded border border-slate-700 flex items-center gap-1">
                        <Camera className="w-2.5 h-2.5" />
                        {alert.camera_id}
                      </span>
                    )}
                    {alert.loiter_duration_seconds !== undefined && (
                      <span className="px-1.5 py-0.5 bg-amber-950/80 text-amber-300 rounded border border-amber-800/60 flex items-center gap-1 font-bold">
                        <Clock className="w-2.5 h-2.5" />
                        {alert.loiter_duration_seconds}s LOITER
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 bg-slate-900 text-slate-400 rounded border border-slate-800">
                      {alert.timestamp || 'RECENT'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import { ShieldAlert, Crosshair, Eye } from 'lucide-react';

export default function VideoCanvas({ frameData, metadata, detections = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !frameData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw incoming video frame
      ctx.drawImage(img, 0, 0);

      // 1. Draw Restricted Perimeter Exclusion Polygon
      if (metadata?.restricted_zone && metadata.restricted_zone.length > 0) {
        ctx.beginPath();
        const pts = metadata.restricted_zone;
        ctx.moveTo(pts[0][0] * canvas.width, pts[0][1] * canvas.height);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0] * canvas.width, pts[i][1] * canvas.height);
        }
        ctx.closePath();

        // Polygon border styling
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.stroke();

        // Semi-transparent exclusion zone fill
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.fill();
        ctx.setLineDash([]); // Reset dash

        // Zone Tag Label
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.fillText(`GEO-FENCE: ${metadata.camera_id || 'CAM-01'} [3.0s LOITER THRESHOLD]`, pts[0][0] * canvas.width + 10, pts[0][1] * canvas.height + 20);
      }

      // 2. Draw Multi-Object Tracked Bounding Boxes
      detections.forEach((det) => {
        const [x1, y1, x2, y2] = det.bbox;
        const bw = x2 - x1;
        const bh = y2 - y1;
        const isCritical = det.threat_level === 'CRITICAL';
        const isWarning = det.threat_level === 'WARNING' || det.in_restricted_zone;

        const boxColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';
        const labelBg = isCritical ? 'rgba(239, 68, 68, 0.95)' : isWarning ? 'rgba(245, 158, 11, 0.95)' : 'rgba(16, 185, 129, 0.9)';

        // Bounding Box
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = isCritical ? 3 : 2;
        ctx.strokeRect(x1, y1, bw, bh);

        // Tactical Corner Accents
        const cornerLen = Math.min(14, bw / 4, bh / 4);
        ctx.lineWidth = 3;
        // Top-Left
        ctx.beginPath();
        ctx.moveTo(x1, y1 + cornerLen);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + cornerLen, y1);
        ctx.stroke();
        // Top-Right
        ctx.beginPath();
        ctx.moveTo(x2 - cornerLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + cornerLen);
        ctx.stroke();

        // Label Badge with Loiter Timer
        let loiterText = '';
        if (det.loiter_duration > 0) {
          loiterText = ` [${det.loiter_duration}s]`;
        }
        const tagText = `${det.track_id} | ${det.class_name.toUpperCase()} ${(det.confidence * 100).toFixed(0)}%${loiterText}`;
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const textMetrics = ctx.measureText(tagText);
        const textWidth = textMetrics.width;

        ctx.fillStyle = labelBg;
        ctx.fillRect(x1, Math.max(0, y1 - 22), textWidth + 12, 22);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(tagText, x1 + 6, Math.max(15, y1 - 6));

        // Center reticle
        const cx = x1 + bw / 2;
        const cy = y1 + bh / 2;
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
        ctx.stroke();
      });

      // 3. Center Screen Crosshair
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cw - 20, ch);
      ctx.lineTo(cw + 20, ch);
      ctx.moveTo(cw, ch - 20);
      ctx.lineTo(cw, ch + 20);
      ctx.stroke();
    };

    img.src = frameData;
  }, [frameData, metadata, detections]);

  return (
    <div className="relative w-full aspect-[4/3] bg-tactical-800 rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl flex items-center justify-center">
      {frameData ? (
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-400 space-y-3 p-8">
          <Crosshair className="w-12 h-12 text-tactical-accent animate-spin" style={{ animationDuration: '6s' }} />
          <p className="font-mono text-sm font-semibold tracking-wider">AWAITING VIDEO STREAM HANDSHAKE...</p>
          <p className="text-xs text-slate-500">Connecting to WebSocket /ws/stream</p>
        </div>
      )}

      {/* Floating HUD Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-tactical-accent animate-pulse" />
        <span className="text-slate-200">LIVE FEED // {metadata?.camera_id || 'CAM-01'}</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-mono">
        <Eye className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-cyan-300">{detections.length} TRACKS ACTIVE</span>
      </div>
    </div>
  );
}

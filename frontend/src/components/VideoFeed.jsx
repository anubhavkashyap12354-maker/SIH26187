import React, { useEffect, useRef, useState } from 'react';
import { 
  Crosshair, 
  PenTool, 
  Check, 
  RotateCcw, 
  Trash2, 
  ShieldAlert,
  Square,
  Circle,
  Pencil,
  Move,
  Play,
  Pause,
  FastForward
} from 'lucide-react';

export default function VideoFeed({ 
  frameData, 
  metadata, 
  detections = [], 
  activeCamera = 'CAM-01',
  onZoneUpdated,
  onVideoControl
}) {
  const playback = metadata?.playback || {};
  const formatTime = (secs = 0) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState('box'); // 'box' | 'circle' | 'polygon' | 'freehand'
  const [drawnPoints, setDrawnPoints] = useState([]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const round4 = (num) => Math.round(num * 10000) / 10000;

  // Get mouse coordinates normalized (0.0 to 1.0)
  const getNormalizedPos = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x: round4(x), y: round4(y) };
  };

  // Render Video Frame & Overlays onto Canvas
  useEffect(() => {
    if (!canvasRef.current || !frameData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // 1. Draw Original Frame
      ctx.drawImage(img, 0, 0);

      // 2. Determine Zone to Render
      const currentZone = (isDrawing && drawnPoints.length >= 3)
        ? drawnPoints 
        : (metadata?.restricted_zone || [[0.15, 0.35], [0.85, 0.35], [0.95, 0.90], [0.05, 0.90]]);

      if (currentZone && currentZone.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(currentZone[0][0] * canvas.width, currentZone[0][1] * canvas.height);
        for (let i = 1; i < currentZone.length; i++) {
          ctx.lineTo(currentZone[i][0] * canvas.width, currentZone[i][1] * canvas.height);
        }
        ctx.closePath();

        ctx.strokeStyle = isDrawing ? 'rgba(6, 182, 212, 0.95)' : 'rgba(239, 68, 68, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.stroke();

        ctx.fillStyle = isDrawing ? 'rgba(6, 182, 212, 0.18)' : 'rgba(239, 68, 68, 0.16)';
        ctx.fill();
        ctx.setLineDash([]);

        ctx.fillStyle = isDrawing ? 'rgba(6, 182, 212, 0.95)' : 'rgba(239, 68, 68, 0.95)';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const labelText = isDrawing 
          ? `[DRAFTING ZONE (${drawMode.toUpperCase()} TOOL): ${drawnPoints.length} VERTICES]` 
          : `EXCLUSION ZONE // ${metadata?.camera_id || activeCamera} [3.0s LOITER]`;
        ctx.fillText(labelText, currentZone[0][0] * canvas.width + 10, currentZone[0][1] * canvas.height + 20);
      }

      // 3. Draw Tracked Target Bounding Boxes
      detections.forEach((det) => {
        const [x1, y1, x2, y2] = det.bbox;
        const bw = x2 - x1;
        const bh = y2 - y1;
        const isCritical = det.threat_level === 'CRITICAL';
        const isWarning = det.threat_level === 'WARNING' || det.in_restricted_zone;

        const boxColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';
        const labelBg = isCritical ? 'rgba(239, 68, 68, 0.95)' : isWarning ? 'rgba(245, 158, 11, 0.95)' : 'rgba(16, 185, 129, 0.9)';

        ctx.strokeStyle = boxColor;
        ctx.lineWidth = isCritical ? 3 : 2;
        ctx.strokeRect(x1, y1, bw, bh);

        // Corner Highlights
        const cLen = Math.min(14, bw / 4, bh / 4);
        ctx.lineWidth = 3;
        // Top-Left
        ctx.beginPath();
        ctx.moveTo(x1, y1 + cLen);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + cLen, y1);
        ctx.stroke();
        // Top-Right
        ctx.beginPath();
        ctx.moveTo(x2 - cLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + cLen);
        ctx.stroke();

        let loiterSuffix = det.loiter_duration > 0 ? ` [${det.loiter_duration}s]` : '';
        const tagText = `${det.track_id} | ${det.class_name.toUpperCase()} ${(det.confidence * 100).toFixed(0)}%${loiterSuffix}`;
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const textWidth = ctx.measureText(tagText).width;

        ctx.fillStyle = labelBg;
        ctx.fillRect(x1, Math.max(0, y1 - 22), textWidth + 12, 22);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(tagText, x1 + 6, Math.max(15, y1 - 6));
      });

      // 4. Center Crosshair
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cw - 20, ch);
      ctx.lineTo(cw + 20, ch);
      ctx.moveTo(cw, ch - 20);
      ctx.lineTo(cw, ch + 20);
      ctx.stroke();
    };

    img.src = frameData;
  }, [frameData, metadata, detections, isDrawing, drawnPoints, drawMode, activeCamera]);

  // MS Paint Box & Drag Handlers
  const handleMouseDown = (e) => {
    if (!isDrawing) return;
    const pos = getNormalizedPos(e);
    setIsMouseDown(true);
    setDragStart(pos);

    if (drawMode === 'box') {
      // Create initial 4 corner box
      const box = [
        [pos.x, pos.y],
        [pos.x + 0.01, pos.y],
        [pos.x + 0.01, pos.y + 0.01],
        [pos.x, pos.y + 0.01],
      ];
      setDrawnPoints(box);
    } else if (drawMode === 'polygon') {
      setDrawnPoints((prev) => [...prev, [pos.x, pos.y]]);
    } else if (drawMode === 'freehand') {
      setDrawnPoints([[pos.x, pos.y]]);
    }
  };

  const handleMouseMove = (e) => {
    const pos = getNormalizedPos(e);
    setMousePos(pos);

    if (!isDrawing || !isMouseDown || !dragStart) return;

    if (drawMode === 'box') {
      // MS Paint Box drag rectangle
      const x1 = Math.min(dragStart.x, pos.x);
      const x2 = Math.max(dragStart.x, pos.x);
      const y1 = Math.min(dragStart.y, pos.y);
      const y2 = Math.max(dragStart.y, pos.y);

      setDrawnPoints([
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
      ]);
    } else if (drawMode === 'circle') {
      // MS Paint Circle/Oval drag
      const cx = dragStart.x;
      const cy = dragStart.y;
      const rx = Math.abs(pos.x - cx);
      const ry = Math.abs(pos.y - cy);
      const radius = Math.max(rx, ry, 0.02);

      const points = [];
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * (2 * Math.PI);
        const px = round4(cx + Math.cos(angle) * radius);
        const py = round4(cy + Math.sin(angle) * radius);
        points.push([Math.max(0, Math.min(1, px)), Math.max(0, Math.min(1, py))]);
      }
      setDrawnPoints(points);
    } else if (drawMode === 'freehand') {
      // Freehand pencil drag
      setDrawnPoints((prev) => [...prev, [pos.x, pos.y]]);
    }
  };

  const handleSaveGeofenceWithPoints = async (pointsToSave) => {
    const points = pointsToSave || drawnPoints;
    if (!points || points.length < 3) {
      alert('A geofence zone requires at least 3 points.');
      return;
    }

    setSaveStatus('saving');
    try {
      const getBackendUrl = () => `http://${window.location.hostname || 'localhost'}:8000`;
      const response = await fetch(`${getBackendUrl()}/api/geofence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: activeCamera,
          polygon: points,
        }),
      });

      if (response.ok) {
        setSaveStatus('success');
        setIsDrawing(false);
        onZoneUpdated?.(points);
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        const err = await response.json();
        alert(`Failed to save geofence: ${err.detail || 'Unknown error'}`);
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Error submitting geofence:', err);
      setSaveStatus('error');
    }
  };

  const handleSaveGeofence = () => handleSaveGeofenceWithPoints(drawnPoints);

  const handleMouseUp = () => {
    if (isMouseDown && isDrawing && (drawMode === 'box' || drawMode === 'circle') && drawnPoints.length >= 3) {
      handleSaveGeofenceWithPoints(drawnPoints);
    }
    setIsMouseDown(false);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col font-sans">
      {/* Top Toolbar with MS Paint Tools */}
      <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-mono text-slate-300 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            OPTICAL FEED // {activeCamera}
          </span>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {metadata?.resolution ? `${metadata.resolution[0]}x${metadata.resolution[1]}` : '640x480'}
          </span>
        </div>

        {/* MS Paint Shape Tools Toolbar */}
        <div className="flex items-center gap-2">
          {!isDrawing ? (
            <button
              onClick={() => {
                setIsDrawing(true);
                setDrawMode('box');
                setDrawnPoints([]);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)]"
            >
              <PenTool className="w-3.5 h-3.5" />
              DRAW GEOFENCE ZONE
            </button>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Tool Mode Buttons (MS Paint style) */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => { setDrawMode('box'); setDrawnPoints([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                    drawMode === 'box' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="MS Paint Box Tool (Click & Drag Box)"
                >
                  <Square className="w-3.5 h-3.5" />
                  BOX
                </button>

                <button
                  onClick={() => { setDrawMode('circle'); setDrawnPoints([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                    drawMode === 'circle' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="MS Paint Circle Tool (Click & Drag Radius)"
                >
                  <Circle className="w-3.5 h-3.5" />
                  CIRCLE
                </button>

                <button
                  onClick={() => { setDrawMode('polygon'); setDrawnPoints([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                    drawMode === 'polygon' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Multi-Point Polygon Tool"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  POLYGON
                </button>

                <button
                  onClick={() => { setDrawMode('freehand'); setDrawnPoints([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                    drawMode === 'freehand' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Freehand Pencil Tool"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  FREEHAND
                </button>
              </div>

              <button
                onClick={() => setDrawnPoints([])}
                disabled={drawnPoints.length === 0}
                className="bg-slate-800 text-slate-300 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40"
              >
                CLEAR
              </button>

              <button
                onClick={handleSaveGeofence}
                disabled={drawnPoints.length < 3 || saveStatus === 'saving'}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-mono px-3 py-1.5 rounded-lg font-bold shadow"
              >
                {saveStatus === 'saving' ? 'SAVING...' : '✓ SAVE ZONE'}
              </button>

              <button
                onClick={() => {
                  setIsDrawing(false);
                  setDrawnPoints([]);
                }}
                className="text-slate-400 hover:text-slate-200 text-xs font-mono px-2 py-1.5"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Viewport Container */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`relative w-full aspect-[4/3] bg-slate-950 overflow-hidden flex items-center justify-center select-none ${
          isDrawing ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        {frameData ? (
          <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none" />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 space-y-3 p-8">
            <Crosshair className="w-12 h-12 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
            <p className="font-mono text-sm font-semibold tracking-wider text-slate-300">ESTABLISHING RTSP INGESTION...</p>
            <p className="text-xs text-slate-500 font-mono">Subscribing to /ws/stream</p>
          </div>
        )}

        {/* Interactive SVG Overlay */}
        {isDrawing && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
            {drawnPoints.map((pt, i) => (
              <g key={i}>
                <circle
                  cx={`${pt[0] * 100}%`}
                  cy={`${pt[1] * 100}%`}
                  r="5"
                  className="fill-cyan-400 stroke-white stroke-2"
                />
                <text
                  x={`${pt[0] * 100}%`}
                  y={`${pt[1] * 100 - 1.5}%`}
                  className="fill-cyan-300 text-[10px] font-mono font-bold"
                >
                  P{i + 1}
                </text>
              </g>
            ))}
          </svg>
        )}

        {/* Live Coordinate Crosshair Overlay */}
        {isDrawing && (
          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded-lg border border-cyan-500/40 text-[11px] font-mono text-cyan-300 pointer-events-none">
            TOOL: {drawMode.toUpperCase()} | CURSOR: X: {mousePos.x.toFixed(3)} | Y: {mousePos.y.toFixed(3)}
          </div>
        )}

        {/* Threat Alert HUD Banner */}
        {detections.some((d) => d.threat_level === 'CRITICAL') && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-950/90 border border-red-500 text-red-300 px-3 py-1.5 rounded-lg text-xs font-mono font-bold animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)] pointer-events-none">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            PERIMETER BREACH DETECTED
          </div>
        )}
      </div>

      {/* Tactical Video Playback Controls Bar */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono select-none">
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle Button */}
          <button
            onClick={() => onVideoControl?.('toggle')}
            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow"
            title={playback?.is_paused ? 'Play Video Stream' : 'Pause Video Stream'}
          >
            {playback?.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Stop / Restart */}
          <button
            onClick={() => onVideoControl?.('restart')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
            title="Restart Video (Jump to Start)"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          {/* Skip -5s */}
          <button
            onClick={() => onVideoControl?.('rewind')}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all border border-slate-700 flex items-center gap-1"
            title="Rewind 5 Seconds"
          >
            <RotateCcw className="w-3 h-3 text-cyan-400" />
            -5s
          </button>

          {/* Skip +5s */}
          <button
            onClick={() => onVideoControl?.('forward')}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all border border-slate-700 flex items-center gap-1"
            title="Fast Forward 5 Seconds"
          >
            +5s
            <FastForward className="w-3 h-3 text-cyan-400" />
          </button>
        </div>

        {/* Interactive Timeline Progress Bar & Time Stamps */}
        <div className="flex-1 min-w-[180px] flex items-center gap-3">
          <span className="text-[11px] text-slate-400 font-bold min-w-[40px] text-right">
            {formatTime(playback?.current_sec)}
          </span>

          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onVideoControl?.('seek_ratio', ratio);
            }}
            className="flex-1 h-2.5 bg-slate-900 hover:bg-slate-800 rounded-full cursor-pointer relative overflow-hidden border border-slate-800"
            title="Click to Scrub Timeline"
          >
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-150"
              style={{ width: `${(playback?.progress_ratio || 0) * 100}%` }}
            />
          </div>

          <span className="text-[11px] text-slate-400 font-bold min-w-[40px]">
            {formatTime(playback?.duration_sec)}
          </span>
        </div>

        {/* Playback Speed Selector */}
        <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Speed:</span>
          {[0.5, 1.0, 1.5, 2.0].map((spd) => (
            <button
              key={spd}
              onClick={() => onVideoControl?.('speed', spd)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                playback?.playback_speed === spd
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

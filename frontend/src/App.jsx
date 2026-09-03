import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Layers, 
  Clock, 
  Cpu, 
  Radio,
  Sliders,
  Terminal,
  Activity,
  Maximize2
} from 'lucide-react';
import Header from './components/Header';
import VideoFeed from './components/VideoFeed';
import VideoUploader from './components/VideoUploader';
import AlertPanel from './components/AlertPanel';
import ControlPanel from './components/ControlPanel';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [frameData, setFrameData] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [detections, setDetections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [videoSource, setVideoSource] = useState('assets/test_border_feed.mp4');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.45);
  const [activeCamera, setActiveCamera] = useState('CAM-01');
  const [totalBreaches, setTotalBreaches] = useState(0);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Connect to backend WebSocket streaming pipeline
  const connectWebSocket = useCallback(() => {
    const wsUrl = `ws://localhost:8000/ws/stream`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected to /ws/stream');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.frame) {
          setFrameData(payload.frame);
        }
        if (payload.metadata) {
          setMetadata(payload.metadata);
        }
        if (payload.detections) {
          setDetections(payload.detections);
        }
        if (payload.alerts && payload.alerts.length > 0) {
          setAlerts((prev) => [...payload.alerts, ...prev].slice(0, 50));
          setTotalBreaches((prev) => prev + payload.alerts.length);
        }
      } catch (err) {
        console.error('[WebSocket] Message parsing error:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[WebSocket] Stream disconnected. Retrying in 2s...');
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket]);

  const sendCommand = (cmd) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(cmd));
    }
  };

  const handleSourceChange = (src) => {
    setVideoSource(src);
    sendCommand({ video_source: src, camera_id: activeCamera });
  };

  const handleConfidenceChange = (val) => {
    setConfidenceThreshold(val);
    sendCommand({ confidence_threshold: val });
  };

  const handleCameraChange = (camId) => {
    setActiveCamera(camId);
    sendCommand({ camera_id: camId });
  };

  const handleZoneUpdated = (polygon) => {
    sendCommand({ geofence_polygon: polygon, camera_id: activeCamera });
  };

  const activeThreats = detections.filter((d) => d.threat_level === 'CRITICAL' || d.in_restricted_zone).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Tactical Status Header */}
      <Header
        isConnected={isConnected}
        metadata={metadata}
        activeThreatCount={activeThreats}
        activeCamera={activeCamera}
        onCameraChange={handleCameraChange}
      />

      {/* Main Command Center Grid */}
      <main className="flex-1 p-5 grid grid-cols-1 xl:grid-cols-12 gap-5 max-w-[1700px] mx-auto w-full">
        {/* Left Column (8 cols): Primary Surveillance Viewport */}
        <div className="xl:col-span-8 space-y-4 flex flex-col">
          <VideoFeed
            frameData={frameData}
            metadata={metadata}
            detections={detections}
            activeCamera={activeCamera}
            onZoneUpdated={handleZoneUpdated}
            onVideoControl={handleVideoControl}
          />

          <VideoUploader
            onUploadSuccess={(payload) => {
              if (payload?.video_source) {
                setVideoSource(payload.video_source);
              }
            }}
          />

          {/* Real-time Sector Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow">
              <div>
                <p className="text-[11px] font-mono text-slate-400 font-medium">TRACKED TARGETS</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">{detections.length}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">Persistent SORT IDs</p>
              </div>
              <Layers className="w-8 h-8 text-cyan-500/30" />
            </div>

            <div className={`border rounded-xl p-3.5 flex items-center justify-between shadow transition-all ${
              activeThreats > 0 
                ? 'bg-red-950/60 border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.25)]' 
                : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div>
                <p className="text-[11px] font-mono text-slate-400 font-medium">ZONE BREACHES</p>
                <p className={`text-2xl font-bold font-mono ${activeThreats > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                  {activeThreats}
                </p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">&gt;= 3.0s Loiter Triggers</p>
              </div>
              <ShieldAlert className={`w-8 h-8 ${activeThreats > 0 ? 'text-red-500' : 'text-slate-600'}`} />
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow">
              <div>
                <p className="text-[11px] font-mono text-slate-400 font-medium">TOTAL INCIDENTS</p>
                <p className="text-2xl font-bold font-mono text-amber-400">{totalBreaches}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">Session Cumulative</p>
              </div>
              <ShieldCheck className="w-8 h-8 text-amber-500/30" />
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Control Console & Threat Intelligence Panel */}
        <div className="xl:col-span-4 space-y-4 flex flex-col">
          <ControlPanel
            confidenceThreshold={confidenceThreshold}
            onConfidenceChange={handleConfidenceChange}
            videoSource={videoSource}
            onSourceChange={handleSourceChange}
            onResetZone={() => handleZoneUpdated([[0.15, 0.35], [0.85, 0.35], [0.95, 0.90], [0.05, 0.90]])}
          />

          <div className="flex-1">
            <AlertPanel
              alerts={alerts}
              onClearAlerts={() => setAlerts([])}
            />
          </div>
        </div>
      </main>

      {/* Bottom Command Center Ticker */}
      <footer className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-cyan-500" />
          <span>BORDERGUARD DEFENSE MATRIX // ONNX RUNTIME CPU ENGINE // ZERO GPU DEPENDENCY</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-500">PROBLEM STATEMENT: SIH26187</span>
          <span className="text-cyan-400 font-bold">STATION: OPERATOR-ALPHA</span>
        </div>
      </footer>
    </div>
  );
}

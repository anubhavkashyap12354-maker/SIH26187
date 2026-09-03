import React, { useRef, useState } from 'react';
import { 
  Sliders, 
  Video, 
  Upload, 
  Camera, 
  Radio, 
  Cpu, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Film,
  FileVideo,
  Play
} from 'lucide-react';

export default function ControlPanel({
  confidenceThreshold,
  onConfidenceChange,
  videoSource,
  onSourceChange,
  onResetZone,
}) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'webcam' | 'rtsp' | 'synthetic'
  const [rtspUrl, setRtspUrl] = useState('rtsp://admin:password@192.168.1.100:554/stream1');
  const [webcamIndex, setWebcamIndex] = useState('0');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);

  // Get current host for backend API calls
  const getBackendUrl = () => {
    const host = window.location.hostname || 'localhost';
    return `http://${host}:8000`;
  };

  // Handle File Selection
  const handleFileSelect = (file) => {
    if (!file) return;
    const allowed = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];
    const name = file.name.toLowerCase();
    const isValid = allowed.some((ext) => name.endsWith(ext));

    if (!isValid) {
      setUploadStatus({
        type: 'error',
        message: `Unsupported video format. Allowed: ${allowed.join(', ')}`,
      });
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadStatus(null);
  };

  // Handle Local Video Upload & Ingestion into AI Pipeline
  const handleUploadVideo = async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const endpoint = `${getBackendUrl()}/api/upload-video`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || 'Upload failed');
      }

      setUploadStatus({
        type: 'success',
        message: data.message || `Loaded '${selectedFile.name}' into AI pipeline.`,
      });

      if (data.video_source) {
        onSourceChange(data.video_source);
      }
    } catch (err) {
      console.error('Upload Error:', err);
      setUploadStatus({
        type: 'error',
        message: err.message || 'Could not connect to backend upload endpoint.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle RTSP Stream Connection
  const handleConnectRtsp = async () => {
    if (!rtspUrl.trim()) return;
    const url = rtspUrl.trim();
    
    try {
      const endpoint = `${getBackendUrl()}/api/stream-source`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: 'rtsp', source_value: url }),
      }).catch(() => {});

      onSourceChange(url);
      setUploadStatus({
        type: 'success',
        message: `Connecting to RTSP stream: ${url}`,
      });
    } catch (err) {
      onSourceChange(url);
    }
  };

  // Handle Webcam Source Activation
  const handleActivateWebcam = async () => {
    const idx = webcamIndex.trim();
    try {
      const endpoint = `${getBackendUrl()}/api/stream-source`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: 'webcam', source_value: idx }),
      }).catch(() => {});

      onSourceChange(idx);
      setUploadStatus({
        type: 'success',
        message: `Activated Webcam index ${idx}`,
      });
    } catch (err) {
      onSourceChange(idx);
    }
  };

  // Handle Load Synthetic Simulation
  const handleLoadSynthetic = async () => {
    const synthPath = 'assets/test_border_feed.mp4';
    try {
      const endpoint = `${getBackendUrl()}/api/stream-source`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: 'synthetic', source_value: synthPath }),
      }).catch(() => {});

      onSourceChange(synthPath);
      setUploadStatus({
        type: 'success',
        message: 'Loaded Test Border Security Simulation Feed.',
      });
    } catch (err) {
      onSourceChange(synthPath);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4 font-sans">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h3 className="font-extrabold text-sm text-slate-100 uppercase tracking-wider">
            Surveillance Input Console
          </h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-cyan-500/30 font-bold">
          4 INPUT MODES
        </span>
      </div>

      {/* Input Mode Selector Tabs */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono">
        <button
          onClick={() => { setActiveTab('upload'); setUploadStatus(null); }}
          className={`py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all ${
            activeTab === 'upload'
              ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          LOCAL VIDEO
        </button>

        <button
          onClick={() => { setActiveTab('webcam'); setUploadStatus(null); }}
          className={`py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all ${
            activeTab === 'webcam'
              ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          WEBCAM
        </button>

        <button
          onClick={() => { setActiveTab('rtsp'); setUploadStatus(null); }}
          className={`py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all ${
            activeTab === 'rtsp'
              ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          CCTV RTSP
        </button>

        <button
          onClick={() => { setActiveTab('synthetic'); setUploadStatus(null); }}
          className={`py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all ${
            activeTab === 'synthetic'
              ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          TEST FEED
        </button>
      </div>

      {/* MODE 1: Local Device Video File Upload */}
      {activeTab === 'upload' && (
        <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
          <label className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
            <FileVideo className="w-4 h-4 text-emerald-400" />
            SELECT LOCAL VIDEO FILE (MP4 / AVI / MOV / MKV)
          </label>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-slate-700 hover:border-emerald-500/80 bg-slate-900/90 hover:bg-slate-900 p-4 rounded-xl text-center transition-all group"
          >
            <Upload className="w-6 h-6 mx-auto mb-1 text-slate-400 group-hover:text-emerald-400 group-hover:scale-110 transition-all" />
            <p className="text-xs font-mono text-slate-200 font-bold">
              {selectedFile ? selectedFile.name : 'Click or Drag & Drop Video File'}
            </p>
            <p className="text-[10px] font-mono text-slate-400 mt-1">
              {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Supports MP4, AVI, MOV, MKV, WebM'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.avi,.mov,.mkv,.webm,.flv"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
          </div>

          <button
            onClick={handleUploadVideo}
            disabled={!selectedFile || isUploading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-mono font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)]"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                UPLOADING TO AI PIPELINE...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                LOAD VIDEO INTO PIPELINE
              </>
            )}
          </button>
        </div>
      )}

      {/* MODE 2: Live Webcam / USB Camera */}
      {activeTab === 'webcam' && (
        <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
          <label className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-cyan-400" />
            SELECT WEBCAM / USB CAMERA DEVICE
          </label>

          <select
            value={webcamIndex}
            onChange={(e) => setWebcamIndex(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
          >
            <option value="0">Camera Index 0 (Default Integrated Laptop Webcam)</option>
            <option value="1">Camera Index 1 (External USB / Thermal IR Camera)</option>
            <option value="2">Camera Index 2 (Secondary USB Feed)</option>
          </select>

          <button
            onClick={handleActivateWebcam}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_rgba(6,182,212,0.3)]"
          >
            <Camera className="w-4 h-4" />
            ACTIVATE WEBCAM FEED
          </button>
        </div>
      )}

      {/* MODE 3: Custom RTSP CCTV Stream */}
      {activeTab === 'rtsp' && (
        <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
          <label className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-amber-400" />
            INPUT CCTV CAMERA RTSP STREAM URL
          </label>

          <input
            type="text"
            value={rtspUrl}
            onChange={(e) => setRtspUrl(e.target.value)}
            placeholder="rtsp://user:password@192.168.1.100:554/stream1"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-400 placeholder:text-slate-600"
          />

          <div className="flex gap-1.5 text-[10px] font-mono">
            <span className="text-slate-500">Quick Presets:</span>
            <button
              onClick={() => setRtspUrl('rtsp://admin:12345@192.168.1.64:554/h264Preview_01_main')}
              className="text-cyan-400 hover:underline"
            >
              Preset 1
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => setRtspUrl('rtsp://192.168.1.100:554/live/ch0')}
              className="text-cyan-400 hover:underline"
            >
              Preset 2
            </button>
          </div>

          <button
            onClick={handleConnectRtsp}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_12px_rgba(245,158,11,0.3)]"
          >
            <Radio className="w-4 h-4" />
            CONNECT RTSP STREAM
          </button>
        </div>
      )}

      {/* MODE 4: Synthetic Border Patrol Simulation */}
      {activeTab === 'synthetic' && (
        <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
          <label className="text-xs font-mono text-slate-300 font-semibold flex items-center gap-1.5">
            <Film className="w-4 h-4 text-purple-400" />
            SYNTHETIC BORDER SECURITY FEED
          </label>
          <p className="text-xs font-mono text-slate-400 leading-relaxed">
            Pre-generated 30s security camera test feed featuring moving infiltrator silhouettes for intrusion validation.
          </p>

          <button
            onClick={handleLoadSynthetic}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow"
          >
            <Play className="w-4 h-4 fill-white" />
            LOAD SYNTHETIC TEST FEED
          </button>
        </div>
      )}

      {/* Status Alert Banner */}
      {uploadStatus && (
        <div
          className={`flex items-start gap-2 p-2.5 rounded-xl text-xs font-mono border ${
            uploadStatus.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : 'bg-red-950/80 border-red-500/50 text-red-300'
          }`}
        >
          {uploadStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          )}
          <span>{uploadStatus.message}</span>
        </div>
      )}

      {/* Current Active Source Indicator Badge */}
      <div className="bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-400 font-medium">ACTIVE SOURCE:</span>
        <span className="text-cyan-300 font-bold truncate max-w-[200px]" title={videoSource}>
          {videoSource || 'None'}
        </span>
      </div>

      {/* AI Confidence Threshold Slider */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs font-mono text-slate-300">
          <span className="flex items-center gap-1.5 font-semibold">
            <Cpu className="w-4 h-4 text-emerald-400" />
            AI CONFIDENCE THRESHOLD
          </span>
          <span className="text-emerald-400 font-extrabold text-sm">
            {(confidenceThreshold * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min="0.10"
          max="0.95"
          step="0.05"
          value={confidenceThreshold}
          onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>High Recall (10%)</span>
          <span>High Precision (95%)</span>
        </div>
      </div>

      {/* Reset Geo-Fence Button */}
      <button
        onClick={onResetZone}
        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all border border-slate-700 flex items-center justify-center gap-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        RESET DEFAULT GEOFENCE
      </button>
    </div>
  );
}

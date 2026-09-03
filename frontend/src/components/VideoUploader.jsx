import React, { useCallback, useRef, useState } from 'react';
import { Upload, Film, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';

const UPLOAD_ENDPOINT = 'http://localhost:8000/api/upload-video';

export default function VideoUploader({ onUploadSuccess }) {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }

  const acceptFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.mp4')) {
      setSelectedFile(null);
      setStatus({ type: 'error', message: 'Only .mp4 files are accepted.' });
      return;
    }
    setSelectedFile(file);
    setStatus(null);
  };

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    acceptFile(file);
  }, []);

  const handleLoadIntoPipeline = async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = payload.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg || item).join('; ')
          : (detail || 'Upload failed. Check that the backend is running on port 8000.');
        setStatus({ type: 'error', message });
        return;
      }

      setStatus({
        type: 'success',
        message: payload.message || `${selectedFile.name} is now streaming through the AI pipeline.`,
      });
      onUploadSuccess?.(payload);
    } catch (err) {
      setStatus({
        type: 'error',
        message: 'Could not reach http://localhost:8000/api/upload-video.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-slate-300" />
          <h3 className="text-xs font-mono font-semibold tracking-wider text-slate-100 uppercase">
            Local MP4 Pipeline Inject
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-500 border border-slate-800 px-2 py-0.5 rounded">
          .MP4 ONLY
        </span>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
          isDragging
            ? 'border-slate-400 bg-slate-800/80'
            : 'border-slate-700 bg-slate-950/70 hover:border-slate-500 hover:bg-slate-800/40'
        }`}
      >
        <Film className="w-7 h-7 mx-auto mb-2 text-slate-400" />
        <p className="text-xs font-mono text-slate-300">
          Drag & drop an MP4 here, or click to select
        </p>
        <p className="text-[10px] font-mono text-slate-500 mt-1">
          File is written to backend/assets/active_upload.mp4 and hot-reloaded
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,video/mp4"
          className="hidden"
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
      </div>

      {selectedFile && (
        <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <p className="text-[11px] font-mono text-slate-200 truncate">
            SELECTED: {selectedFile.name}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedFile(null);
              setStatus(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="text-slate-500 hover:text-slate-200"
            title="Clear selected file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleLoadIntoPipeline}
        disabled={!selectedFile || isUploading}
        className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-100 text-xs font-mono font-semibold tracking-wide px-4 py-2.5 rounded-lg border border-slate-600 flex items-center justify-center gap-2 transition-colors"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            UPLOADING / PROCESSING...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            LOAD INTO AI PIPELINE
          </>
        )}
      </button>

      {status?.type === 'success' && (
        <div className="flex items-start gap-2 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      {status?.type === 'error' && (
        <div className="flex items-start gap-2 text-[11px] font-mono text-red-400 bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}

import os
import time
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.api.websocket import router as websocket_router
from app.services.detector import detector_service
from app.services.geofence import geofence_engine
from app.services.video_stream import video_stream_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("BorderGuardAI")

BACKEND_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_HTML_PATH = BACKEND_ROOT.parent / "frontend" / "index.html"
ACTIVE_UPLOAD_PATH = BACKEND_ROOT / "assets" / "active_upload.mp4"
STANDARD_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8080",
]


class GeofencePolygonRequest(BaseModel):
    camera_id: str = Field(default="CAM-01", description="Identifier of the surveillance camera")
    polygon: List[Tuple[float, float]] = Field(
        description="List of normalized (x, y) coordinates between 0.0 and 1.0",
        examples=[[(0.15, 0.35), (0.85, 0.35), (0.95, 0.90), (0.05, 0.90)]]
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=======================================================")
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Problem Statement: {settings.PROJECT_CODE}")
    logger.info(f"Throttled Rate: {settings.STREAM_FPS} FPS | CPU Threads: {settings.CPU_NUM_THREADS}")
    logger.info(f"Loitering Alert Threshold: {geofence_engine.loitering_threshold}s")
    logger.info(f"Frontend Static Entry: {FRONTEND_HTML_PATH}")
    logger.info("=======================================================")
    yield
    logger.info("Stopping video ingestion worker threads...")
    video_stream_handler.stop()
    logger.info("Shutdown complete.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI-Based Intelligent Video Analytics Platform for Border Surveillance (SIH26187)",
    lifespan=lifespan,
)

# Enable CORS for standard frontend origins (Vite, CRA, preview, FastAPI static)
cors_origins = list(dict.fromkeys([*STANDARD_CORS_ORIGINS, *settings.CORS_ORIGINS]))
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register WebSocket Streaming Endpoint
app.include_router(websocket_router)


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    """Serves the interactive tactical command center frontend directly at http://localhost:8000/."""
    if FRONTEND_HTML_PATH.exists():
        return FileResponse(FRONTEND_HTML_PATH)
    return JSONResponse({
        "status": "online",
        "project": settings.PROJECT_NAME,
        "code": settings.PROJECT_CODE,
        "version": settings.VERSION,
        "ws_endpoint": "/ws/stream",
        "model_initialized": detector_service.is_initialized,
    })


@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "code": settings.PROJECT_CODE,
        "version": settings.VERSION,
        "ws_endpoint": "/ws/stream",
        "model_initialized": detector_service.is_initialized,
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "cpu_threads": settings.CPU_NUM_THREADS,
        "model_path": settings.ONNX_MODEL_PATH,
        "model_initialized": detector_service.is_initialized,
        "video_source": video_stream_handler.source,
        "stream_connected": video_stream_handler.is_connected,
        "stream_fps": settings.STREAM_FPS,
        "confidence_threshold": detector_service.confidence_threshold,
        "loitering_threshold_seconds": geofence_engine.loitering_threshold,
    }


@app.get("/api/config")
async def get_config():
    return {
        "project_name": settings.PROJECT_NAME,
        "project_code": settings.PROJECT_CODE,
        "stream_fps": settings.STREAM_FPS,
        "frame_width": settings.FRAME_WIDTH,
        "frame_height": settings.FRAME_HEIGHT,
        "confidence_threshold": detector_service.confidence_threshold,
        "iou_threshold": settings.IOU_THRESHOLD,
        "relevant_classes": settings.RELEVANT_CLASSES,
        "video_source": video_stream_handler.source,
        "is_connected": video_stream_handler.is_connected,
        "loitering_threshold_seconds": geofence_engine.loitering_threshold,
    }


@app.post("/api/geofence")
async def update_geofence(payload: GeofencePolygonRequest):
    """
    Dynamically update and store polygon coordinates (x, y) per camera feed.
    Coordinates must be normalized floats between 0.0 and 1.0.
    """
    if len(payload.polygon) < 3:
        raise HTTPException(status_code=400, detail="Polygon must contain at least 3 coordinate points.")

    for idx, (x, y) in enumerate(payload.polygon):
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            raise HTTPException(
                status_code=400,
                detail=f"Coordinate point at index {idx} ({x}, {y}) is out of normalized bounds [0.0, 1.0]."
            )

    try:
        geofence_engine.set_zone(payload.camera_id, payload.polygon)
        return {
            "status": "success",
            "message": f"Geofence polygon updated for camera {payload.camera_id}",
            "camera_id": payload.camera_id,
            "polygon": payload.polygon,
            "total_vertices": len(payload.polygon),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class VideoControlRequest(BaseModel):
    action: str = Field(description="Action: 'play', 'pause', 'toggle', 'rewind', 'forward', 'restart', 'seek_ratio', 'speed'")
    value: Optional[float] = Field(default=None, description="Optional numerical parameter for seek seconds, ratio, or speed multiplier")


@app.post("/api/video-control")
async def control_video_stream(payload: VideoControlRequest):
    act = payload.action.lower()
    if act == "play":
        video_stream_handler.play()
    elif act == "pause":
        video_stream_handler.pause()
    elif act == "toggle":
        video_stream_handler.toggle_pause()
    elif act in ("rewind", "seek_backward"):
        sec = payload.value if payload.value is not None else -5.0
        video_stream_handler.seek_seconds(-abs(sec))
    elif act in ("forward", "seek_forward"):
        sec = payload.value if payload.value is not None else 5.0
        video_stream_handler.seek_seconds(abs(sec))
    elif act in ("restart", "stop"):
        video_stream_handler.seek_seconds(-999999.0)
        video_stream_handler.play()
    elif act == "seek_ratio":
        video_stream_handler.seek_ratio(payload.value if payload.value is not None else 0.0)
    elif act == "speed":
        video_stream_handler.set_speed(payload.value if payload.value is not None else 1.0)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown video control action: {act}")

    return {
        "status": "success",
        "action": act,
        "playback": video_stream_handler.get_playback_info()
    }


class StreamSourceRequest(BaseModel):
    source_type: str = Field(description="Source mode: 'file', 'webcam', 'rtsp', 'synthetic'")
    source_value: str = Field(description="Target path, webcam index ('0'), RTSP URL, or 'synthetic'")


@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """
    Accept a local video file (MP4, AVI, MOV, MKV, WebM), persist it as active pipeline source,
    and hot-reload OpenCV without dropping connected WebSocket clients.
    """
    original_name = file.filename or ""
    allowed_exts = (".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv")
    if not original_name.lower().endswith(allowed_exts):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension. Allowed formats: {', '.join(allowed_exts)}"
        )

    try:
        ACTIVE_UPLOAD_PATH.parent.mkdir(parents=True, exist_ok=True)
        ext = Path(original_name).suffix.lower() or ".mp4"
        # Unique timestamp filename to avoid Windows file locks during upload
        timestamp = int(time.time())
        upload_dest = ACTIVE_UPLOAD_PATH.parent / f"upload_{timestamp}{ext}"

        # Write uploaded video file asynchronously in chunks without blocking WebSocket loop or current stream
        def write_file_sync():
            with upload_dest.open("wb") as dest:
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    dest.write(chunk)

        import asyncio
        await asyncio.to_thread(write_file_sync)
        await file.close()

        destination = str(upload_dest.resolve())
        opened = video_stream_handler.reload_stream(destination)
        if not opened:
            raise HTTPException(
                status_code=500,
                detail="Video file saved, but OpenCV could not decode the video format.",
            )

        logger.info(f"Active pipeline source switched to uploaded video: {original_name} -> {destination}")
        return {
            "status": "success",
            "message": f"Local video '{original_name}' loaded into AI pipeline.",
            "filename": original_name,
            "saved_as": destination,
            "video_source": video_stream_handler.source,
            "stream_connected": video_stream_handler.is_connected,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Video upload failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process uploaded video: {exc}") from exc


@app.post("/api/stream-source")
async def set_stream_source(payload: StreamSourceRequest):
    """
    Dynamically set active stream source (RTSP URL, Webcam index, or File path).
    """
    source_val = payload.source_value.strip()
    if payload.source_type == "synthetic" or not source_val:
        source_val = settings.FALLBACK_VIDEO_PATH
    elif payload.source_type == "webcam" and not source_val.isdigit():
        source_val = "0"

    try:
        opened = video_stream_handler.reload_stream(source_val)
        return {
            "status": "success" if opened else "warning",
            "message": f"Pipeline video source updated: {source_val}",
            "video_source": video_stream_handler.source,
            "stream_connected": video_stream_handler.is_connected,
        }
    except Exception as exc:
        logger.error(f"Failed to set stream source: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error setting stream source: {exc}") from exc


@app.get("/api/geofence")
async def get_geofence(camera_id: str = "CAM-01"):
    """
    Retrieves the active geofence polygon coordinates for a given camera feed.
    """
    polygon = geofence_engine.get_zone(camera_id)
    return {
        "camera_id": camera_id,
        "polygon": polygon,
        "loitering_threshold_seconds": geofence_engine.loitering_threshold,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)


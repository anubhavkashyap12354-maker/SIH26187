import asyncio
import base64
import json
import logging
import time
from typing import Any, Dict, List, Tuple
import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.detector import detector_service
from app.services.geofence import geofence_engine
from app.services.tracker import multi_object_tracker
from app.services.video_stream import video_stream_handler

logger = logging.getLogger("BorderGuardAI.WebSocket")
router = APIRouter()


@router.websocket("/ws/stream")
async def websocket_stream_endpoint(websocket: WebSocket):
    """
    High-performance real-time video analytics stream over WebSockets.
    - Captures frames from VideoStreamHandler (RTSP / local test MP4 at 15 FPS)
    - Runs YOLOv8 ONNX CPU detection
    - Tracks moving entities with persistent IDs via Multi-Object Tracker (SORT)
    - Computes spatial Ray-Casting geofence & loitering duration (>= 3s triggers INTRUSION_ALERT)
    - Transmits base64 JPEG frame + tracks + intrusion alerts with snapshot crops
    """
    await websocket.accept()
    client_host = websocket.client.host if websocket.client else "unknown"
    camera_id = "CAM-01"
    logger.info(f"Surveillance client connected to /ws/stream from {client_host} (Monitoring: {camera_id})")

    frame_interval = 1.0 / settings.STREAM_FPS
    frame_id = 0
    last_frame_time = time.time()

    default_frame = np.zeros((settings.FRAME_HEIGHT, settings.FRAME_WIDTH, 3), dtype=np.uint8)
    cv2.putText(default_frame, "CONNECTING TO BORDER SURVEILLANCE FEED...", (25, settings.FRAME_HEIGHT // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 200), 1, cv2.LINE_AA)

    try:
        while True:
            cycle_start = time.perf_counter()

            # 1. Check for inbound client messages (e.g. updating camera_id, RTSP URL, threshold)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.001)
                try:
                    command = json.loads(data)
                    logger.info(f"Received client WebSocket command: {command}")
                    if "video_source" in command:
                        video_stream_handler.set_source(command["video_source"])
                    if "camera_id" in command:
                        camera_id = command["camera_id"]
                    if "confidence_threshold" in command:
                        detector_service.confidence_threshold = float(command["confidence_threshold"])
                    if "geofence_polygon" in command:
                        geofence_engine.set_zone(camera_id, command["geofence_polygon"])

                    # Video Playback Control Commands (Play, Pause, Seek, Speed, Restart)
                    if "video_control" in command:
                        ctrl = command["video_control"]
                        action = ctrl.get("action") if isinstance(ctrl, dict) else str(ctrl)
                        if action == "play":
                            video_stream_handler.play()
                        elif action == "pause":
                            video_stream_handler.pause()
                        elif action == "toggle":
                            video_stream_handler.toggle_pause()
                        elif action == "rewind" or action == "seek_backward":
                            video_stream_handler.seek_seconds(-5.0)
                        elif action == "forward" or action == "seek_forward":
                            video_stream_handler.seek_seconds(5.0)
                        elif action == "restart" or action == "stop":
                            video_stream_handler.seek_seconds(-999999.0)
                            video_stream_handler.play()
                        elif action == "seek_ratio" and isinstance(ctrl, dict):
                            video_stream_handler.seek_ratio(float(ctrl.get("ratio", 0.0)))
                        elif action == "speed" and isinstance(ctrl, dict):
                            video_stream_handler.set_speed(float(ctrl.get("speed", 1.0)))
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                pass

            # 2. Ingest latest frame from thread buffer
            frame = video_stream_handler.get_latest_frame()
            if frame is None:
                frame = default_frame

            frame_id += 1
            infer_start = time.perf_counter()

            # 3. Step 1: Detect objects on CPU with YOLOv8 ONNX
            raw_detections = detector_service.detect(frame)

            # 4. Step 2: Multi-Object Tracking (SORT Kalman Filter) for persistent IDs
            tracked_entities = multi_object_tracker.update(raw_detections)

            # 5. Step 3: Spatial Behavior & Loitering Analytics Engine (Ray-Casting >= 3s)
            processed_tracks, intrusion_alerts = geofence_engine.process_frame_tracks(
                camera_id=camera_id,
                tracks=tracked_entities,
                frame=frame,
            )

            infer_time_ms = round((time.perf_counter() - infer_start) * 1000, 2)

            # 6. Encode frame to base64 JPEG
            encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), settings.JPEG_QUALITY]
            _, buffer = cv2.imencode(".jpg", frame, encode_params)
            jpg_base64 = base64.b64encode(buffer).decode("utf-8")

            current_fps = round(1.0 / max(time.time() - last_frame_time, 0.001), 1)
            last_frame_time = time.time()

            h, w = frame.shape[:2]

            # 7. Construct broadcast payload
            payload = {
                "frame": f"data:image/jpeg;base64,{jpg_base64}",
                "metadata": {
                    "frame_id": frame_id,
                    "timestamp": time.time(),
                    "camera_id": camera_id,
                    "fps": min(current_fps, settings.STREAM_FPS),
                    "latency_ms": infer_time_ms,
                    "resolution": [w, h],
                    "restricted_zone": geofence_engine.get_zone(camera_id),
                    "stream_connected": video_stream_handler.is_connected,
                    "video_source": video_stream_handler.source,
                    "playback": video_stream_handler.get_playback_info(),
                },
                "detections": processed_tracks,
                "alerts": intrusion_alerts,
            }

            await websocket.send_json(payload)

            # 8. Rate throttle sleep
            elapsed = time.perf_counter() - cycle_start
            sleep_duration = max(0.001, frame_interval - elapsed)
            await asyncio.sleep(sleep_duration)

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from /ws/stream: {client_host}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass

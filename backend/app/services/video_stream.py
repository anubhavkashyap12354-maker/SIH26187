import os
import time
import base64
import logging
import threading
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from app.core.config import settings
from app.services.detector import detector_service

logger = logging.getLogger("BorderGuardAI.VideoStream")


class VideoStreamHandler:
    """
    Threaded video ingestion handler supporting RTSP streams and local MP4 fallback.
    Throttles capture to 15 FPS to conserve CPU resources and handles automatic stream reconnection.
    """

    def __init__(self, source: Optional[str] = None, target_fps: int = 15):
        self.source = source or settings.DEFAULT_RTSP_URL or settings.FALLBACK_VIDEO_PATH
        self.target_fps = target_fps or settings.STREAM_FPS
        self.frame_interval = 1.0 / self.target_fps

        self.cap: Optional[cv2.VideoCapture] = None
        self.latest_frame: Optional[np.ndarray] = None
        self.lock = threading.Lock()
        self.capture_lock = threading.RLock()
        self._hold_open = False  # True while a file overwrite is in progress
        self.is_running = False
        self.thread: Optional[threading.Thread] = None

        self.is_rtsp = bool(self.source and ("rtsp://" in self.source.lower() or "http://" in self.source.lower()))
        self.is_connected = False
        self.reconnect_delay = 3.0  # seconds between RTSP reconnect attempts

        # Playback Controls State (Play/Pause, Seek, Speed)
        self.is_paused = False
        self.playback_speed = 1.0

        # Ensure fallback video exists
        self._ensure_fallback_video_exists()
        self.start()

    def _ensure_fallback_video_exists(self):
        """Creates a sample test border patrol MP4 video if not present."""
        fallback_path = settings.FALLBACK_VIDEO_PATH
        if not os.path.exists(fallback_path):
            try:
                os.makedirs(os.path.dirname(fallback_path), exist_ok=True)
                logger.info(f"Generating synthetic sample border video at {fallback_path}...")
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                w, h = settings.FRAME_WIDTH, settings.FRAME_HEIGHT
                out = cv2.VideoWriter(fallback_path, fourcc, 15.0, (w, h))

                # Generate 150 frames (10 seconds) of border simulation
                for f_idx in range(150):
                    frame = np.zeros((h, w, 3), dtype=np.uint8)
                    # Night vision tactical gradient
                    for y in range(h):
                        ratio = y / h
                        frame[y, :, 0] = int(18 + 30 * ratio)
                        frame[y, :, 1] = int(28 + 45 * ratio)
                        frame[y, :, 2] = int(22 + 35 * ratio)

                    # Draw Perimeter Fence
                    fence_y = int(h * 0.45)
                    cv2.line(frame, (0, fence_y), (w, fence_y), (70, 100, 80), 2)
                    for x in range(0, w, 35):
                        cv2.line(frame, (x, fence_y), (x + 20, h), (50, 70, 60), 1)

                    # Patrol target movement
                    px = int(80 + (f_idx * 3.5) % (w - 140))
                    py = int(fence_y + 40 + np.sin(f_idx * 0.1) * 30)
                    cv2.rectangle(frame, (px, py), (px + 30, py + 70), (230, 245, 255), -1)
                    cv2.circle(frame, (px + 15, py + 35), 30, (0, 180, 240), -1)

                    # Vehicle movement
                    vx = int(w - 100 - (f_idx * 4.0) % (w - 140))
                    vy = int(fence_y + 110)
                    cv2.rectangle(frame, (vx, vy), (vx + 80, vy + 45), (200, 220, 240), -1)

                    # Text HUD
                    cv2.putText(frame, f"TEST_BORDER_FEED.MP4 [FRAME {f_idx:04d}]", (15, 25),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 255, 180), 1, cv2.LINE_AA)

                    out.write(frame)
                out.release()
                logger.info(f"Sample test video successfully generated at {fallback_path}")
            except Exception as e:
                logger.warning(f"Could not generate sample video: {e}")

    def _release_capture_unlocked(self):
        """Releases the current VideoCapture. Caller must hold capture_lock."""
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception as exc:
                logger.warning(f"Error releasing VideoCapture: {exc}")
            self.cap = None
        self.is_connected = False

    def _open_capture(self) -> bool:
        """Attempts to open RTSP or file video capture."""
        with self.capture_lock:
            self._release_capture_unlocked()

            target_src = self.source
            if not target_src or (self.is_rtsp and not str(target_src).lower().startswith(("rtsp://", "http://", "https://"))):
                if target_src is None or (isinstance(target_src, str) and not target_src.strip()):
                    target_src = settings.FALLBACK_VIDEO_PATH
                    self.is_rtsp = False

            if not self.is_rtsp and isinstance(target_src, str) and not os.path.exists(target_src) and not str(target_src).isdigit():
                target_src = settings.FALLBACK_VIDEO_PATH

            logger.info(f"Opening video source: {target_src}")
            try:
                if self.is_rtsp:
                    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|buffer_size;102400"

                source_arg: Any = int(target_src) if isinstance(target_src, str) and target_src.isdigit() else target_src
                self.cap = cv2.VideoCapture(source_arg)
                if self.cap.isOpened():
                    self.is_connected = True
                    logger.info(f"Successfully connected to stream: {target_src}")
                    return True

                logger.warning(f"Failed to open video source: {target_src}")
                self.is_connected = False
                return False
            except Exception as e:
                logger.error(f"Error opening capture: {e}")
                self.is_connected = False
                return False

    def _capture_loop(self):
        """
        Background worker thread reading frames, handling reconnects,
        and throttling to 15 FPS to conserve CPU.
        """
        logger.info(f"Starting capture loop at {self.target_fps} FPS throttling...")
        consecutive_failures = 0

        while self.is_running:
            loop_start = time.perf_counter()
            ret, frame = False, None
            wait_reconnect = False
            held_for_reload = False

            with self.capture_lock:
                if self.is_paused and self.latest_frame is not None:
                    time.sleep(0.05)
                    continue

                if self._hold_open:
                    wait_reconnect = True
                    held_for_reload = True
                elif self.cap is None or not self.cap.isOpened():
                    success = self._open_capture()
                    if not success:
                        consecutive_failures += 1
                        if consecutive_failures >= 3 and self.is_rtsp:
                            logger.warning(
                                f"RTSP unreachable. Falling back to local test video {settings.FALLBACK_VIDEO_PATH}"
                            )
                            self.source = settings.FALLBACK_VIDEO_PATH
                            self.is_rtsp = False
                            consecutive_failures = 0
                        wait_reconnect = True
                    elif self.cap is None or not self.cap.isOpened():
                        wait_reconnect = True
                    else:
                        ret, frame = self.cap.read()
                else:
                    ret, frame = self.cap.read()

                if not wait_reconnect and (not ret or frame is None):
                    # Local MP4 (and other files) loop continuously at EOF
                    if not self.is_rtsp and self.cap is not None:
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = self.cap.read()

                    if not ret or frame is None:
                        logger.warning("Stream dropped or frame empty. Reconnecting...")
                        self._release_capture_unlocked()
                        wait_reconnect = True

            if wait_reconnect:
                time.sleep(0.05 if held_for_reload else self.reconnect_delay)
                continue

            # Reset failure count on valid frame
            consecutive_failures = 0
            self.is_connected = True

            # Resize to standard frame resolution
            if frame.shape[1] != settings.FRAME_WIDTH or frame.shape[0] != settings.FRAME_HEIGHT:
                frame = cv2.resize(frame, (settings.FRAME_WIDTH, settings.FRAME_HEIGHT), interpolation=cv2.INTER_LINEAR)

            # Store latest frame with thread safety
            with self.lock:
                self.latest_frame = frame.copy()

            # CPU Throttling: maintain target FPS adjusted for playback speed
            target_interval = self.frame_interval / max(0.25, self.playback_speed)
            elapsed = time.perf_counter() - loop_start
            sleep_time = max(0.0, target_interval - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

        with self.capture_lock:
            self._release_capture_unlocked()
        logger.info("Capture loop stopped.")

    def play(self):
        """Resume video playback."""
        with self.capture_lock:
            self.is_paused = False
            logger.info("Playback resumed [PLAY]")

    def pause(self):
        """Pause video playback."""
        with self.capture_lock:
            self.is_paused = True
            logger.info("Playback paused [PAUSE]")

    def toggle_pause(self) -> bool:
        """Toggle play/pause state."""
        with self.capture_lock:
            self.is_paused = not self.is_paused
            logger.info(f"Playback toggle -> is_paused={self.is_paused}")
            return self.is_paused

    def seek_seconds(self, seconds: float):
        """Jump playback forward or backward by N seconds."""
        with self.capture_lock:
            if self.cap is None or not self.cap.isOpened():
                return
            fps = float(self.cap.get(cv2.CAP_PROP_FPS) or 15.0)
            curr_frame = float(self.cap.get(cv2.CAP_PROP_POS_FRAMES) or 0)
            total_frames = float(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1)
            target_frame = max(0.0, min(total_frames - 1.0, curr_frame + (seconds * fps)))
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
            logger.info(f"Video seek by {seconds}s: frame {curr_frame:.0f} -> {target_frame:.0f}")

    def seek_ratio(self, ratio: float):
        """Scrub playback to normalized timeline position (0.0 to 1.0)."""
        with self.capture_lock:
            if self.cap is None or not self.cap.isOpened():
                return
            total_frames = float(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1)
            target_frame = max(0.0, min(total_frames - 1.0, ratio * total_frames))
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
            logger.info(f"Video seek to ratio {ratio:.2f}: frame {target_frame:.0f}/{total_frames:.0f}")

    def set_speed(self, speed: float):
        """Set playback speed multiplier (0.5x, 1.0x, 1.5x, 2.0x)."""
        with self.capture_lock:
            self.playback_speed = max(0.25, min(4.0, float(speed)))
            logger.info(f"Playback speed set to {self.playback_speed}x")

    def get_playback_info(self) -> Dict[str, Any]:
        """Returns real-time playback telemetry metadata."""
        with self.capture_lock:
            is_file = not self.is_rtsp and self.source is not None and not str(self.source).isdigit()
            fps = float(self.cap.get(cv2.CAP_PROP_FPS) if self.cap else 15.0) or 15.0
            total_frames = float(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) if (self.cap and is_file) else 0)
            curr_frame = float(self.cap.get(cv2.CAP_PROP_POS_FRAMES) if (self.cap and is_file) else 0)

            duration_sec = round(total_frames / fps, 1) if (is_file and fps > 0) else 0.0
            current_sec = round(curr_frame / fps, 1) if (is_file and fps > 0) else 0.0
            progress_ratio = round(curr_frame / max(1.0, total_frames), 4) if (is_file and total_frames > 0) else 0.0

            return {
                "is_paused": self.is_paused,
                "playback_speed": self.playback_speed,
                "is_file": is_file,
                "current_sec": current_sec,
                "duration_sec": duration_sec,
                "progress_ratio": progress_ratio,
            }

    def get_latest_frame(self) -> Optional[np.ndarray]:
        """Returns the most recent frame safely from the thread buffer."""
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

    def set_source(self, new_source: str):
        """Updates the video source dynamically (RTSP URL, file path, or webcam)."""
        self.reload_stream(new_source)

    def release_for_reload(self):
        """
        Releases the open VideoCapture so the source file can be overwritten
        (required on Windows) without stopping the capture thread or WebSockets.
        The capture loop will wait until reload_stream() opens the new file.
        """
        with self.capture_lock:
            logger.info("Releasing capture ahead of stream reload.")
            self._hold_open = True
            self._release_capture_unlocked()

    def reload_stream(self, new_source_path: str) -> bool:
        """
        Thread-safe hot-swap of the OpenCV source.

        Releases the existing VideoCapture and opens `new_source_path` while the
        background capture thread and any connected WebSocket clients keep running.
        Local files loop from frame 0 when they reach the last frame.
        """
        if new_source_path is None or (isinstance(new_source_path, str) and not str(new_source_path).strip()):
            logger.error("reload_stream called without a source path")
            return False

        source = str(new_source_path).strip()
        with self.capture_lock:
            logger.info(f"Reloading video stream -> {source}")
            self.source = source
            self.is_rtsp = bool("rtsp://" in source.lower() or "http://" in source.lower())
            self._hold_open = False
            self._release_capture_unlocked()
            opened = self._open_capture()
            if opened:
                logger.info(f"Stream reloaded successfully: {self.source}")
            else:
                logger.warning(f"Stream reload failed to open: {self.source}")
            return opened

    def start(self):
        """Starts the background capture thread."""
        if self.is_running:
            return
        self.is_running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True, name="VideoStreamThread")
        self.thread.start()

    def stop(self):
        """Stops the background capture thread."""
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)


# Singleton stream handler instance
video_stream_handler = VideoStreamHandler()

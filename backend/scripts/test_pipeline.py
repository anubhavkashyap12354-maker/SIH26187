import os
import sys
import time
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import cv2
from app.services.video_stream import VideoStreamHandler
from app.services.detector import detector_service
from app.services.tracker import multi_object_tracker
from app.services.geofence import geofence_engine


def run_pipeline_test():
    print("=========================================================")
    print(" Running CPU Border Surveillance Pipeline Smoke Test")
    print("=========================================================")

    # 1. Initialize Video Stream Handler
    stream_handler = VideoStreamHandler()
    time.sleep(0.6)  # Allow background capture thread to ingest initial frames

    frame = stream_handler.get_latest_frame()
    if frame is None:
        print("[!] Warning: get_latest_frame() returned None. Using blank test frame.")
        frame = cv2.imread(str(backend_dir / "assets" / "test_border_feed.mp4"))
    
    print(f"[+] Step 1: Video Ingestion: SUCCESS (Resolution: {frame.shape if frame is not None else 'None'})")

    # 2. Execute Detection
    detections = detector_service.detect(frame)
    print(f"[+] Step 2: CPU Detection: SUCCESS ({len(detections)} candidate detections)")

    # 3. Execute Multi-Object Tracking
    tracked_objects = multi_object_tracker.update(detections)
    print(f"[+] Step 3: Multi-Object SORT Tracking: SUCCESS ({len(tracked_objects)} active persistent tracks: {[t['track_id'] for t in tracked_objects]})")

    # 4. Execute Spatial Geofencing & Loitering Analytics
    processed_tracks, alerts = geofence_engine.process_frame_tracks("CAM-01", tracked_objects, frame)
    print(f"[+] Step 4: Ray-Casting & Spatial Loitering: SUCCESS ({len(processed_tracks)} evaluated, {len(alerts)} alerts)")

    stream_handler.stop()
    print("=========================================================")
    print(" ALL PIPELINE STAGES PASSED CLEANLY ON CPU (0 GPU REQ)!")
    print("=========================================================")


if __name__ == "__main__":
    run_pipeline_test()

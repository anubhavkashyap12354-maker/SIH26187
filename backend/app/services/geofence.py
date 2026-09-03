import base64
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from app.core.config import settings

logger = logging.getLogger("BorderGuardAI.Geofence")


class GeofenceAnalyticsEngine:
    """
    Spatial behavior and geofence analytics engine.
    - Uses vector-based Ray-Casting algorithm for point-in-polygon tests.
    - Evaluates both center anchor and foot/base anchor points for ground accuracy.
    - Tracks entity loitering duration inside exclusion zones.
    - Triggers INTRUSION_ALERT events when loitering duration exceeds 3.0 seconds.
    - Generates base64 crop snapshots of intruders.
    """

    def __init__(self, loitering_threshold: float = 3.0, alert_cooldown: float = 5.0):
        self.loitering_threshold = loitering_threshold  # seconds before intrusion alert
        self.alert_cooldown = alert_cooldown  # cooldown between repeat alerts for same track
        # Per-camera exclusion zones: { camera_id: [(x1, y1), (x2, y2), ...] }
        self.exclusion_zones: Dict[str, List[Tuple[float, float]]] = {
            "CAM-01": settings.RESTRICTED_ZONE_POLYGON,
            "default": settings.RESTRICTED_ZONE_POLYGON,
        }
        # Loitering state tracker: { (camera_id, track_id): { "entry_time": float, "last_alert_time": float, "is_alerted": bool } }
        self.track_states: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def set_zone(self, camera_id: str, polygon: List[Tuple[float, float]]):
        """Sets or updates the polygonal exclusion zone for a camera."""
        if len(polygon) < 3:
            raise ValueError("A valid exclusion zone polygon requires at least 3 coordinate vertices.")
        self.exclusion_zones[camera_id] = polygon
        logger.info(f"Updated exclusion zone for {camera_id}: {polygon}")

    def get_zone(self, camera_id: str = "default") -> List[Tuple[float, float]]:
        """Returns the current polygon coordinates for the given camera."""
        return self.exclusion_zones.get(camera_id, self.exclusion_zones.get("default", []))

    @staticmethod
    def ray_casting_point_in_polygon(point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
        """
        Fast Ray-Casting algorithm using NumPy / vector mathematics to determine
        if point (x, y) lies inside polygon [(x1, y1), (x2, y2), ...].
        """
        x, y = point
        n = len(polygon)
        if n < 3:
            return False

        inside = False
        p1x, p1y = polygon[0]
        for i in range(1, n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y

        return inside

    def generate_snapshot_base64(self, frame: np.ndarray, bbox: List[int]) -> str:
        """Crops the intruder bounding box with padding and returns base64 JPEG."""
        try:
            h, w = frame.shape[:2]
            x1, y1, x2, y2 = bbox
            pad = 20
            crop_x1 = max(0, x1 - pad)
            crop_y1 = max(0, y1 - pad)
            crop_x2 = min(w, x2 + pad)
            crop_y2 = min(h, y2 + pad)

            crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
            if crop.size == 0:
                crop = frame

            # Draw tactical red border on snapshot
            cv2.rectangle(crop, (2, 2), (crop.shape[1] - 4, crop.shape[0] - 4), (0, 0, 255), 2)

            _, buffer = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            return f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"
        except Exception as e:
            logger.error(f"Error creating snapshot: {e}")
            return ""

    def process_frame_tracks(
        self,
        camera_id: str,
        tracks: List[Dict[str, Any]],
        frame: np.ndarray,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Evaluates tracked entities against the camera's exclusion zone,
        maintains loitering timers, and raises INTRUSION_ALERT events for >= 3s loitering.
        """
        current_time = time.time()
        h, w = frame.shape[:2]
        zone = self.get_zone(camera_id)

        processed_tracks = []
        alerts = []
        active_keys = set()

        for track in tracks:
            track_id = track["track_id"]
            bbox = track["bbox"]
            class_name = track["class_name"]
            conf = track["confidence"]
            state_key = (camera_id, track_id)
            active_keys.add(state_key)

            # Fixed scaling typo: norm_cx and norm_cy both correctly scale by w and h respectively
            norm_cx = max(0.0, min(1.0, (bbox[0] + bbox[2]) / (2.0 * float(w))))
            norm_cy = max(0.0, min(1.0, (bbox[1] + bbox[3]) / (2.0 * float(h))))

            # Foot ground-contact anchor point (center-bottom of bounding box)
            norm_foot_x = max(0.0, min(1.0, (bbox[0] + bbox[2]) / (2.0 * float(w))))
            norm_foot_y = max(0.0, min(1.0, float(bbox[3]) / float(h)))

            # Inside if either center OR ground foot position intersects polygon
            inside_center = self.ray_casting_point_in_polygon((norm_cx, norm_cy), zone)
            inside_foot = self.ray_casting_point_in_polygon((norm_foot_x, norm_foot_y), zone)

            is_inside = inside_center or inside_foot
            loiter_duration = 0.0
            is_intrusion_alert = False

            if is_inside:
                if state_key not in self.track_states:
                    self.track_states[state_key] = {
                        "entry_time": current_time,
                        "last_alert_time": 0.0,
                        "is_alerted": False,
                    }

                state = self.track_states[state_key]
                loiter_duration = round(current_time - state["entry_time"], 2)

                # Check if loitering exceeded threshold (>= 3.0s)
                if loiter_duration >= self.loitering_threshold:
                    is_intrusion_alert = True
                    # Check alert cooldown
                    if current_time - state["last_alert_time"] >= self.alert_cooldown:
                        state["last_alert_time"] = current_time
                        state["is_alerted"] = True

                        snapshot_b64 = self.generate_snapshot_base64(frame, bbox)

                        alert_event = {
                            "alert_id": f"ALT-{int(current_time * 1000)}-{track_id}",
                            "camera_id": camera_id,
                            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                            "object_type": class_name,
                            "target_id": track_id,
                            "confidence": conf,
                            "loiter_duration_seconds": loiter_duration,
                            "type": "INTRUSION_ALERT",
                            "severity": "CRITICAL",
                            "message": f"Persistent Intrusion: {class_name.upper()} ({track_id}) inside Exclusion Zone for {loiter_duration}s!",
                            "snapshot_base64": snapshot_b64,
                            "bbox": bbox,
                        }
                        alerts.append(alert_event)
                        logger.warning(f"🚨 INTRUSION_ALERT: {alert_event['message']}")
            else:
                # Entity exited zone -> reset state
                if state_key in self.track_states:
                    del self.track_states[state_key]

            norm_bbox = [
                round(bbox[0] / float(w), 4),
                round(bbox[1] / float(h), 4),
                round(bbox[2] / float(w), 4),
                round(bbox[3] / float(h), 4),
            ]

            track_info = {
                **track,
                "class_name": "Person",
                "confidence_score": track.get("confidence_score", track.get("confidence", 0.9)),
                "normalized_bbox": track.get("normalized_bbox", norm_bbox),
                "in_restricted_zone": is_inside,
                "loiter_duration": loiter_duration,
                "threat_level": "CRITICAL" if (is_inside and loiter_duration >= self.loitering_threshold) else ("WARNING" if is_inside else "LOW"),
            }
            processed_tracks.append(track_info)

        # Cleanup disappeared tracks
        for key in list(self.track_states.keys()):
            if key not in active_keys:
                del self.track_states[key]

        return processed_tracks, alerts


# Singleton geofence engine instance
geofence_engine = GeofenceAnalyticsEngine()

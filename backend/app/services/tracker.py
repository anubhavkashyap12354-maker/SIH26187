import numpy as np
from typing import Any, Dict, List, Optional, Tuple


def calculate_iou(boxA: np.ndarray, boxB: np.ndarray) -> float:
    """Calculates Intersection-over-Union (IoU) between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_area = max(0.0, xB - xA) * max(0.0, yB - yA)
    boxA_area = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxB_area = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    union_area = boxA_area + boxB_area - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / union_area


def iou_batch(bb_test: np.ndarray, bb_gt: np.ndarray) -> np.ndarray:
    """Computes IOU between two sets of bounding boxes."""
    if bb_test.shape[0] == 0 or bb_gt.shape[0] == 0:
        return np.zeros((bb_test.shape[0], bb_gt.shape[0]))

    bb_gt = np.expand_dims(bb_gt, 0)
    bb_test = np.expand_dims(bb_test, 1)

    xx1 = np.maximum(bb_test[..., 0], bb_gt[..., 0])
    yy1 = np.maximum(bb_test[..., 1], bb_gt[..., 1])
    xx2 = np.minimum(bb_test[..., 2], bb_gt[..., 2])
    yy2 = np.minimum(bb_test[..., 3], bb_gt[..., 3])

    w = np.maximum(0.0, xx2 - xx1)
    h = np.maximum(0.0, yy2 - yy1)
    wh = w * h
    o = wh / (
        (bb_test[..., 2] - bb_test[..., 0]) * (bb_test[..., 3] - bb_test[..., 1])
        + (bb_gt[..., 2] - bb_gt[..., 0]) * (bb_gt[..., 3] - bb_gt[..., 1])
        - wh
    )
    return o


def linear_assignment(cost_matrix: np.ndarray, threshold: float = 0.3) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Lightweight greedy / linear sum assignment on CPU without heavy scipy bindings if needed.
    Tries scipy linear_sum_assignment first, falls back to greedy matching.
    """
    try:
        from scipy.optimize import linear_sum_assignment
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        matched_indices = np.array(list(zip(row_ind, col_ind)))
    except ImportError:
        # Fallback greedy matching
        matched_indices = []
        if cost_matrix.size > 0:
            c = cost_matrix.copy()
            while True:
                min_val = np.min(c)
                if min_val > (1.0 - threshold):
                    break
                row, col = np.unravel_index(np.argmin(c), c.shape)
                matched_indices.append([row, col])
                c[row, :] = 1e5
                c[:, col] = 1e5
        matched_indices = np.array(matched_indices) if len(matched_indices) > 0 else np.empty((0, 2), dtype=int)

    unmatched_detections = []
    for d in range(cost_matrix.shape[0]):
        if len(matched_indices) == 0 or d not in matched_indices[:, 0]:
            unmatched_detections.append(d)

    unmatched_trackers = []
    for t in range(cost_matrix.shape[1]):
        if len(matched_indices) == 0 or t not in matched_indices[:, 1]:
            unmatched_trackers.append(t)

    # Filter out matches with cost > (1.0 - threshold)
    matches = []
    for m in matched_indices:
        if cost_matrix[m[0], m[1]] > (1.0 - threshold):
            unmatched_detections.append(m[0])
            unmatched_trackers.append(m[1])
        else:
            matches.append(m.reshape(1, 2))

    if len(matches) == 0:
        matches = np.empty((0, 2), dtype=int)
    else:
        matches = np.concatenate(matches, axis=0)

    return matches, np.array(unmatched_detections), np.array(unmatched_trackers)


class KalmanBoxTracker:
    """
    Kalman Filter model for tracking bounding boxes [x1, y1, x2, y2] in image space.
    State representation: [x, y, s, r, vx, vy, vs] where:
    - x, y: center of box
    - s: scale / area
    - r: aspect ratio
    - vx, vy, vs: respective velocities
    """
    count = 0

    def __init__(self, bbox: List[float], class_name: str = "person", confidence: float = 0.5):
        self.class_name = class_name
        self.confidence = confidence
        self.id = KalmanBoxTracker.count
        KalmanBoxTracker.count += 1

        self.time_since_update = 0
        self.hits = 1
        self.hit_streak = 1
        self.age = 0

        # State [x, y, s, r, vx, vy, vs]
        w = max(1.0, bbox[2] - bbox[0])
        h = max(1.0, bbox[3] - bbox[1])
        x = bbox[0] + w / 2.0
        y = bbox[1] + h / 2.0
        s = w * h
        r = w / h

        self.x = np.array([x, y, s, r, 0, 0, 0], dtype=np.float32)

        # Covariance matrices
        self.P = np.diag([10.0, 10.0, 10.0, 10.0, 10000.0, 10000.0, 10000.0])
        self.F = np.array([
            [1, 0, 0, 0, 1, 0, 0],
            [0, 1, 0, 0, 0, 1, 0],
            [0, 0, 1, 0, 0, 0, 1],
            [0, 0, 0, 1, 0, 0, 0],
            [0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 1],
        ], dtype=np.float32)

        self.H = np.array([
            [1, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 0],
        ], dtype=np.float32)

        self.R = np.diag([1.0, 1.0, 10.0, 10.0])
        self.Q = np.diag([1.0, 1.0, 1.0, 1.0, 0.01, 0.01, 0.0001])

        self.history: List[List[int]] = []

    def update(self, bbox: List[float], class_name: str, confidence: float):
        """Updates the state vector with observed bounding box measurement."""
        self.time_since_update = 0
        self.history = []
        self.hits += 1
        self.hit_streak += 1
        self.class_name = class_name
        self.confidence = confidence

        w = max(1.0, bbox[2] - bbox[0])
        h = max(1.0, bbox[3] - bbox[1])
        z = np.array([bbox[0] + w / 2.0, bbox[1] + h / 2.0, w * h, w / h], dtype=np.float32)

        # Kalman Filter Measurement Update
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        I = np.eye(7)
        self.P = (I - K @ self.H) @ self.P

    def predict(self) -> List[int]:
        """Advances state vector and returns predicted bounding box [x1, y1, x2, y2]."""
        if self.x[6] + self.x[2] <= 0:
            self.x[6] = 0.0

        # State transition
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q

        self.age += 1
        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1

        box = self.get_state()
        self.history.append(box)
        return box

    def get_state(self) -> List[int]:
        """Converts current bounding box state [x, y, s, r] to [x1, y1, x2, y2]."""
        x, y, s, r = self.x[0], self.x[1], self.x[2], self.x[3]
        if s <= 0 or r <= 0:
            return [0, 0, 0, 0]
        w = np.sqrt(s * r)
        h = s / w
        return [int(x - w / 2.0), int(y - h / 2.0), int(x + w / 2.0), int(y + h / 2.0)]


class LightweightTracker:
    """
    CPU-optimized Multi-Object Tracker (SORT / ByteTrack variant).
    Maintains persistent object identities across video frames using Kalman Filtering + IoU Association.
    Enforces a strict 3-frame temporal verification filter to eliminate momentary transient noise.
    """

    def __init__(self, max_age: int = 15, min_hits: int = 3, iou_threshold: float = 0.3):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.trackers: List[KalmanBoxTracker] = []
        self.frame_count = 0

    def update(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Updates trackers with detections from the current frame.
        detections format: [{'bbox': [x1, y1, x2, y2], 'confidence': float, 'class_name': str}]
        Returns tracked entities with unique 'track_id' only after persisting for >= min_hits frames.
        """
        self.frame_count += 1

        # 1. Get predicted locations from existing trackers
        trks = np.zeros((len(self.trackers), 4))
        to_del = []
        for t, trk in enumerate(self.trackers):
            pos = trk.predict()
            trks[t, :] = [pos[0], pos[1], pos[2], pos[3]]
            if np.any(np.isnan(pos)):
                to_del.append(t)

        for t in reversed(to_del):
            self.trackers.pop(t)

        # 2. Extract detection bounding boxes
        dets = np.zeros((len(detections), 4))
        for d, det in enumerate(detections):
            dets[d, :] = det["bbox"]

        # 3. Associate detections to existing trackers via IoU Cost Matrix
        if len(self.trackers) > 0 and len(detections) > 0:
            iou_matrix = iou_batch(dets, trks)
            cost_matrix = 1.0 - iou_matrix
            matched, unmatched_dets, unmatched_trks = linear_assignment(cost_matrix, threshold=self.iou_threshold)
        else:
            matched = np.empty((0, 2), dtype=int)
            unmatched_dets = np.arange(len(detections))
            unmatched_trks = np.arange(len(self.trackers))

        # 4. Update matched trackers with assigned detections
        for m in matched:
            det_idx, trk_idx = m[0], m[1]
            det = detections[det_idx]
            self.trackers[trk_idx].update(det["bbox"], det.get("class_name", "Person"), det.get("confidence_score", det.get("confidence", 0.9)))

        # 5. Create and initialise new trackers for unmatched detections
        for i in unmatched_dets:
            det = detections[i]
            trk = KalmanBoxTracker(det["bbox"], class_name=det.get("class_name", "Person"), confidence=det.get("confidence_score", det.get("confidence", 0.9)))
            self.trackers.append(trk)

        # 6. Build tracked output objects & prune stale tracks
        # REQUIREMENT 3: Target must persist across at least 3 consecutive frames (hit_streak >= 3)
        results = []
        i = len(self.trackers)
        for trk in reversed(self.trackers):
            d = trk.get_state()
            if (trk.time_since_update < 1) and (trk.hit_streak >= self.min_hits):
                conf_val = round(float(trk.confidence), 3)
                results.append({
                    "track_id": f"TRK-{trk.id:03d}",
                    "class_name": "Person",
                    "confidence_score": conf_val,
                    "confidence": conf_val,
                    "bbox": d,
                    "age": trk.age,
                    "hits": trk.hits,
                    "hit_streak": trk.hit_streak,
                })
            i -= 1
            # Remove dead tracks
            if trk.time_since_update > self.max_age:
                self.trackers.pop(i)

        return results


# Singleton tracker instance
multi_object_tracker = LightweightTracker()

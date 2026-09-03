import os
import sys
import time
import math
from pathlib import Path
import cv2
import numpy as np

# Determine output paths
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATHS = [
    ROOT_DIR / "assets" / "test_border_feed.mp4",
    ROOT_DIR / "backend" / "assets" / "test_border_feed.mp4"
]

WIDTH = 640
HEIGHT = 480
FPS = 15
DURATION_SECONDS = 30
TOTAL_FRAMES = FPS * DURATION_SECONDS


def generate_synthetic_border_feed():
    print(f"[*] Synthesizing {DURATION_SECONDS}s border security video ({TOTAL_FRAMES} frames @ {FPS} FPS)...")

    # Ensure output directories exist
    for p in OUTPUT_PATHS:
        os.makedirs(p.parent, exist_ok=True)

    primary_path = str(OUTPUT_PATHS[0])
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(primary_path, fourcc, float(FPS), (WIDTH, HEIGHT))

    if not out.isOpened():
        print(f"[!] Error: Could not open VideoWriter at {primary_path}")
        sys.exit(1)

    # Fence line parameters
    fence_y = int(HEIGHT * 0.42)

    for f in range(TOTAL_FRAMES):
        t = f / float(FPS)
        frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)

        # 1. Background Night-Vision Infrared Gradient
        for y in range(HEIGHT):
            ratio = y / float(HEIGHT)
            frame[y, :, 0] = int(20 + 35 * ratio)   # B (dark blue)
            frame[y, :, 1] = int(35 + 50 * ratio)   # G (thermal green)
            frame[y, :, 2] = int(25 + 40 * ratio)   # R (night gray)

        # 2. Add subtle grain/noise for night-vision realism
        noise = np.random.normal(0, 4, (HEIGHT, WIDTH, 3)).astype(np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # 3. Perimeter Security Fence & Barbed Wire Mesh
        cv2.line(frame, (0, fence_y), (WIDTH, fence_y), (80, 110, 90), 2)
        cv2.line(frame, (0, fence_y - 8), (WIDTH, fence_y - 8), (60, 90, 70), 1)

        # Draw wire mesh posts and diagonal supports
        for x in range(0, WIDTH, 32):
            cv2.line(frame, (x, fence_y - 12), (x, HEIGHT), (60, 90, 75), 2)
            cv2.line(frame, (x, fence_y), (x + 20, HEIGHT), (45, 65, 55), 1)
            cv2.line(frame, (x + 20, fence_y), (x, HEIGHT), (45, 65, 55), 1)

        # 4. Moving Human Silhouette (Infiltrator walking towards and loitering inside restricted sector)
        # Phase 1 (0-10s): Walks from upper-left towards fence
        # Phase 2 (10-22s): Penetrates fence into sector alpha and loiters
        # Phase 3 (22-30s): Walks along the inner fence
        if t < 10.0:
            prog = t / 10.0
            px = int(80 + prog * 180)
            py = int(120 + prog * (fence_y - 60))
        elif t < 22.0:
            # Loitering inside restricted zone
            loiter_t = t - 10.0
            px = int(260 + math.sin(loiter_t * 0.8) * 35)
            py = int(fence_y + 45 + math.cos(loiter_t * 0.5) * 20)
        else:
            prog = (t - 22.0) / 8.0
            px = int(260 + prog * 220)
            py = int(fence_y + 55 + math.sin(prog * math.pi * 3) * 15)

        # Draw Human Silhouette (head, torso, legs with walk cycle)
        walk_cycle = math.sin(t * 8.0)
        head_radius = 9
        torso_w, torso_h = 22, 38

        # Thermal signature glow
        cv2.circle(frame, (px, py), 28, (0, 160, 230), -1)

        # Head
        cv2.circle(frame, (px, py - torso_h // 2 - head_radius), head_radius, (230, 245, 255), -1)
        # Torso
        cv2.rectangle(frame, (px - torso_w // 2, py - torso_h // 2), (px + torso_w // 2, py + torso_h // 2), (230, 245, 255), -1)
        # Legs (articulating)
        leg1_offset = int(walk_cycle * 8)
        leg2_offset = int(-walk_cycle * 8)
        cv2.line(frame, (px - 5, py + torso_h // 2), (px - 7 + leg1_offset, py + torso_h // 2 + 25), (230, 245, 255), 4)
        cv2.line(frame, (px + 5, py + torso_h // 2), (px + 7 + leg2_offset, py + torso_h // 2 + 25), (230, 245, 255), 4)

        # 5. Secondary Vehicle Patrol Silhouette (Periodic border sweep)
        vx = int((f * 4.5) % (WIDTH + 200) - 100)
        vy = int(HEIGHT * 0.85)
        # Thermal glow & vehicle body
        cv2.rectangle(frame, (vx - 10, vy - 10), (vx + 90, vy + 45), (0, 120, 200), -1)
        cv2.rectangle(frame, (vx, vy), (vx + 80, vy + 35), (220, 235, 255), -1)
        cv2.rectangle(frame, (vx + 15, vy - 14), (vx + 60, vy), (200, 220, 245), -1)
        # Wheels
        cv2.circle(frame, (vx + 18, vy + 35), 8, (120, 140, 160), -1)
        cv2.circle(frame, (vx + 62, vy + 35), 8, (120, 140, 160), -1)

        # 6. OSD HUD Overlay
        time_display = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(1725043000 + int(t)))
        ms = int((t % 1) * 100)
        cv2.putText(frame, f"CAM-NORTH-01 [IR NIGHT-VISION] | {time_display}.{ms:02d} ZULU", (15, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (120, 255, 200), 1, cv2.LINE_AA)
        cv2.putText(frame, f"SECTOR ALPHA // GEOFENCE ACTIVE // FPS: {FPS} // FRAME: {f:04d}", (15, HEIGHT - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, (100, 220, 180), 1, cv2.LINE_AA)

        out.write(frame)

    out.release()
    print(f"[+] Successfully generated: {primary_path}")

    # Copy to secondary location if path differs
    if OUTPUT_PATHS[0] != OUTPUT_PATHS[1]:
        import shutil
        shutil.copy2(primary_path, str(OUTPUT_PATHS[1]))
        print(f"[+] Replicated to: {OUTPUT_PATHS[1]}")


if __name__ == "__main__":
    generate_synthetic_border_feed()

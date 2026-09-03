# 🛰️ SIH26187 — AI-Based Intelligent Video Analytics Platform for Border Surveillance

**Problem Statement Code:** SIH26187 | **Smart India Hackathon**  
**Architecture:** Zero GPU Requirement · Multi-core CPU-Optimised Edge & Workstation Architecture

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React_18_(Vite)-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![ONNX Runtime](https://img.shields.io/badge/Inference-ONNX_Runtime_CPU-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![YOLOv8](https://img.shields.io/badge/Detection-YOLOv8_Nano-FF4B4B)](https://docs.ultralytics.com/)
[![WebSockets](https://img.shields.io/badge/Streaming-WebSockets-010101)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![Docker](https://img.shields.io/badge/Deployment-Docker_Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

---

## 🧠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | FastAPI (Python 3.11) |
| **AI Inference** | YOLOv8 Nano via ONNX Runtime (CPU) |
| **Object Tracking** | SORT — Kalman Filter + IoU Association |
| **Video Ingestion** | OpenCV threaded capture @ 15 FPS |
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Real-time Comms** | WebSockets (`/ws/stream`) |
| **Containerisation** | Docker + Docker Compose |

---

## 🏗️ System Architecture & 4 Video Feed Input Modes

```mermaid
graph TD
    A1[Local Video Upload MP4 / AVI / MOV / MKV] --> B[OpenCV Threaded Ingestion @ 15 FPS]
    A2[Live Webcam / USB IR Camera] --> B
    A3[Custom RTSP CCTV IP Camera URL] --> B
    A4[Synthetic Border Patrol Simulation] --> B
    B --> C[YOLOv8 Nano CPU Detection via ONNX Runtime]
    C --> D[SORT Kalman Filter Multi-Object Tracker]
    D --> E[Spatial Geofencing and 3s Loitering Analytics Engine]
    E --> F[FastAPI WebSocket Stream Server /ws/stream]
    F --> G[React Tactical Command Center Dashboard]
    G --> H[Interactive Polygon Geofence Drawer and Audio Alerts]
```

---

## 📹 Video Feed Input Options

The platform features a **4-Mode Surveillance Input Console** allowing security operators to switch video feeds dynamically:

1. **Local Device Video Upload** — Upload `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`, `.flv` files; OpenCV hot-reloads the stream and AI detection begins immediately.
2. **Live Webcam / USB Camera** — Connect to integrated webcams or external USB/IR thermal cameras (indices `0`, `1`, `2`).
3. **Custom RTSP CCTV Stream** — Enter any IP camera / NVR RTSP URL, e.g. `rtsp://admin:pass@192.168.1.100:554/stream1`.
4. **Synthetic Border Patrol Simulation** — Built-in test feed (`assets/test_border_feed.mp4`) for instant out-of-the-box testing.

---

## ⚡ Key Capabilities

- **Zero GPU** — YOLOv8n ONNX inference runs entirely on multi-core CPU (`CPUExecutionProvider`)
- **Persistent Tracking** — 7-state Kalman Filter assigns stable `TRK-001` IDs across occlusions
- **Spatial Geofencing** — Vectorised point-in-polygon ray-casting exclusion zones
- **Loitering Detection** — `INTRUSION_ALERT` triggers after >= 3.0 s inside the zone
- **Evidence Snapshots** — Intruder bounding-boxes auto-cropped & base64-encoded as JPEG thumbnails
- **Interactive SVG Geofence Tool** — Click-and-draw custom polygons over the live stream
- **Offline Siren Alarm** — Tactical chimes synthesised in-browser via `AudioContext`

---

## 🚀 Quickstart

### Prerequisites

| Tool | Minimum Version |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |

---

### Option A — Single-Command Launch (Recommended)

```powershell
# Windows PowerShell
.\start_backend.ps1
```

Open **http://localhost:8000** — FastAPI serves the full React UI directly.

---

### Option B — Manual Dev Setup

**1. Backend**

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**2. Frontend** (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

### Option C — Docker Compose

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| React Command Center | http://localhost:5173 |
| FastAPI REST + Docs | http://localhost:8000/docs |
| WebSocket Stream | ws://localhost:8000/ws/stream |

---

## 📡 API Reference

### `POST /api/upload-video`
Upload a local video file to inject into the live AI pipeline.

### `POST /api/stream-source`
Switch the active video source dynamically.
```json
{
  "source_type": "rtsp",
  "source_value": "rtsp://admin:password@192.168.1.100:554/stream1"
}
```
`source_type` values: `"file"` · `"webcam"` · `"rtsp"` · `"synthetic"`

### `POST /api/geofence`
Update the active exclusion-zone polygon (normalised 0–1 coordinates).
```json
{
  "camera_id": "CAM-01",
  "polygon": [[0.15, 0.35], [0.85, 0.35], [0.95, 0.90], [0.05, 0.90]]
}
```

### `GET /ws/stream`
WebSocket — streams JPEG frames + JSON detection events at ~15 FPS.

### `GET /docs`
Interactive Swagger UI for all REST endpoints.

---

## 📁 Project Structure

```
SIH26187/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + WebSocket stream
│   │   ├── api/              # REST route handlers
│   │   ├── core/             # Config & settings
│   │   └── services/         # Detection, tracking, geofencing logic
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Root dashboard component
│   │   ├── components/       # UI components
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── Dockerfile
├── assets/                   # Sample video feeds (gitignored)
├── docker-compose.yml
├── start_backend.ps1         # One-click Windows launcher
├── start_backend.bat
├── start_frontend.ps1
├── start_frontend.bat
├── run_backend.sh            # Unix launcher
├── run_frontend.sh
└── README.md
```

---

## 🔒 Security Notice

- Never commit `.env` files or API keys — they are gitignored.
- RTSP credentials in `source_value` are handled server-side and never logged.

---

## 📄 License

Developed for **Smart India Hackathon 2026** (Problem Code SIH26187).  
All rights reserved by the contributing team.

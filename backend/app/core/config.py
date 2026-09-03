import os
from pathlib import Path
from typing import List, Tuple
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """
    Core Application Settings for Border Surveillance Intelligent Video Analytics.
    Configured for high performance on CPU-only edge/workstation deployments.
    """
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application Metadata
    PROJECT_NAME: str = "BorderGuard AI - Intelligent Video Analytics"
    PROJECT_CODE: str = "SIH26187"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Server & CORS
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: List[str] = [
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

    # Video Stream Ingestion
    DEFAULT_RTSP_URL: str = ""
    FALLBACK_VIDEO_PATH: str = str(BASE_DIR / "assets" / "test_border_feed.mp4")
    STREAM_FPS: int = 15  # Throttled to 15 FPS to conserve CPU
    FRAME_WIDTH: int = 640
    FRAME_HEIGHT: int = 480
    JPEG_QUALITY: int = 75  # Optimal trade-off between network latency & visual clarity

    # AI Detection & Inference (CPU Optimized)
    MODEL_DIR: str = str(BASE_DIR / "models")
    ONNX_MODEL_PATH: str = str(BASE_DIR / "models" / "yolov8n.onnx")
    CONFIDENCE_THRESHOLD: float = 0.55
    IOU_THRESHOLD: float = 0.40
    CPU_NUM_THREADS: int = 4  # Intra-op thread pool size for ONNX Runtime
    
    # Filter detections exclusively for human target class (COCO 0: person)
    RELEVANT_CLASSES: List[str] = Field(
        default=["person"]
    )

    # Restricted Perimeter / Geo-Fence Zone Coordinates (Normalized 0.0 - 1.0)
    RESTRICTED_ZONE_POLYGON: List[Tuple[float, float]] = Field(
        default=[
            (0.15, 0.35),
            (0.85, 0.35),
            (0.95, 0.90),
            (0.05, 0.90),
        ]
    )

    # Alerts & Anomaly Detection
    LOITERING_SECONDS_THRESHOLD: float = 4.0
    ENABLE_THERMAL_SIMULATION: bool = False
    ALERT_COOLDOWN_SECONDS: float = 2.0


settings = Settings()

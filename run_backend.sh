#!/usr/bin/env bash
# BorderGuard AI Backend Launcher (SIH26187)
set -e

echo "========================================================"
echo " Starting Border Surveillance Backend (SIH26187)"
echo "========================================================"

cd "$(dirname "$0")/backend"

if [ ! -d "venv" ]; then
    echo "[*] Creating Python 3 virtual environment..."
    python3 -m venv venv || python -m venv venv
fi

echo "[*] Activating virtual environment..."
source venv/bin/activate || source venv/Scripts/activate

echo "[*] Installing dependencies..."
pip install -r requirements.txt

echo "[*] Launching FastAPI Uvicorn Server on port 8000..."
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

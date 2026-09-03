@echo off
echo ========================================================
echo  Starting Border Surveillance Backend (SIH26187)
echo ========================================================
cd /d "%~dp0\backend"

if not exist "venv" (
    echo [*] Creating Python virtual environment...
    python -m venv venv
)

echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

echo [*] Installing / verifying dependencies...
pip install -r requirements.txt

echo [*] Starting FastAPI server with Uvicorn on port 8000...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause

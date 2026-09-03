# Start Border Surveillance Backend (SIH26187)
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Starting Border Surveillance Backend (SIH26187)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\backend"

if (-not (Test-Path "venv")) {
    Write-Host "[*] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

Write-Host "[*] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

Write-Host "[*] Installing / verifying dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

Write-Host "[*] Starting FastAPI server on port 8000..." -ForegroundColor Green
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

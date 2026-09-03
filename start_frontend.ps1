# Start Border Surveillance Frontend (SIH26187)
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Starting Border Surveillance Frontend (SIH26187)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Installing NPM packages..." -ForegroundColor Yellow
    npm install
}

Write-Host "[*] Launching Vite development server..." -ForegroundColor Green
npm run dev

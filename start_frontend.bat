@echo off
echo ========================================================
echo  Starting Border Surveillance Frontend (SIH26187)
echo ========================================================
cd /d "%~dp0\frontend"

if not exist "node_modules" (
    echo [*] Installing NPM packages...
    npm install
)

echo [*] Launching Vite development server...
npm run dev
pause

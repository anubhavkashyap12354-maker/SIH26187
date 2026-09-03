#!/usr/bin/env bash
# BorderGuard AI Frontend Launcher (SIH26187)
set -e

echo "========================================================"
echo " Starting Border Surveillance Frontend (SIH26187)"
echo "========================================================"

cd "$(dirname "$0")/frontend"

if [ ! -d "node_modules" ]; then
    echo "[*] Installing NPM dependencies..."
    npm install
fi

echo "[*] Launching Vite dev server on port 5173..."
npm run dev

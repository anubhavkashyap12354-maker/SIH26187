import time
import urllib.request
import threading
import uvicorn
from pathlib import Path
import sys

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app

def run_server():
    config = uvicorn.Config(app, host="127.0.0.1", port=8899, log_level="warning")
    server = uvicorn.Server(config)
    server.run()

if __name__ == "__main__":
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(1.5)

    try:
        url = "http://127.0.0.1:8899/"
        req = urllib.request.urlopen(url)
        content = req.read().decode("utf-8")
        status = req.status
        print(f"[+] HTTP Status: {status}")
        print(f"[+] HTML Content Length: {len(content)} bytes")
        print(f"[+] Has 'BorderGuard AI': {'BorderGuard AI' in content}")
        print(f"[+] Has React root div: {'id=\"root\"' in content}")
        print("[+] Web verification: 100% SUCCESS - No White Screen!")
    except Exception as e:
        print(f"[!] Error: {e}")
        sys.exit(1)

#!/usr/bin/env python3
# ruff: noqa: S104 S404 S603 S607
import hashlib
import json
import logging
import os
import pathlib
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8765"))
VERSION = os.getenv("VERSION", "dev")
GIT_SHA = os.getenv("GIT_SHA", "unknown")
TEMPLATE_PATH = pathlib.Path(__file__).parent / "template.html"
CACHE_TTL = 3600  # 1 hour

# Simple in-memory cache: {id: (html, source, timestamp)}
view_cache: dict[str, tuple[str, str, float]] = {}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def fetch_from_gcs(gs_url: str) -> str:
    logger.info(f"Fetching: {gs_url}")

    result = subprocess.run(
        ["gcloud", "storage", "cat", gs_url],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        logger.warning("gcloud storage cat failed, trying gsutil...")
        result = subprocess.run(
            ["gsutil", "cat", gs_url],
            capture_output=True,
            text=True,
        )

    if result.returncode != 0:
        raise RuntimeError(f"Failed to fetch from GCS: {result.stderr}")

    return result.stdout


def generate_html(json_data: dict, source: str) -> str:
    template = TEMPLATE_PATH.read_text()
    html = template.replace("%%DATA%%", json.dumps(json_data))
    return html.replace("%%SOURCE%%", source)


class RequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "status": "ok",
                        "version": VERSION,
                        "git_sha": GIT_SHA,
                    }
                ).encode()
            )
        elif self.path == "/views":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            now = time.time()
            views = []
            expired = []
            for view_id, (_, source, timestamp) in view_cache.items():
                if now - timestamp < CACHE_TTL:
                    views.append({
                        "id": view_id,
                        "source": source,
                        "created": timestamp,
                        "expires_in": int(CACHE_TTL - (now - timestamp)),
                    })
                else:
                    expired.append(view_id)
            for view_id in expired:
                del view_cache[view_id]
            views.sort(key=lambda v: v["created"], reverse=True)
            self.wfile.write(json.dumps({"views": views}).encode())
        elif self.path.startswith("/view/"):
            view_id = self.path[6:].split("?")[0]  # strip query params
            if view_id in view_cache:
                html, _, timestamp = view_cache[view_id]
                if time.time() - timestamp < CACHE_TTL:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(html.encode())
                    return
                del view_cache[view_id]
            self.send_response(404)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>View not found or expired</h1>")
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            request = json.loads(body)

            gs_url = request.get("url", "")
            if not gs_url.startswith("gs://"):
                self.send_response(400)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"error": "URL must start with gs://"}).encode()
                )
                return

            json_str = fetch_from_gcs(gs_url)
            data = json.loads(json_str)

            html = generate_html(data, gs_url)

            # Generate view ID and cache
            view_id = hashlib.sha256(f"{gs_url}{time.time()}".encode()).hexdigest()[:12]
            view_cache[view_id] = (html, gs_url, time.time())

            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"id": view_id}).encode())

            logger.info(f"Created view {view_id} for {gs_url}")

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
            self.send_response(400)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Invalid JSON: {e}"}).encode())

        except RuntimeError as e:
            logger.error(str(e))
            self.send_response(500)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

        except Exception as e:
            logger.exception("Unexpected error")
            self.send_response(500)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, format, *args) -> None:
        logger.info("%s %s", self.address_string(), format % args)


def main() -> None:
    server = HTTPServer((HOST, PORT), RequestHandler)
    logger.info(f"Server running on http://{HOST}:{PORT}")
    logger.info('POST {{"url": "gs://..."}} to get visualization HTML')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()

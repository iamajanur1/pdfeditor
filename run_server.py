"""Serve PDF Studio from the project directory, independent of the shell location."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
REQUIRED_ASSETS = (
    "index.html",
    "css/base.css",
    "css/landing.css",
    "css/theme.css",
    "css/responsive.css",
    "js/core/bootstrap.js",
    "js/ui/workspace.js",
)


class DevelopmentHandler(SimpleHTTPRequestHandler):
    """Serve files from PDF Studio with development-friendly cache settings."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def verify_project_files():
    """Fail early if an incomplete project was extracted."""
    missing_files = [
        asset for asset in REQUIRED_ASSETS if not (PROJECT_ROOT / asset).is_file()
    ]
    if missing_files:
        details = ", ".join(missing_files)
        raise FileNotFoundError(f"Incomplete PDF Studio folder: {details}")


def main():
    parser = argparse.ArgumentParser(description="Run PDF Studio locally")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    verify_project_files()

    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), DevelopmentHandler) as server:
            print(f"PDF Studio is running at http://localhost:{args.port}/")
            print(f"Serving files from: {PROJECT_ROOT}")
            print("Press Ctrl+C to stop.")
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                print("\nServer stopped.")
    except OSError as error:
        if error.errno in (48, 98, 10048):
            raise SystemExit(
                f"Port {args.port} is already in use. Stop the previous server "
                f"or run: python run_server.py --port 8001"
            ) from error
        raise


if __name__ == "__main__":
    main()

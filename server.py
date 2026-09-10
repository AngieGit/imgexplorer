"""Local image forensics teaching server using Pillow and stegano."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import base64
from io import BytesIO
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
import json
import os
import sysconfig

try:
    from PIL import ExifTags, Image
    from stegano import lsb
    LIBRARIES_READY = True
    LIBRARY_ERROR = ""
except ImportError as error:
    Image = None
    lsb = None
    LIBRARIES_READY = False
    LIBRARY_ERROR = str(error)

try:
    STEGANO_VERSION = version("stegano")
except PackageNotFoundError:
    STEGANO_VERSION = "not installed"
try:
    PILLOW_VERSION = version("Pillow")
except PackageNotFoundError:
    PILLOW_VERSION = "not installed"

MODULE_ROOT = Path(__file__).resolve().parent
PACKAGED_ROOT = Path(sysconfig.get_path("data")) / "share" / "imgexplorer"
ROOT = MODULE_ROOT if (MODULE_ROOT / "index.html").exists() else PACKAGED_ROOT
MAX_UPLOAD = 25 * 1024 * 1024


def image_metadata(data):
    with Image.open(BytesIO(data)) as image:
        exif = {}
        gps_raw = {}
        for key, value in image.getexif().items():
            name = ExifTags.TAGS.get(key, str(key))
            exif[name] = str(value)
        try:
            gps_ifd = image.getexif().get_ifd(ExifTags.IFD.GPSInfo)
            gps_raw = {ExifTags.GPSTAGS.get(gps_key, str(gps_key)): gps_value for gps_key, gps_value in gps_ifd.items()}
            exif["GPSInfo"] = {key: str(value) for key, value in gps_raw.items()}
        except (AttributeError, KeyError, TypeError):
            gps_raw = {}
        if gps_raw:
            exif["GPSInfo"]["LatitudeDecimal"] = gps_coordinate(gps_raw, "GPSLatitude", "GPSLatitudeRef")
            exif["GPSInfo"]["LongitudeDecimal"] = gps_coordinate(gps_raw, "GPSLongitude", "GPSLongitudeRef")
        return {
            "format": image.format,
            "mode": image.mode,
            "width": image.width,
            "height": image.height,
            "pixels": image.width * image.height,
            "frames": getattr(image, "n_frames", 1),
            "info": {key: str(value) for key, value in image.info.items() if key != "exif"},
            "exif": exif,
        }


def gps_coordinate(gps, coordinate_key, reference_key):
    values = gps.get(coordinate_key)
    if not values or len(values) != 3:
        return None
    try:
        decimal = sum(float(part) / (60 ** index) for index, part in enumerate(values))
        if gps.get(reference_key) in ("S", "W"):
            decimal *= -1
        return round(decimal, 7)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/tools":
            self.send_json({
                "pillow": {"available": LIBRARIES_READY, "version": PILLOW_VERSION},
                "stegano": {"available": LIBRARIES_READY, "version": STEGANO_VERSION},
                "error": LIBRARY_ERROR,
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path not in ("/api/metadata", "/api/stegano"):
            self.send_json({"error": "Unknown endpoint"}, 404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_UPLOAD:
            self.send_json({"error": "Upload must be between 1 byte and 25 MB"}, 413)
            return
        if not LIBRARIES_READY:
            self.send_json({"error": f"Install dependencies from requirements.txt: {LIBRARY_ERROR}"}, 503)
            return
        try:
            if self.path == "/api/metadata":
                self.send_json({"ok": True, "metadata": image_metadata(self.rfile.read(length))})
                return

            request = json.loads(self.rfile.read(length).decode("utf-8"))
            image_data = base64.b64decode(request["image"])
            with Image.open(BytesIO(image_data)) as image:
                cover = image.convert("RGB")
                if request.get("action", "encode") == "decode":
                    decoded = lsb.reveal(cover)
                    if not decoded:
                        self.send_json({"ok": False, "error": "No stegano payload was found in this image."}, 422)
                        return
                    try:
                        payload = json.loads(decoded)
                        if payload.get("kind") == "file":
                            self.send_json({
                                "ok": True,
                                "kind": "file",
                                "name": payload.get("name", "decoded.bin"),
                                "mime": payload.get("mime", "application/octet-stream"),
                                "data": payload.get("data", ""),
                            })
                        else:
                            self.send_json({"ok": True, "kind": "text", "text": payload.get("text", "")})
                    except json.JSONDecodeError:
                        self.send_json({"ok": True, "kind": "text", "text": decoded})
                    return

                payload = request.get("payload", {})
                encoded_payload = json.dumps(payload, ensure_ascii=False)
                encoded = lsb.hide(cover, encoded_payload)
                output = BytesIO()
                encoded.save(output, format="PNG")
            self.send_json({"ok": True, "mime": "image/png", "image": base64.b64encode(output.getvalue()).decode("ascii")})
        except (KeyError, ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": f"Invalid image or request: {error}"}, 400)
        except Exception as error:
            self.send_json({"error": str(error)}, 422)


def main():
    port = int(os.environ.get("PORT", "8000"))
    print(f"ImgExplorer running at http://localhost:{port}")
    print("Press Ctrl+C to stop.")
    ThreadingHTTPServer(("127.0.0.1", port), AppHandler).serve_forever()


if __name__ == "__main__":
    main()

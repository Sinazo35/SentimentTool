import io
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import app


def _request_body(event):
    body = event.get("body") or ""
    if event.get("isBase64Encoded", False):
        import base64
        body = base64.b64decode(body)
    elif isinstance(body, str):
        body = body.encode("utf-8")
    return body


def handler(event, context):
    """Translate Netlify's event request into a WSGI request."""
    headers = event.get("headers") or {}
    body = _request_body(event)
    request_headers = {str(key).lower(): str(value) for key, value in headers.items()}
    environ = {
        "REQUEST_METHOD": event.get("method", "GET"),
        "PATH_INFO": event.get("path", "/"),
        "QUERY_STRING": event.get("queryString", ""),
        "CONTENT_LENGTH": str(len(body)),
        "CONTENT_TYPE": request_headers.get("content-type", ""),
        "REMOTE_ADDR": request_headers.get("x-nf-client-connection-ip", "127.0.0.1"),
        "SERVER_NAME": request_headers.get("host", "localhost"),
        "SERVER_PORT": "443",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "https",
        "wsgi.input": io.BytesIO(body),
        "wsgi.errors": sys.stderr,
        "wsgi.multithread": True,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }
    for name, value in request_headers.items():
        if name.startswith("http_") or name in {"content_type", "content_length"}:
            continue
        environ[f"HTTP_{name.upper().replace('-', '_')}"] = value

    response_status = None
    response_headers = []

    def start_response(status, response_headers_value):
        nonlocal response_status, response_headers
        response_status = status
        response_headers = response_headers_value
        return lambda data: None

    response_body = b"".join(app(environ, start_response))
    status_code = int(response_status.split(" ", 1)[0])
    normalized_headers = {key: value for key, value in response_headers}
    return {
        "statusCode": status_code,
        "headers": normalized_headers,
        "body": response_body.decode("utf-8", errors="replace"),
        "isBase64Encoded": False,
    }

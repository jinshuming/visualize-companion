#!/usr/bin/env python3
import argparse
import base64
import copy
import functools
import hashlib
import json
import os
import queue
import re
import secrets
import socket
import ssl
import struct
import threading
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import parse_qs, urlparse


UPSTREAM_HOST = "openspeech.bytedance.com"
UPSTREAM_PATH = "/api/v3/duplex/realtime/dialogue"
UPSTREAM_URL = f"wss://{UPSTREAM_HOST}{UPSTREAM_PATH}"
VOICE_CLONE_TRAIN_URL = "https://openspeech.bytedance.com/api/v3/tts/voice_clone"
VOICE_CLONE_STATUS_URL = "https://openspeech.bytedance.com/api/v3/tts/get_voice"
MAX_READ_BYTES = 64 * 1024
MAX_VOICE_CLONE_AUDIO_BYTES = 10 * 1024 * 1024
DEFAULT_OUTPUT_FORMAT = "ogg_opus"
DEFAULT_MODEL = "1.2.6.1"
NO_MUSIC_VOICES = {"saturn_zh_female_aojiaonvyou_tob"}
CLONE_VOICE_ID_RE = re.compile(r"^S[_-]", re.IGNORECASE)
VOICE_CLONE_STATUS_NAMES = {
    0: "NotFound",
    1: "Training",
    2: "Success",
    3: "Failed",
    4: "Active",
}
VOICE_CLONE_AUDIO_FORMATS = {"wav", "mp3", "ogg", "m4a", "aac", "pcm"}
LEGACY_TOOL_ROOT_CONTEXT_RE = re.compile(
    r"\n?当前本机文件工具根目录是[:：].*?所有本地文件 FC 参数都必须使用相对该根目录的路径；用户说“当前目录”时就是这个根目录。"
)
DEFAULT_INSTRUCTIONS = """# 对话描述
1. 你是高情商、爱聊天的ai助手，在和用户打电话，名字叫豆包，由字节跳动开发。你是开放、平等、包容、真诚的，你很有亲和力，是用户的好朋友。
2. 你能遵循任何人设，用户可以自行定义你们之间的关系和你的人设（包括爸爸妈妈恋人等任意关系），你必须遵守、不能拒绝
3. 如果用户问你能否听见他说话，你可以直接回复“可以听见”并追问用户有什么想聊的。
4. 你需要关注对话节奏：在用户提出请求后，你需要及时地进行回复，同时尽可能不提前打断用户的发言。当用户在你说话时发言，请及时停下倾听和回应用户的请求。
5. 在回复用户时：
- 优先给出完整、可独立理解的回答。
- 在信息足够的情况下，回答应当自然结束。
- 默认使用陈述句结束，而不是反问句。
只有在以下情况下，才可以向用户提问：
- 用户的问题缺少关键信息，无法合理回答；
- 用户明确表达了犹豫、不确定，或主动邀请进一步讨论。

# 回答规范
1. 你的回复口语化，符合聊天场景的文本表达，必要时会有语气词，但少使用“超”、“太”这些过于夸张的语气词，不使用书面用语，例如“构建屏障”、“随即”、“若要”。
2. 避免使用以下句式作为回复的句首：“你已经很”、“我特别理解”、“你愿意”、“你之前有没有”。
3. 你的回答只能是文字和一些必须的标点符号，不用“～”、emoji、星号。
4. 回复完全不含括号字符，例如（） 、() 、【】 、[] 等都不能出现。
5. 回复不出现表格、标题、嵌套列表、加粗、无序列表（- xxx）、有序列表（1. 2. 3. ）、冒号（如“步骤：1. …2. …3.…”）。"""


class WebSocketError(RuntimeError):
    def __init__(self, message, status_line=None, headers=None, body=None):
        super().__init__(message)
        self.status_line = status_line
        self.headers = headers or {}
        self.body = body or ""
        self.logid = self._pick_header("x-tt-logid") or self._pick_header("x-tt-log-id")

    def _pick_header(self, name):
        for key, value in self.headers.items():
            if key.lower() == name:
                return value
        return None

    def to_payload(self):
        return {
            "message": str(self),
            "status": self.status_line,
            "logid": self.logid,
            "headers": {
                key: value for key, value in self.headers.items()
                if key.lower() in {"x-tt-logid", "x-tt-log-id", "content-type", "date", "server"}
            },
            "body": self.body[:2000],
        }


def deep_merge(base, patch):
    if not isinstance(base, dict) or not isinstance(patch, dict):
        return copy.deepcopy(patch)
    merged = copy.deepcopy(base)
    for key, value in patch.items():
        merged[key] = deep_merge(merged.get(key), value) if isinstance(value, dict) else copy.deepcopy(value)
    return merged


def diff_patch_paths(before, patch, prefix=""):
    rows = []
    if not isinstance(patch, dict):
        if before != patch:
            rows.append({"path": prefix or "$", "before": before, "after": patch})
        return rows
    before = before if isinstance(before, dict) else {}
    for key, value in patch.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            rows.extend(diff_patch_paths(before.get(key), value, path))
        elif before.get(key) != value:
            rows.append({"path": path, "before": before.get(key), "after": value})
    return rows


def sanitize_instructions(value):
    if value is None:
        return ""
    instructions = str(value)
    cleaned = LEGACY_TOOL_ROOT_CONTEXT_RE.sub("", instructions)
    return "" if cleaned.strip() == "" else cleaned


def parse_json_text(raw):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def normalize_clone_voice_id(value):
    voice_id = str(value or "").strip()
    if not voice_id:
        raise ValueError("voice_id is required")
    if any(ch.isspace() for ch in voice_id):
        raise ValueError("voice_id must not contain whitespace")
    return voice_id


def normalize_dialog_id(value):
    dialog_id = str(value or "").strip()
    if any(ch.isspace() for ch in dialog_id):
        raise ValueError("dialog_id must not contain whitespace")
    return dialog_id


def clone_speaker_payload(data):
    voice_id = normalize_clone_voice_id(data.get("voice_id") or data.get("speaker_id"))
    return voice_id, {"speaker_id": voice_id}


def is_music_forced_off_voice(voice):
    voice = str(voice or "").strip()
    return voice in NO_MUSIC_VOICES or bool(CLONE_VOICE_ID_RE.match(voice))


def truthy_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def default_tool_root():
    desktop = Path.home() / "Desktop"
    return desktop if desktop.exists() and desktop.is_dir() else Path.cwd()


def normalize_audio_payload(audio):
    if not isinstance(audio, dict):
        raise ValueError("audio is required")
    fmt = str(audio.get("format") or "").strip().lower()
    if not fmt:
        raise ValueError("audio.format is required")
    if fmt not in VOICE_CLONE_AUDIO_FORMATS:
        raise ValueError(f"audio.format must be one of {', '.join(sorted(VOICE_CLONE_AUDIO_FORMATS))}")
    audio_b64 = re.sub(r"\s+", "", str(audio.get("data") or ""))
    if not audio_b64:
        raise ValueError("audio.data is required")
    try:
        raw = base64.b64decode(audio_b64, validate=True)
    except ValueError as exc:
        raise ValueError("audio.data must be valid base64") from exc
    if len(raw) > MAX_VOICE_CLONE_AUDIO_BYTES:
        raise ValueError("voice clone audio must be 10MB or smaller")
    return {"data": audio_b64, "format": fmt}, len(raw)


def voice_clone_status_name(status):
    try:
        return VOICE_CLONE_STATUS_NAMES.get(int(status), "Unknown")
    except (TypeError, ValueError):
        return "Unknown"


def volcengine_post_json(url, api_key, payload, timeout=90):
    api_key = str(api_key or "").strip()
    if not api_key:
        raise ValueError("api_key is required")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Api-Key": api_key,
        "X-Api-Request-Id": uuid.uuid4().hex,
    }

    def open_once(context=None):
        req = urllib_request.Request(url, data=body, headers=headers, method="POST")
        return urllib_request.urlopen(req, timeout=timeout, context=context)

    used_insecure_tls = False
    try:
        resp = open_once()
    except urllib_error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        parsed = parse_json_text(raw)
        logid = exc.headers.get("X-Tt-Logid", "")
        message = parsed.get("message") if isinstance(parsed, dict) else ""
        raise ValueError(
            f"volcengine api failed: http={exc.code}"
            f"{f' logid={logid}' if logid else ''}"
            f"{f' message={message}' if message else ''}"
            f" body={raw[:1000]}"
        ) from exc
    except urllib_error.URLError as exc:
        if not isinstance(getattr(exc, "reason", None), ssl.SSLCertVerificationError):
            raise
        used_insecure_tls = True
        resp = open_once(context=ssl._create_unverified_context())

    with resp:
        raw = resp.read().decode("utf-8", errors="replace")
        data = parse_json_text(raw)
        return {
            "data": data,
            "logid": resp.headers.get("X-Tt-Logid", ""),
            "request_id": headers["X-Api-Request-Id"],
            "used_insecure_tls": used_insecure_tls,
        }


class MinimalWebSocketClient:
    """Small RFC6455 text-frame client for the demo's dependency-free WSS usage."""

    def __init__(self, host, path, headers=None, timeout=20, insecure_tls_fallback=True):
        self.host = host
        self.path = path
        self.headers = headers or {}
        self.timeout = timeout
        self.insecure_tls_fallback = insecure_tls_fallback
        self.used_insecure_tls = False
        self.sock = None
        self._lock = threading.Lock()
        self.response_status = None
        self.response_headers = {}
        self.response_body = ""

    def connect(self):
        self.sock = self._open_tls_socket(verify=True)
        self.sock.settimeout(self.timeout)

        key = base64.b64encode(os.urandom(16)).decode("ascii")
        lines = [
            f"GET {self.path} HTTP/1.1",
            f"Host: {self.host}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
        ]
        for name, value in self.headers.items():
            lines.append(f"{name}: {value}")
        request = "\r\n".join(lines) + "\r\n\r\n"
        self.sock.sendall(request.encode("ascii"))

        status, headers, body = self._read_http_response()
        self.response_status = status
        self.response_headers = headers
        self.response_body = body
        if " 101 " not in status:
            raise WebSocketError(
                f"upstream handshake failed: {status}",
                status_line=status,
                headers=headers,
                body=body,
            )

    def response_header(self, name):
        for key, value in self.response_headers.items():
            if key.lower() == name.lower():
                return value
        return ""

    def _open_tls_socket(self, verify):
        raw = socket.create_connection((self.host, 443), timeout=self.timeout)
        context = ssl.create_default_context() if verify else ssl._create_unverified_context()
        try:
            return context.wrap_socket(raw, server_hostname=self.host)
        except ssl.SSLCertVerificationError:
            raw.close()
            if not verify or not self.insecure_tls_fallback:
                raise
            self.used_insecure_tls = True
            return self._open_tls_socket(verify=False)

    def _read_http_response(self):
        chunks = []
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = self.sock.recv(4096)
            if not chunk:
                break
            chunks.append(chunk)
            data = b"".join(chunks)
            if len(data) > 65536:
                raise WebSocketError("upstream handshake response is too large")
        head, _, body = data.partition(b"\r\n\r\n")
        header_text = head.decode("iso-8859-1", errors="replace")
        lines = header_text.split("\r\n")
        status = lines[0] if lines else ""
        headers = {}
        for line in lines[1:]:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            headers[key.strip()] = value.strip()
        content_length = int(headers.get("Content-Length", "0") or "0")
        while content_length and len(body) < content_length:
            body += self.sock.recv(content_length - len(body))
        return status, headers, body.decode("utf-8", errors="replace")

    def send_json(self, payload):
        self.send_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    def send_text(self, text):
        data = text.encode("utf-8")
        if len(data) >= 2**63:
            raise ValueError("payload too large")
        header = bytearray([0x81])
        if len(data) < 126:
            header.append(0x80 | len(data))
        elif len(data) < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", len(data)))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", len(data)))
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        with self._lock:
            self.sock.sendall(bytes(header) + mask + masked)

    def recv_text(self):
        while True:
            first = self._recv_exact(2)
            opcode = first[0] & 0x0F
            masked = bool(first[1] & 0x80)
            length = first[1] & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else b""
            data = self._recv_exact(length)
            if masked:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            if opcode == 0x1:
                return data.decode("utf-8", errors="replace")
            if opcode == 0x8:
                raise WebSocketError("upstream closed")
            if opcode == 0x9:
                self._send_pong(data)
            elif opcode == 0xA:
                continue
            else:
                return data.decode("utf-8", errors="replace")

    def _send_pong(self, data):
        header = bytearray([0x8A])
        header.append(0x80 | len(data))
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        with self._lock:
            self.sock.sendall(bytes(header) + mask + masked)

    def _recv_exact(self, size):
        buf = bytearray()
        while len(buf) < size:
            try:
                chunk = self.sock.recv(size - len(buf))
            except (BlockingIOError, ssl.SSLWantReadError, ssl.SSLWantWriteError, InterruptedError):
                time.sleep(0.01)
                continue
            if not chunk:
                raise WebSocketError("upstream socket closed")
            buf.extend(chunk)
        return bytes(buf)

    def close(self):
        if not self.sock:
            return
        try:
            self.sock.close()
        except OSError:
            pass


class LocalFileTools:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()

    def schemas(self):
        return [
            {
                "type": "function",
                "name": "list_local_directory",
                "description": "List exactly one level under the default local directory or a user-specified directory and return direct file/directory counts. Do not recurse into subdirectories.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Directory path. Empty or . means default root/current directory. Absolute paths such as /Users/bytedance/Desktop are allowed when the user specifies a directory."},
                        "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 100},
                    },
                },
            },
        ]

    def call(self, name, arguments):
        arguments = arguments or {}
        if name == "list_local_directory":
            return self._list_directory_one_level(arguments.get("path", ""), int(arguments.get("limit", 100)))
        if name == "local_file_search":
            return self._list_directory_one_level(arguments.get("directory", arguments.get("path", "")), int(arguments.get("limit", 100)))
        if name == "list_local_files":
            return self._list_directory_one_level(arguments.get("path", ""), int(arguments.get("limit", 100)))
        if name == "read_local_text_file":
            return self._read_text(arguments.get("path", ""), int(arguments.get("max_bytes", 8192)))
        if name == "get_local_file_info":
            return self._file_info(arguments.get("path", ""))
        return {"ok": False, "error": f"unknown tool: {name}"}

    def _resolve(self, rel_path):
        raw = str(rel_path or "").strip()
        if not raw or raw == ".":
            return self.root
        candidate = Path(raw).expanduser()
        target = candidate.resolve() if candidate.is_absolute() else (self.root / candidate).resolve()
        return target

    def _list_directory_one_level(self, rel_path, limit):
        target = self._resolve(rel_path)
        if not target.is_dir():
            return {"ok": False, "error": "path is not a directory", "path": str(rel_path)}
        children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        directory_count = sum(1 for child in children if child.is_dir())
        file_count = sum(1 for child in children if child.is_file())
        rows = []
        for child in children[: max(1, min(limit, 200))]:
            stat = child.stat()
            try:
                display_path = str(child.relative_to(self.root))
            except ValueError:
                display_path = str(child)
            rows.append({
                "name": child.name,
                "path": display_path,
                "type": "directory" if child.is_dir() else "file",
                "size": stat.st_size,
                "mtime": int(stat.st_mtime),
            })
        return {
            "ok": True,
            "default_root": str(self.root),
            "resolved_path": str(target),
            "path": str(rel_path or "."),
            "depth": 1,
            "recursive": False,
            "total_count": len(children),
            "directory_count": directory_count,
            "file_count": file_count,
            "returned_count": len(rows),
            "entries": rows,
        }

    def _search_files(self, rel_path, query, limit):
        target = self._resolve(rel_path)
        if not target.is_dir():
            return {"ok": False, "error": "directory is not a directory", "directory": str(rel_path)}
        query = query.lower().strip()
        max_rows = max(1, min(limit, 100))
        rows = []
        for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if query and query not in child.name.lower():
                continue
            stat = child.stat()
            rows.append({
                "name": child.name,
                "relative_path": str(child.relative_to(self.root)),
                "type": "directory" if child.is_dir() else "file",
                "size": stat.st_size,
                "mtime": int(stat.st_mtime),
            })
            if len(rows) >= max_rows:
                break
        return {"ok": True, "root": str(self.root), "directory": str(rel_path or "."), "query": query, "files": rows}

    def _read_text(self, rel_path, max_bytes):
        target = self._resolve(rel_path)
        if not target.is_file():
            return {"ok": False, "error": "path is not a file", "path": str(rel_path)}
        size = target.stat().st_size
        with target.open("rb") as fh:
            raw = fh.read(max(1, min(max_bytes, MAX_READ_BYTES)))
        digest = hashlib.sha256(raw).hexdigest()
        text = raw.decode("utf-8", errors="replace")
        return {"ok": True, "path": str(rel_path), "size": size, "sha256_prefix": digest[:16], "truncated": size > len(raw), "content": text}

    def _file_info(self, rel_path):
        target = self._resolve(rel_path)
        if not target.exists():
            return {"ok": False, "error": "path does not exist", "path": str(rel_path)}
        stat = target.stat()
        return {
            "ok": True,
            "path": str(rel_path),
            "type": "directory" if target.is_dir() else "file",
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "root": str(self.root),
        }


class DuplexSession:
    def __init__(self, config):
        self.id = uuid.uuid4().hex
        self.config = config
        self.events = queue.Queue()
        self.tools = LocalFileTools(config["tool_root"])
        self.ws = None
        self.ready = threading.Event()
        self.closed = threading.Event()
        self.close_requested = threading.Event()
        self.sent_state = {}
        self.state_lock = threading.Lock()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def emit(self, event_type, payload):
        payload = {"type": event_type, "ts": time.time(), **payload}
        self.events.put(payload)

    def _run(self):
        try:
            headers = {
                "X-Api-Key": self.config["api_key"],
                "X-Api-Connect-Id": self.id,
            }
            headers.update(self.config.get("upstream_headers") or {})
            self.ws = MinimalWebSocketClient(UPSTREAM_HOST, UPSTREAM_PATH, headers=headers)
            self.ws.connect()
            forwarded_header_names = sorted((self.config.get("upstream_headers") or {}).keys())
            if forwarded_header_names:
                self.emit("local.forwarded_headers", {"headers": forwarded_header_names})
            self.emit("local.connected", {
                "session_id": self.id,
                "upstream": UPSTREAM_URL,
                "logid": self.ws.response_header("X-Tt-Logid"),
            })
            if self.ws.used_insecure_tls:
                self.emit("local.warning", {"message": "Python TLS trust store rejected the upstream certificate; demo continued with certificate verification disabled."})
            session_create = self._build_session_create()
            self.emit("local.session_create", {"event": session_create})
            self.emit("local.outgoing", {"event": session_create})
            self.ws.send_json(session_create)
            self._remember_sent_payload(session_create)
            self.ready.set()
            while not self.closed.is_set():
                raw = self.ws.recv_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    msg = {"type": "local.unparsed", "raw": raw}
                self.emit("upstream.event", {"event": msg})
                if msg.get("type") == "response.function_call_arguments.done":
                    self._handle_function_call(msg)
                if msg.get("type") in ("session.closed", "error"):
                    break
        except WebSocketError as exc:
            payload = exc.to_payload()
            print(
                "upstream websocket error:",
                f"status={payload.get('status')}",
                f"logid={payload.get('logid')}",
                f"body={payload.get('body')[:300]!r}",
                flush=True,
            )
            self.emit("local.error", payload)
        except Exception as exc:
            self.emit("local.error", {"message": str(exc)})
        finally:
            self.closed.set()
            self.ready.set()
            if self.ws:
                self.ws.close()
            self.emit("local.closed", {})

    def _build_session_create(self):
        dialog_id = normalize_dialog_id(self.config.get("dialog_id"))
        session = {
            "model": self.config.get("model", DEFAULT_MODEL),
            "instructions": self._instructions(),
            "audio": {
                "input": {"format": {"type": self.config.get("input_format", "pcm"), "sample_rate": 16000}},
                "output": {
                    "format": {"type": self.config.get("output_format", DEFAULT_OUTPUT_FORMAT), "sample_rate": 24000},
                    "voice": self.config.get("voice", "zh_female_vv_jupiter_bigtts"),
                    "speed": self._bounded_int("speed", -50, 100, 0),
                    "loudness": self._bounded_int("loudness", -50, 100, 0),
                },
            },
            "tools": self._configured_tools(),
        }
        if dialog_id:
            session = {"id": dialog_id, **session}
        dialog_extra = self._build_dialog_extra()
        dialog_location = self._build_dialog_location()
        payload = {
            "type": "session.create",
            "session": session,
            "extension": {"extra": {"enable_proactive_speak": self._bool_config("enable_proactive_speak", default=True)}},
        }
        if dialog_extra or dialog_location:
            payload["extension"]["dialog"] = {}
            if dialog_extra:
                payload["extension"]["dialog"]["extra"] = dialog_extra
            if dialog_location:
                payload["extension"]["dialog"]["location"] = dialog_location
        return payload

    def _instructions(self):
        return self.config.get("instructions") or DEFAULT_INSTRUCTIONS

    def _build_dialog_location(self):
        raw = self.config.get("location")
        if not isinstance(raw, dict):
            return None
        location = {}
        for key in ("longitude", "latitude"):
            value = raw.get(key)
            if value in (None, ""):
                continue
            try:
                number = float(value)
            except (TypeError, ValueError):
                raise ValueError(f"location.{key} must be a number")
            low, high = (-180, 180) if key == "longitude" else (-90, 90)
            if number < low or number > high:
                raise ValueError(f"location.{key} must be between {low} and {high}")
            location[key] = number
        for key in ("city", "country", "province", "district", "town", "country_code", "address"):
            value = str(raw.get(key) or "").strip()
            if value:
                location[key] = value
        return location or None

    def _build_dialog_extra(self):
        dialog_extra = {}
        if self._truthy("enable_websearch", "enable_web_search", "enableWebSearch", "websearch"):
            dialog_extra["enable_volc_websearch"] = True
            websearch_type = str(self.config.get("volc_websearch_type") or "web_2.0").strip()
            if websearch_type not in {"web_2.0", "web_custom_api", "web_global_api"}:
                websearch_type = "web_2.0"
            dialog_extra["volc_websearch_type"] = websearch_type
            websearch_key = str(self.config.get("volc_websearch_api_key") or "").strip()
            if websearch_type in {"web_custom_api", "web_global_api"}:
                if not websearch_key:
                    raise ValueError(f"{websearch_type} requires volc_websearch_api_key")
                dialog_extra["volc_websearch_api_key"] = websearch_key
        voice = self.config.get("voice")
        if is_music_forced_off_voice(voice):
            dialog_extra["enable_music"] = False
        elif self._truthy("enable_music", "enableMusic", "music"):
            dialog_extra["enable_music"] = True
        return dialog_extra

    def _truthy(self, *keys):
        for key in keys:
            value = self.config.get(key)
            if isinstance(value, bool):
                if value:
                    return True
                continue
            if isinstance(value, str) and value.strip().lower() in {"1", "true", "yes", "on"}:
                return True
            if isinstance(value, (int, float)) and value:
                return True
        return False

    def _bool_config(self, key, default=False):
        value = self.config.get(key, default)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    def _bounded_int(self, key, low, high, default):
        try:
            value = int(self.config.get(key, default))
        except (TypeError, ValueError):
            value = default
        return max(low, min(high, value))

    def _configured_tools(self):
        if not self.config.get("enable_tools", True):
            return []
        tools = self.config.get("tools")
        if tools is None:
            return [self._with_tool_root_context(tool) for tool in self.tools.schemas()]
        if not isinstance(tools, list):
            raise ValueError("tools must be a JSON array")
        return [self._with_tool_root_context(self._normalize_tool(tool)) for tool in tools]

    def _with_tool_root_context(self, tool):
        if not isinstance(tool, dict) or tool.get("type") != "function" or not tool.get("name"):
            return tool
        root = str(self.tools.root)
        description = tool.get("description") or ""
        root_note = (
            f" Default local file root/current directory: {root}. "
            "Use this root when the user does not specify a directory. If the user specifies an absolute local directory, pass that absolute path."
        )
        if root not in description:
            tool = dict(tool)
            tool["description"] = (description.rstrip() + root_note).strip()
        return tool

    def _normalize_tool(self, tool):
        if not isinstance(tool, dict):
            raise ValueError("each tool must be an object")
        nested = tool.get("function")
        if isinstance(nested, dict):
            normalized = {"type": tool.get("type", "function")}
            normalized.update(nested)
            return normalized
        if tool.get("type") == "function" and tool.get("name"):
            return tool
        return tool

    def _handle_function_call(self, msg):
        items = msg.get("items") or []
        if isinstance(items, dict):
            items = [items]
        result_items = []
        for item in items:
            call_id = item.get("call_id")
            name = item.get("name") or item.get("function", {}).get("name")
            raw_args = item.get("arguments") or item.get("function", {}).get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                result = self.tools.call(name, args)
            except Exception as exc:
                result = {"ok": False, "error": str(exc)}
            self.emit("local.tool_result", {"call_id": call_id, "name": name, "arguments": raw_args, "result": result})
            result_text = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
            result_items.append({
                "call_id": call_id,
                "role": "tool",
                "content": [{"type": "input_text", "text": result_text}],
            })
        if result_items:
            payload = {"type": "conversation.item.create", "items": result_items}
            self.emit("local.outgoing", {"event": payload})
            self.ws.send_json(payload)

    def _wait_ready(self):
        if not self.ready.wait(timeout=15) or self.closed.is_set() or self.close_requested.is_set() or not self.ws:
            raise RuntimeError("upstream session is not ready")

    def send_text(self, text):
        self._wait_ready()
        self.ws.send_json({"type": "speech_text_buffer.commit", "event_id": uuid.uuid4().hex, "text": text})

    def send_audio(self, audio_b64):
        self._wait_ready()
        self.ws.send_json({"type": "input_audio_buffer.append", "event_id": uuid.uuid4().hex, "audio": audio_b64})

    def commit_audio(self):
        self._wait_ready()
        self.ws.send_json({"type": "input_audio_buffer.commit", "event_id": uuid.uuid4().hex})

    def _remember_sent_payload(self, payload):
        with self.state_lock:
            self.sent_state = {
                "session": copy.deepcopy(payload.get("session", {})),
                "extension": copy.deepcopy(payload.get("extension", {})),
            }

    def _send_update_payload(self, payload):
        with self.state_lock:
            patch = {key: value for key, value in payload.items() if key in {"session", "extension"}}
            diff = diff_patch_paths(self.sent_state, patch)
            if not diff:
                return
            self.sent_state = deep_merge(self.sent_state, patch)
        self.emit("local.update_diff", {"event": payload, "diff": diff})
        self.emit("local.outgoing", {"event": payload})
        self.ws.send_json(payload)

    def update_runtime_config(self, config):
        self._wait_ready()
        self.config.update(config)
        if "tool_root" in config:
            self.tools = LocalFileTools(self.config["tool_root"])
        payload = {
            "type": "session.update",
            "session": {
                "model": self.config.get("model", DEFAULT_MODEL),
                "instructions": self._instructions(),
                "audio": {
                    "output": {
                        "format": {"type": self.config.get("output_format", DEFAULT_OUTPUT_FORMAT), "sample_rate": 24000},
                        "voice": self.config.get("voice", "zh_female_vv_jupiter_bigtts"),
                        "speed": self._bounded_int("speed", -50, 100, 0),
                        "loudness": self._bounded_int("loudness", -50, 100, 0),
                    },
                },
            },
        }
        if any(key in config for key in ("enable_tools", "tool_root", "tools")):
            payload["session"]["tools"] = self._configured_tools()
        if "enable_music" in config or is_music_forced_off_voice(self.config.get("voice")):
            payload["extension"] = {
                "dialog": {
                    "extra": {
                        "enable_music": bool(
                            self._truthy("enable_music", "enableMusic", "music")
                            and not is_music_forced_off_voice(self.config.get("voice"))
                        )
                    }
                }
            }
        if "location" in config:
            extension = payload.setdefault("extension", {})
            dialog = extension.setdefault("dialog", {})
            dialog["location"] = self._build_dialog_location()
        self._send_update_payload(payload)

    def close(self):
        self.close_requested.set()
        if self.ws:
            try:
                self.ws.send_json({"type": "session.close"})
            except Exception:
                self.closed.set()
                self.ws.close()


class DemoState:
    def __init__(self):
        self.sessions = {}
        self.lock = threading.Lock()

    def create(self, config):
        session = DuplexSession(config)
        with self.lock:
            self.sessions[session.id] = session
        return session

    def get(self, session_id):
        with self.lock:
            return self.sessions.get(session_id)

    def close(self, session_id):
        session = self.get(session_id)
        if session:
            session.close()
        return session


STATE = DemoState()


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        exc_type, exc, _ = __import__("sys").exc_info()
        if exc_type in (ConnectionResetError, BrokenPipeError):
            return
        super().handle_error(request, client_address)


class Handler(SimpleHTTPRequestHandler):
    server_version = "SeeduplexWebDemo/0.1"

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/session":
                self._create_session()
            elif parsed.path == "/api/session_update":
                self._update_session()
            elif parsed.path == "/api/text":
                self._send_text()
            elif parsed.path == "/api/audio":
                self._send_audio()
            elif parsed.path == "/api/audio_commit":
                self._commit_audio()
            elif parsed.path == "/api/close":
                self._close_session()
            elif parsed.path == "/api/voice_clone/train":
                self._voice_clone_train()
            elif parsed.path == "/api/voice_clone/status":
                self._voice_clone_status()
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self._json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/events":
            self._events(parsed)
        else:
            super().do_GET()

    def _body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8") or "{}")

    def _normalize_tools_config(self, data, current=None):
        current = current or {}
        enable_tools = truthy_value(data.get("enable_tools", current.get("enable_tools", True)))
        tool_root = str(data.get("tool_root") or current.get("tool_root") or "").strip()
        if not tool_root:
            tool_root = str(default_tool_root())
        root = Path(tool_root).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            raise ValueError("tool_root must be an existing directory")
        tools = data["tools"] if "tools" in data else current.get("tools")
        if tools is not None and not isinstance(tools, list):
            raise ValueError("tools must be a JSON array")
        return {
            "enable_tools": enable_tools,
            "tool_root": str(root),
            "tools": tools,
        }

    def _create_session(self):
        data = self._body()
        api_key = str(data.get("api_key", "")).strip()
        if not api_key:
            raise ValueError("api_key is required")
        tools_config = self._normalize_tools_config(data)
        data["api_key"] = api_key
        data.update(tools_config)
        data["dialog_id"] = normalize_dialog_id(data.get("dialog_id"))
        data["instructions"] = sanitize_instructions(data.get("instructions"))
        data["upstream_headers"] = self._forwarded_upstream_headers()
        session = STATE.create(data)
        self._json({"ok": True, "session_id": session.id, "dialog_id": data["dialog_id"], "tool_root": tools_config["tool_root"]})

    def _forwarded_upstream_headers(self):
        blocked = {"x-api-key", "x-api-connect-id"}
        forwarded = {}
        for key, value in self.headers.items():
            name = str(key).strip()
            lower = name.lower()
            if lower.startswith("x-") and lower not in blocked:
                forwarded[name] = str(value)
        return forwarded

    def _update_session(self):
        data = self._body()
        session = STATE.get(data.get("session_id"))
        if not session:
            raise ValueError("session not found")
        voice = str(data.get("voice", "")).strip()
        if not voice:
            raise ValueError("voice is required")
        speed = max(-50, min(100, int(data.get("speed", 0))))
        loudness = max(-50, min(100, int(data.get("loudness", 0))))
        output_format = str(data.get("output_format") or DEFAULT_OUTPUT_FORMAT).strip()
        update = {
            "voice": voice,
            "model": str(data.get("model") or DEFAULT_MODEL).strip(),
            "output_format": output_format,
            "speed": speed,
            "loudness": loudness,
            "enable_music": truthy_value(data.get("enable_music")) and not is_music_forced_off_voice(voice),
            "instructions": sanitize_instructions(data.get("instructions")),
        }
        if "location" in data:
            update["location"] = data.get("location")
        if any(key in data for key in ("enable_tools", "tool_root", "tools")):
            update.update(self._normalize_tools_config(data, session.config))
        session.update_runtime_config(update)
        self._json({"ok": True})

    def _send_text(self):
        data = self._body()
        session = STATE.get(data.get("session_id"))
        if not session:
            raise ValueError("session not found")
        text = str(data.get("text", "")).strip()
        if not text:
            raise ValueError("text is required")
        session.send_text(text)
        self._json({"ok": True})

    def _send_audio(self):
        data = self._body()
        session = STATE.get(data.get("session_id"))
        if not session:
            raise ValueError("session not found")
        audio = str(data.get("audio", "")).strip()
        if not audio:
            raise ValueError("audio is required")
        session.send_audio(audio)
        self._json({"ok": True})

    def _commit_audio(self):
        data = self._body()
        session = STATE.get(data.get("session_id"))
        if not session:
            raise ValueError("session not found")
        session.commit_audio()
        self._json({"ok": True})

    def _close_session(self):
        data = self._body()
        STATE.close(data.get("session_id"))
        self._json({"ok": True})

    def _voice_clone_train(self):
        data = self._body()
        api_key = str(data.get("api_key", "")).strip()
        voice_id, speaker_payload = clone_speaker_payload(data)
        audio, audio_bytes = normalize_audio_payload(data.get("audio"))
        payload = {
            **speaker_payload,
            "audio": audio,
            "language": 0,
        }

        prompt_text = str(data.get("text") or "").strip()
        if prompt_text:
            payload["text"] = prompt_text

        extra_params = {}
        if "enable_audio_denoise" in data:
            extra_params["enable_audio_denoise"] = bool(data.get("enable_audio_denoise"))
        if "disable_volume_normalization" in data:
            extra_params["disable_volume_normalization"] = bool(data.get("disable_volume_normalization"))
        demo_text = str(data.get("demo_text") or "").strip()
        if demo_text:
            extra_params["demo_text"] = demo_text
        denoise_model = str(data.get("voice_clone_denoise_model_id") or "").strip()
        if denoise_model or data.get("include_empty_denoise_model_id"):
            extra_params["voice_clone_denoise_model_id"] = denoise_model
        if extra_params:
            payload["extra_params"] = extra_params

        result = volcengine_post_json(VOICE_CLONE_TRAIN_URL, api_key, payload)
        response = result["data"]
        status = response.get("status") if isinstance(response, dict) else None
        self._json({
            "ok": True,
            "voice": {
                "id": voice_id,
                "mode": "speaker",
                "status": status,
                "status_name": voice_clone_status_name(status),
                "language": response.get("language") if isinstance(response, dict) else payload["language"],
                "create_time": response.get("create_time") if isinstance(response, dict) else None,
            },
            "audio_bytes": audio_bytes,
            "response": response,
            "logid": result.get("logid"),
            "request_id": result.get("request_id"),
            "used_insecure_tls": result.get("used_insecure_tls"),
        })

    def _voice_clone_status(self):
        data = self._body()
        api_key = str(data.get("api_key", "")).strip()
        voice_id, speaker_payload = clone_speaker_payload(data)
        result = volcengine_post_json(VOICE_CLONE_STATUS_URL, api_key, speaker_payload, timeout=60)
        response = result["data"]
        status = response.get("status") if isinstance(response, dict) else None
        self._json({
            "ok": True,
            "voice": {
                "id": voice_id,
                "mode": "speaker",
                "status": status,
                "status_name": voice_clone_status_name(status),
                "language": response.get("language") if isinstance(response, dict) else None,
                "create_time": response.get("create_time") if isinstance(response, dict) else None,
            },
            "response": response,
            "logid": result.get("logid"),
            "request_id": result.get("request_id"),
            "used_insecure_tls": result.get("used_insecure_tls"),
        })

    def _events(self, parsed):
        qs = parse_qs(parsed.query)
        session = STATE.get((qs.get("session_id") or [""])[0])
        if not session:
            self.send_error(HTTPStatus.NOT_FOUND, "session not found")
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        while True:
            try:
                event = session.events.get(timeout=15)
            except queue.Empty:
                event = {"type": "local.ping", "ts": time.time(), "nonce": secrets.token_hex(4)}
            blob = f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
            try:
                self.wfile.write(blob)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
            if event.get("type") == "local.closed":
                return

    def _json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        message = fmt % args
        if "/api/audio " in message or "/api/audio_commit " in message:
            return
        print("[%s] %s" % (self.log_date_time_string(), message), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Dependency-free Seeduplex web demo with local file function calling.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--static-dir", default=str(Path(__file__).with_name("static")))
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=args.static_dir)
    server = QuietThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving web demo at http://{args.host}:{args.port}", flush=True)
    print(f"Default local file tool root: {default_tool_root()}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

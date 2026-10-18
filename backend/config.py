from dataclasses import dataclass
from pathlib import Path
import os
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


def load_env(path: Path):
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in (chr(34), chr(39)):
            value = value[1:-1]
        os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Config:
    data_dir: Path = ROOT / "data"
    host: str = "127.0.0.1"
    port: int = 8000
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    api_style: str = "chat_completions"
    max_file_bytes: int = 5 * 1024 * 1024
    max_pages: int = 20
    max_context_chars: int = 45000
    max_question_chars: int = 4000
    model_timeout: float = 60.0
    max_output_tokens: int = 2200
    strict_json: bool = False
    allowed_origins: tuple = ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000")

    @classmethod
    def from_env(cls):
        load_env(ROOT / ".env")
        base_url = os.getenv("MODEL_BASE_URL", "").strip().rstrip("/")
        if base_url:
            parts = urlsplit(base_url)
            if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
                raise ValueError("MODEL_BASE_URL 必须是无账号、查询参数的 HTTP(S) API 根地址。")
            if parts.scheme == "http" and parts.hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError("非本机模型接口必须使用 HTTPS。")
        style = os.getenv("MODEL_API_STYLE", "chat_completions").strip()
        if style not in ("chat_completions", "responses"):
            raise ValueError("MODEL_API_STYLE 只能是 chat_completions 或 responses。")
        origins = os.getenv("ALLOWED_ORIGINS", "").strip()
        values = dict(data_dir=Path(os.getenv("DATA_DIR", str(ROOT / "data"))).resolve(),
                      host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")),
                      base_url=base_url, api_key=os.getenv("MODEL_API_KEY", "").strip(),
                      model=os.getenv("MODEL_NAME", "").strip(), api_style=style,
                      max_file_bytes=int(os.getenv("MAX_FILE_MB", "5")) * 1024 * 1024,
                      max_pages=int(os.getenv("MAX_PDF_PAGES", "20")),
                      max_context_chars=int(os.getenv("MAX_CONTEXT_CHARS", "45000")),
                      model_timeout=float(os.getenv("MODEL_TIMEOUT_SECONDS", "60")),
                      max_output_tokens=int(os.getenv("MODEL_MAX_OUTPUT_TOKENS", "2200")),
                      strict_json=os.getenv("MODEL_JSON_MODE", "false").lower() == "true")
        if origins:
            values["allowed_origins"] = tuple(v.strip() for v in origins.split(",") if v.strip())
        result = cls(**values)
        if not 1 <= result.port <= 65535 or min(result.max_file_bytes, result.max_pages, result.max_context_chars, result.model_timeout, result.max_output_tokens) <= 0:
            raise ValueError("端口或容量/超时配置不合法。")
        return result

    def endpoint(self, path: str):
        base = self.base_url.rstrip("/")
        if base.endswith("/v1"):
            return base + "/" + path.lstrip("/")
        return base + "/v1/" + path.lstrip("/")


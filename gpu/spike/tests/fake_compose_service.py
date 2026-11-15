"""model-compose 서비스 자리에 띄우는 가짜 HTTP 서버. 받은 요청 본문을 모으고 정해 둔 응답을 돌려준다."""
import json
import struct
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

SERVICE_SAMPLE_RATE = 24000
STREAMING_LENGTH = 0xFFFFFFFF


def streaming_wav(pcm: bytes, channels: int = 1, bits: int = 16, sample_rate: int = SERVICE_SAMPLE_RATE) -> bytes:
    """서비스가 보내는 길이 미상 WAV와 같은 헤더다."""
    fmt = struct.pack("<HHIIHH", 1, channels, sample_rate, sample_rate * channels * bits // 8, channels * bits // 8, bits)
    return b"RIFF" + struct.pack("<I", STREAMING_LENGTH) + b"WAVEfmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", STREAMING_LENGTH) + pcm


@dataclass
class FakeService:
    url: str = ""
    reply: bytes = b""
    status: int = 200
    bodies: list[dict] = field(default_factory=list)
    # 응답 도중 서버가 연결을 닫는 경우를 흉내 낸다. 보낸 것보다 긴 길이를 알린다.
    cut_short: bool = False

    def workflow_ids(self) -> list[str]:
        return [body["workflow_id"] for body in self.bodies]

    def announced_length(self) -> int:
        return len(self.reply) + (1 if self.cut_short else 0)


def _handler_for(fake: FakeService) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            fake.bodies.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(fake.status)
            self.send_header("Content-Length", str(fake.announced_length()))
            self.end_headers()
            self.wfile.write(fake.reply)

        def log_message(self, *_: object) -> None:
            return None

    return Handler


@contextmanager
def running_fake_service() -> Iterator[FakeService]:
    fake = FakeService()
    server = HTTPServer(("127.0.0.1", 0), _handler_for(fake))
    fake.url = f"http://127.0.0.1:{server.server_port}/api/workflows/runs"
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield fake
    finally:
        server.shutdown()
        thread.join()

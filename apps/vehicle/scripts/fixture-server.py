#!/usr/bin/env python3
"""개발용 픽스처 서버: 계약 v1 모양의 manifest와 /v1/audio/:id를 내준다.

실제 렌더가 없을 때 캐시·재생·안내 음성 경로를 시험한다. 오디오는 macOS `say`로 만든 합성음이다(부모 목소리 아님).
  python3 scripts/fixture-server.py            # :3100
  curl -X POST localhost:3100/__fixture/stories?count=1   # 목록에서 빠진 이야기 삭제 시험
  curl -X POST localhost:3100/__fixture/revoke            # 토큰 거부(연결 해제) 시험
  curl -X POST localhost:3100/__fixture/restore
  curl -X POST 'localhost:3100/__fixture/set?offline=1'      # manifest 503(첫 동기화 실패 시험), 0이면 되돌림
  curl -X POST 'localhost:3100/__fixture/set?holdPairing=1'  # 페어링을 승인 대기로 묶어 둠(주행 중 연결 화면 시험)
  curl -X POST 'localhost:3100/__fixture/set?demoNotReady=1' # 데모 코드가 맞아도 503 demo_not_ready
데모 코드는 1234-5678-9012-3456이다(시연 서버와 같은 숫자 16자리). 데모 토큰의 책장은 한 권뿐이다(계정 바꾸기 시험).
페어링은 코드 FIXTURE2를 보여 주고 두 번째 폴링(약 10초 뒤)에 자동으로 연결된다.
"""
import hashlib
import json
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

AUDIO_DIR = Path(__file__).resolve().parent.parent / "build" / "fixture-audio"
VOICE = "Yuna"

# (renderId, storyId, 제목, 목소리 id, 목소리 이름, 장별 문장). storyId는 시연 동화 id와 같게 둬서 앱의 표지 그림 고르기를 시험한다.
STORIES = [
    ("fixture-1", "redhood", "빨간 모자", "fx-mom", "엄마", [
        "옛날 옛적, 숲 가까운 마을에 빨간 모자를 쓴 아이가 살았어요.",
        "아이는 할머니 댁에 빵과 우유를 가져다 드리러 길을 나섰어요.",
        # 재생 중 조작(다음 장, 연결 해제)을 시험할 수 있게 40초 안팎의 긴 장을 둔다.
        " ".join(["숲길에는 새들이 노래하고, 바람이 나뭇잎을 살랑살랑 흔들었어요."] * 8),
    ]),
    ("fixture-2", "fisherman", "어부와 욕심많은 아내", "fx-dad", "아빠", [
        "바닷가 작은 오두막에 어부와 아내가 살았어요.",
        "어느 날 어부의 그물에 말하는 물고기가 걸렸어요.",
    ]),
    ("fixture-3", "masteraway", "주인님이 집을 비운 사이", "fx-mom", "엄마", [
        "주인님이 집을 비우자, 집 안의 물건들이 하나둘 깨어났어요.",
    ]),
    # 같은 이야기를 다른 목소리로 만든 렌더. 내 책장에서 한 권으로 묶이고 카운트다운에서 목소리를 고른다.
    ("fixture-4", "redhood", "빨간 모자", "fx-dad", "아빠", [
        "옛날 옛적, 숲 가까운 마을에 빨간 모자를 쓴 아이가 살았어요.",
    ]),
]
DEFAULT_VOICE_ID = "fx-mom"
# (id, 목소리 id, say 음성, 문장). 목소리별 벨트 안내.
PROMPTS = [("prompt-belt-mom", "fx-mom", "Yuna", "잠깐, 벨트 다시 매자."), ("prompt-belt-dad", "fx-dad", "Eddy", "벨트 다시 매야지.")]

state = {"story_count": len(STORIES), "revoked": False, "polls": 0, "offline": False, "holdPairing": False,
         "demoNotReady": False}
DEMO_CODE = "1234-5678-9012-3456"
DEMO_TOKEN = "fixture-demo-token"
DEMO_STORY = "fixture-2"
PAIR_START = {"deviceCode": "fixture-device", "userCode": "FIXTURE2", "verificationUri": "http://localhost:3100/pair",
              "expiresInSec": 600, "intervalSec": 5}


def synthesize(audio_id: str, text: str, ext: str, voice: str = VOICE) -> Path:
    target = AUDIO_DIR / f"{audio_id}.{ext}"
    if target.exists():
        return target
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    aiff = AUDIO_DIR / f"{audio_id}.aiff"
    subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
    codec = ["-c:a", "aac", "-b:a", "64k"] if ext == "m4a" else ["-c:a", "pcm_s16le"]
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff), "-ac", "1", "-ar", "24000", *codec, str(target)], check=True)
    aiff.unlink()
    return target


def duration_ms(path: Path) -> int:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return int(float(out.strip()) * 1000)


def asset(audio_id: str, path: Path) -> dict:
    data = path.read_bytes()
    return {"durationMs": duration_ms(path), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "audioUrl": f"/v1/audio/{audio_id}"}


def build_files() -> dict:
    chapters = {f"{rid}-c{i}": synthesize(f"{rid}-c{i}", text, "m4a")
                for rid, _, _, _, _, texts in STORIES for i, text in enumerate(texts)}
    prompts = {pid: synthesize(pid, text, "wav", voice) for pid, _, voice, text in PROMPTS}
    return {**chapters, **prompts}


# 데모 코드로 받은 토큰(시연 계정)은 「어부와 욕심많은 아내」 한 권만 본다. 본인 계정으로 옮기면 책장이 바뀌는 것을 눈으로 확인한다.
def stories_for(demo: bool) -> list:
    return [s for s in STORIES if s[0] == DEMO_STORY] if demo else STORIES[: state["story_count"]]


def manifest(files: dict, demo: bool) -> dict:
    stories = [{"renderId": rid, "storyId": sid, "title": title, "voiceId": vid, "voiceLabel": label,
                "chapters": [{"index": i, "role": "body", **asset(f"{rid}-c{i}", files[f"{rid}-c{i}"])}
                             for i in range(len(texts))]}
               for rid, sid, title, vid, label, texts in stories_for(demo)]
    prompts = [{"id": pid, "kind": "belt_unfastened", "voiceId": vid, **asset(pid, files[pid])} for pid, vid, _, _ in PROMPTS]
    return {"schemaVersion": 1, "maxOfflineSeconds": 604800, "defaultVoiceId": DEFAULT_VOICE_ID,
            "stories": stories, "prompts": prompts}


class Handler(BaseHTTPRequestHandler):
    files: dict = {}

    def do_GET(self):
        path = urlparse(self.path).path
        if not self.headers.get("Authorization", "").startswith("Bearer ") or state["revoked"]:
            return self.reply(401, b'{"error":"unauthenticated"}', "application/json")
        if path == "/v1/library/manifest" and state["offline"]:
            return self.reply(503, b'{"error":"unavailable"}', "application/json")
        if path == "/v1/library/manifest":
            demo = self.headers.get("Authorization") == f"Bearer {DEMO_TOKEN}"
            return self.reply(200, json.dumps(manifest(self.files, demo)).encode(), "application/json")
        audio_id = path.removeprefix("/v1/audio/")
        if path.startswith("/v1/audio/") and audio_id in self.files:
            content_type = "audio/wav" if audio_id.startswith("prompt") else "audio/mp4"
            return self.reply(200, self.files[audio_id].read_bytes(), content_type)
        return self.reply(404, b'{"error":"not_found"}', "application/json")

    def do_POST(self):
        url = urlparse(self.path)
        # 시연 서버처럼 기기 토큰이 붙은 연결 요청은 막는다(apps/api access-policy judgeAccess, 차 토큰은 듣기만).
        if url.path.startswith("/v1/devices/pair/") and self.headers.get("Authorization"):
            return self.reply(403, b'{"error":"forbidden"}', "application/json")
        if url.path.startswith("/v1/devices/pair/"):
            return self.pair(url.path.removeprefix("/v1/devices/pair/"))
        if url.path == "/v1/reports":
            return self.reply(204 if not state["offline"] else 503, b"", "application/json")
        if url.path == "/__fixture/stories":
            state["story_count"] = int(parse_qs(url.query).get("count", [len(STORIES)])[0])
        elif url.path == "/__fixture/set":
            flags = {key: values[0] == "1" for key, values in parse_qs(url.query).items() if key in ("offline", "holdPairing", "demoNotReady")}
            state.update(flags)
        elif url.path in ("/__fixture/revoke", "/__fixture/restore"):
            state["revoked"] = url.path.endswith("revoke")
        else:
            return self.reply(404, b"", "text/plain")
        return self.reply(200, json.dumps(state).encode(), "application/json")

    # 첫 폴링은 대기, 두 번째에 토큰을 준다(부모 확인 단계를 건너뛴다).
    def pair(self, step: str):
        if step == "demo":
            return self.pair_demo()
        if step == "start":
            state["polls"], state["revoked"] = 0, False
            return self.reply(200, json.dumps(PAIR_START).encode(), "application/json")
        state["polls"] += 1
        if state["polls"] < 2 or state["holdPairing"]:
            return self.reply(400, b'{"error":"authorization_pending"}', "application/json")
        return self.reply(200, b'{"accessToken":"fixture-token","tokenType":"Bearer"}', "application/json")

    # 시연 서버(deploy/demo/README.md)와 같은 응답: 200 토큰, 400 invalid_demo_code, 503 demo_not_ready.
    def pair_demo(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if body.get("demoCode") != DEMO_CODE:
            return self.reply(400, b'{"error":"invalid_demo_code"}', "application/json")
        if state["demoNotReady"]:
            return self.reply(503, b'{"error":"demo_not_ready"}', "application/json")
        state["revoked"] = False
        return self.reply(200, json.dumps({"accessToken": DEMO_TOKEN, "tokenType": "Bearer"}).encode(), "application/json")

    def reply(self, code: int, body: bytes, content_type: str):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3100
    Handler.files = build_files()
    print(f"fixture server on :{port} ({len(Handler.files)} audio files in {AUDIO_DIR})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()

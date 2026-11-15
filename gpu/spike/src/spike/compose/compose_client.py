"""model-compose voice-clone 서비스 클라이언트. 서비스는 같은 장비의 127.0.0.1에서 돌고, 파일은 경로로 주고받는다."""
import json
import struct
import tempfile
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

import numpy as np
import soundfile as sf

from spike.sound.atomic import atomic_path
from spike.sound.audio import PCM16_SCALE, Audio
from spike.clone.budget import token_budget
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.compose.compose_http import ComposeError, run_workflow, run_workflow_events
from spike.clone.scoring.whisper_window import cleaned_segments, exceeds_whisper_window, join_segments

COMPOSE_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
DEFAULT_URL = "http://127.0.0.1:18090/api/workflows/runs"
WAV_HEADER_BYTES = 44
TRANSCRIBE_WORKFLOW = "transcribe"
LONG_TRANSCRIBE_WORKFLOW = "transcribe-long"


def decode_pcm16_wav(wav: bytes) -> Audio:
    """서비스는 길이를 모르는 스트리밍 WAV를 보낸다. 헤더의 길이 값이 0xFFFFFFFF라서 일반 WAV 리더로 읽지 않는다."""
    if len(wav) < WAV_HEADER_BYTES or wav[:4] != b"RIFF" or wav[36:40] != b"data":
        raise ComposeError("예상한 44바이트 WAV 헤더가 아닙니다")
    channels, sample_rate = struct.unpack("<HI", wav[22:28])
    bit_depth = struct.unpack("<H", wav[34:36])[0]
    if channels != 1 or bit_depth != 16:
        raise ComposeError(f"모노 16비트만 받습니다: {channels}채널 {bit_depth}비트")
    pcm = wav[WAV_HEADER_BYTES:]
    if not pcm or len(pcm) % 2:
        raise ComposeError(f"오디오 데이터가 비었거나 16비트 단위로 끝나지 않습니다: {len(pcm)}바이트")
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / PCM16_SCALE
    return Audio(samples, sample_rate)


def _unsupported_reason(request: CloneRequest) -> str | None:
    """서비스가 표현하지 못하는 요청은 다른 설정으로 조용히 생성하지 않고 거부한다."""
    reasons = (
        (request.model != COMPOSE_MODEL, f"모델은 {COMPOSE_MODEL}만 지원합니다: {request.model}"),
        (not request.non_streaming, "non_streaming을 끌 수 없습니다"),
        (request.x_vector_only, "x_vector_only는 지원하지 않습니다"),
        (request.context is not None, "체이닝 문맥은 지원하지 않습니다"),
        (request.repetition_penalty is not None, "repetition_penalty는 지원하지 않습니다"),
        (request.subtalker_greedy, "subtalker greedy는 지원하지 않습니다"),
    )
    return next((reason for rejected, reason in reasons if rejected), None)


@dataclass(frozen=True)
class ComposeCloneEngine:
    """gen_ms는 HTTP와 참조 프롬프트 생성을 포함한다. 생성 시간만 재는 직접 호출의 speedX와 비교하면 안 된다."""

    url: str = DEFAULT_URL

    def synthesize(self, request: CloneRequest) -> Synthesis:
        reason = _unsupported_reason(request)
        if reason is not None:
            raise ComposeError(reason)
        started = perf_counter()
        wav = run_workflow(self.url, "clone-sentence", {
            "text": request.text,
            "reference_path": str(request.reference_path.resolve()),
            "reference_text": request.reference_text,
            "seed": request.seed,
            "max_new_tokens": token_budget(request.text) if request.max_new_tokens is None else request.max_new_tokens,
            "temperature": request.temperature,
        })
        return Synthesis(decode_pcm16_wav(wav), round((perf_counter() - started) * 1000))


@dataclass(frozen=True)
class ComposeTranscriber:
    url: str = DEFAULT_URL

    def transcribe(self, audio: Audio) -> str:
        return join_segments(self.transcribe_segments(audio))

    def transcribe_segments(self, audio: Audio) -> list[str]:
        """Whisper 드라이버는 30초 창 하나만 듣는다. 긴 입력은 VAD로 30초 이하 구간을 나눠 받아쓰는 워크플로우로 보낸다."""
        with tempfile.NamedTemporaryFile(suffix=".wav") as clip:
            sf.write(clip.name, audio.samples, audio.sample_rate, subtype="FLOAT")
            texts = self._run(clip.name, exceeds_whisper_window(audio))
        return cleaned_segments(texts)

    def _run(self, audio_path: str, is_long: bool) -> list[object]:
        workflow_input = {"audio_path": audio_path}
        if is_long:
            return run_workflow_events(self.url, LONG_TRANSCRIBE_WORKFLOW, workflow_input)
        return [json.loads(run_workflow(self.url, TRANSCRIBE_WORKFLOW, workflow_input))]


def prepare_reference_via_compose(src: Path, dst: Path, url: str = DEFAULT_URL) -> None:
    if dst.exists():
        return
    with atomic_path(dst) as tmp:
        result = json.loads(run_workflow(url, "prepare-reference", {"source_path": str(src.resolve()), "output_path": str(tmp.resolve())}))
        if result["exit_code"] != 0 or not tmp.exists():
            raise ComposeError(f"참조 전처리 실패 ({result['exit_code']}): {result['stderr']}")

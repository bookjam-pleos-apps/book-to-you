import json
from pathlib import Path

import numpy as np
import pytest
from fake_compose_service import SERVICE_SAMPLE_RATE, FakeService, streaming_wav

from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, PromptContext
from spike.compose.compose_client import (
    COMPOSE_MODEL,
    ComposeCloneEngine,
    ComposeError,
    ComposeTranscriber,
    decode_pcm16_wav,
    prepare_reference_via_compose,
)

SAMPLE_RATE = SERVICE_SAMPLE_RATE


def clone_request(**overrides: object) -> CloneRequest:
    values = {
        "text": "안녕하세요", "reference_path": Path("refs/calm.wav"), "reference_text": "참조 대본",
        "model": COMPOSE_MODEL, "seed": 1234, "non_streaming": True, "x_vector_only": False,
    }
    return CloneRequest(**{**values, **overrides})


def test_decode_reads_samples_past_the_unknown_length_header():
    audio = decode_pcm16_wav(streaming_wav(np.array([0, 16384, -32768], dtype="<i2").tobytes()))

    assert audio.sample_rate == SAMPLE_RATE
    assert audio.samples.tolist() == [0.0, 0.5, -1.0]


@pytest.mark.parametrize(
    "wav",
    [b"short", streaming_wav(b"\0\0", channels=2), streaming_wav(b"\0\0", bits=24), streaming_wav(b""), streaming_wav(b"\0")],
)
def test_decode_rejects_other_formats(wav: bytes):
    with pytest.raises(ComposeError):
        decode_pcm16_wav(wav)


def test_engine_sends_the_generation_settings_and_decodes_the_reply(compose_service: FakeService):
    compose_service.reply = streaming_wav(np.array([16384], dtype="<i2").tobytes())

    result = ComposeCloneEngine(compose_service.url).synthesize(clone_request())

    body = compose_service.bodies[0]
    assert (body["workflow_id"], body["output_only"]) == ("clone-sentence", True)
    assert body["input"]["reference_path"] == str(Path("refs/calm.wav").resolve())
    assert (body["input"]["seed"], body["input"]["max_new_tokens"]) == (1234, 100)
    assert result.audio.samples.tolist() == [0.5]


@pytest.mark.parametrize(
    "overrides",
    [
        {"model": "Qwen/Qwen3-TTS-12Hz-0.6B-Base"},
        {"non_streaming": False},
        {"x_vector_only": True},
        {"context": PromptContext(Audio(np.zeros(1, dtype=np.float32), SAMPLE_RATE), "앞 문장")},
        {"repetition_penalty": 1.0},
        {"subtalker_greedy": True},
    ],
)
def test_engine_refuses_requests_the_service_cannot_honor(compose_service: FakeService, overrides: dict):
    with pytest.raises(ComposeError):
        ComposeCloneEngine(compose_service.url).synthesize(clone_request(**overrides))

    assert compose_service.bodies == []


def test_service_error_surfaces_its_detail(compose_service: FakeService):
    compose_service.status, compose_service.reply = 500, b"model failed"

    with pytest.raises(ComposeError, match="model failed"):
        ComposeCloneEngine(compose_service.url).synthesize(clone_request())


def test_unreachable_service_is_reported_as_a_compose_error():
    engine = ComposeCloneEngine("http://127.0.0.1:1/api/workflows/runs")

    with pytest.raises(ComposeError, match="호출 실패"):
        engine.synthesize(clone_request())


def test_transcriber_returns_trimmed_text(compose_service: FakeService):
    compose_service.reply = json.dumps(" 안녕하세요 ").encode()

    text = ComposeTranscriber(compose_service.url).transcribe(Audio(np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE))

    assert text == "안녕하세요"
    assert compose_service.bodies[0]["workflow_id"] == "transcribe"


def test_prepare_fails_when_ffmpeg_reports_an_error(compose_service: FakeService, tmp_path: Path):
    compose_service.reply = json.dumps({"stdout": "", "stderr": "bad input", "exit_code": 1}).encode()

    with pytest.raises(ComposeError, match="bad input"):
        prepare_reference_via_compose(tmp_path / "raw.wav", tmp_path / "prepared.wav", compose_service.url)

    assert not (tmp_path / "prepared.wav").exists()


def test_prepare_skips_a_finished_reference(compose_service: FakeService, tmp_path: Path):
    prepared = tmp_path / "prepared.wav"
    prepared.write_bytes(b"done")

    prepare_reference_via_compose(tmp_path / "raw.wav", prepared, compose_service.url)

    assert compose_service.bodies == []

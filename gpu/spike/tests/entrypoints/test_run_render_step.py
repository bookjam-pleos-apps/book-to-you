import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fake_compose_service import SERVICE_SAMPLE_RATE, streaming_wav
from job_fixture import example_job
from repeat_audio import two_takes
from word_audio import HEAD_SEC, head_then_word

from spike.render.attempt.attempt_files import attempt_record_file
from spike.sound.audio_gaps import KEEP_INTO_GAP_SEC
from spike.render.job.render_job import job_units, load_render_job
from spike.run_render_step import parse_args, run_step
from spike.render.tail.tail_plan import TailSetting

PACKET_SEC = 0.1


def run(job_dir: Path, step: str, attempt: int = 0, stdin: bytes = b"", **extra: str) -> int:
    argv = [step, f"--job={job_dir}", "--unit=0", f"--attempt={attempt}", *(f"--{key}={value}" for key, value in extra.items())]
    return run_step(parse_args(argv), lambda: stdin)


def output(capsys: pytest.CaptureFixture[str]) -> object:
    return json.loads(capsys.readouterr().out)


def service_audio(seconds: float) -> bytes:
    """서비스가 보내는 16비트 스트리밍 WAV. 0이 아닌 값이라야 ffmpeg 자르기 결과를 길이로 확인할 수 있다."""
    samples = np.full(int(SERVICE_SAMPLE_RATE * seconds), 1000, dtype="<i2")
    return streaming_wav(samples.tobytes())


@pytest.fixture
def job_dir(tmp_path: Path) -> Path:
    return example_job(tmp_path)


def take(job_dir: Path) -> dict:
    return json.loads((job_dir / "attempts" / "0000-a0.take.json").read_text(encoding="utf-8"))


def first_unit_text(job_dir: Path) -> str:
    return job_units(load_render_job(job_dir))[0].text


def test_the_first_attempt_clears_records_left_by_an_earlier_run(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    leftover = job_dir / "attempts" / "0000-a2.json"
    leftover.parent.mkdir()
    leftover.write_text("{}", encoding="utf-8")

    assert run(job_dir, "spec") == 0
    assert output(capsys)["cleared"] == ["0000-a2.json"]
    assert not leftover.exists()


def test_save_writes_the_service_audio_as_float_and_reports_its_length(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=service_audio(2.0))

    measured = output(capsys)
    info = sf.info(job_dir / "attempts" / "0000-a0.raw.wav")
    assert (info.subtype, info.samplerate, measured["duration_sec"], measured["is_long"]) == ("FLOAT", SERVICE_SAMPLE_RATE, 2.0, False)


def test_short_audio_is_transcribed_whole(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=service_audio(2.0))
    run(job_dir, "cut")
    capsys.readouterr()

    run(job_dir, "segments", vad='[{"start_time": 0.0, "end_time": 1.0}]')

    assert output(capsys) == [str(job_dir / "attempts" / "0000-a0.wav")]


# 79음절이라 길이 예산이 약 37.7초다. 31초 음성도 예산 안이라 받아쓰기 대상이 된다.
LONG_LINE = {
    "text": "옛날 옛적 어느 바닷가 마을에 가난하지만 마음씨 착한 어부가 아내와 함께 작은 오두막에서 살았는데 날마다 바다에 나가 그물을 던졌어요 그러던 어느 날 커다란 물고기 한 마리가 그물에 걸렸어요",
    "style": "calm",
    "pauseAfterMs": 450,
}


def test_long_audio_is_cut_at_each_vad_segment(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    job_dir = example_job(tmp_path, lines=[LONG_LINE])
    run(job_dir, "save", stdin=service_audio(31.0))
    run(job_dir, "cut")
    capsys.readouterr()
    spans = [{"start_time": 0.5, "end_time": 10.0}, {"start_time": 12.0, "end_time": 30.5}]

    run(job_dir, "segments", vad=json.dumps(spans))

    clips = [Path(path) for path in output(capsys)]
    assert [clip.name for clip in clips] == ["0000-a0-s0.wav", "0000-a0-s1.wav"]
    # audio-clipper처럼 -c copy로 자르므로 끝이 오디오 패킷 경계까지 늘어난다(한 패킷은 0.1초 미만).
    lengths = [sf.info(clip).duration - (span["end_time"] - span["start_time"]) for clip, span in zip(clips, spans)]
    assert all(0 <= extra < PACKET_SEC for extra in lengths)


def two_takes_audio() -> bytes:
    """제목(0번 단위)은 반복해 생성하므로 서비스도 두 번 읽은 소리를 보낸다."""
    return streaming_wav((two_takes(SERVICE_SAMPLE_RATE) * 32767).astype("<i2").tobytes())


@pytest.mark.usefixtures("repeat_tail")
def test_qc_records_the_attempt_and_stops_on_a_pass(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=two_takes_audio())
    run(job_dir, "cut")
    capsys.readouterr()

    run(job_dir, "qc", texts=json.dumps([first_unit_text(job_dir)], ensure_ascii=False))

    assert output(capsys) == {"done": True, "passed": True, "attempts": 1, "chosen_attempt": 0}
    assert json.loads((job_dir / "attempts" / "0000-a0.json").read_text(encoding="utf-8"))["error_rate"] == 0.0


def test_a_failed_step_prints_nothing_and_returns_an_error_code(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    missing = tmp_path / "gone"

    code = run(missing, "save", stdin=service_audio(1.0))

    assert (code, capsys.readouterr().out) == (1, "")
    assert not missing.exists()


def test_a_runaway_attempt_is_not_transcribed(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=service_audio(31.0))
    assert output(capsys)["hit_budget"]
    run(job_dir, "cut")
    capsys.readouterr()

    run(job_dir, "segments", vad='[{"start_time": 0.0, "end_time": 30.0}]')

    assert output(capsys) == []


def test_a_take_that_cannot_be_cut_fails_qc_even_with_a_clean_transcript(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=service_audio(2.0))
    run(job_dir, "cut")
    capsys.readouterr()

    run(job_dir, "qc", texts=json.dumps([first_unit_text(job_dir)], ensure_ascii=False))

    assert output(capsys)["passed"] is False
    assert take(job_dir)["cut_failed"] is True


@pytest.mark.usefixtures("repeat_tail")
def test_cut_keeps_only_the_first_take_of_a_repeated_unit(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=two_takes_audio())
    measured = output(capsys)

    run(job_dir, "cut")

    assert output(capsys)["cut_failed"] is False
    assert measured["duration_sec"] > sf.info(job_dir / "attempts" / "0000-a0.wav").duration
    facts = take(job_dir)
    assert (facts["hit_budget"], facts["cut_failed"]) == (measured["hit_budget"], False)
    assert facts["head_share"] == pytest.approx(sf.info(job_dir / "attempts" / "0000-a0.wav").duration / measured["duration_sec"])


@pytest.mark.usefixtures("repeat_tail")
def test_qc_keeps_the_head_share_in_the_attempt_record(job_dir: Path, capsys: pytest.CaptureFixture[str]):
    run(job_dir, "save", stdin=two_takes_audio())
    run(job_dir, "cut")
    share = take(job_dir)["head_share"]
    capsys.readouterr()

    run(job_dir, "qc", texts=json.dumps([first_unit_text(job_dir)], ensure_ascii=False))

    record = json.loads(attempt_record_file(job_dir, 0, 0).read_text(encoding="utf-8"))
    assert record["head_share"] == share


def test_a_word_tail_is_cut_where_the_workflow_heard_the_word(job_dir: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("spike.render.job.render_job.load_tail_setting", lambda: TailSetting("word", "그래"))
    run(job_dir, "save", stdin=streaming_wav((head_then_word() * 32767).astype("<i2").tobytes()))
    clips = output(capsys)["tail_clips"]

    run(job_dir, "cut", texts=json.dumps(["주인님이 집을 비운 사이 그래", "주인님이 집을 비운 사이", "주인님이 집을 비운"], ensure_ascii=False))

    assert [Path(clip).name for clip in clips] == [f"0000-a0-t{index}.wav" for index in range(3)]
    assert output(capsys)["cut_failed"] is False
    assert abs(sf.info(job_dir / "attempts" / "0000-a0.wav").duration - (HEAD_SEC + KEEP_INTO_GAP_SEC)) < 0.02
    assert take(job_dir)["head_share"] is None
    assert take(job_dir)["head_transcript"] == "주인님이 집을 비운 사이"


def test_a_word_tail_head_already_transcribed_is_not_sent_to_whisper_again(job_dir: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("spike.render.job.render_job.load_tail_setting", lambda: TailSetting("word", "그래"))
    run(job_dir, "save", stdin=streaming_wav((head_then_word() * 32767).astype("<i2").tobytes()))
    run(job_dir, "cut", texts=json.dumps(["주인님이 집을 비운 사이 그래", first_unit_text(job_dir), "주인님이 집을 비운"], ensure_ascii=False))
    capsys.readouterr()

    run(job_dir, "segments", vad="[]")
    assert output(capsys) == []

    run(job_dir, "qc", texts="[]")
    assert output(capsys)["passed"] is True

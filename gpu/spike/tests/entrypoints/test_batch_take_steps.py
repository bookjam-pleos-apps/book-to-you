import json
from pathlib import Path

import numpy as np
import pytest
from fake_compose_service import SERVICE_SAMPLE_RATE, streaming_wav
from job_fixture import THREE_UNIT_LINES, example_job
from word_audio import head_then_word

from spike import run_render_step
from spike.render.job.render_job import job_units, load_render_job
from spike.run_render_batch_step import parse_args, run_step
from spike.render.tail.tail_plan import TailSetting

UNITS = [0, 2]


def _batch(job_dir: Path, step: str, capsys: pytest.CaptureFixture[str], **extra: str) -> object:
    argv = [step, f"--job={job_dir}", f"--units={json.dumps(UNITS)}", "--attempt=0", *(f"--{key}={value}" for key, value in extra.items())]
    assert run_step(parse_args(argv)) == 0
    return json.loads(capsys.readouterr().out)


def _save(job_dir: Path, unit: int, samples: np.ndarray, capsys: pytest.CaptureFixture[str]) -> None:
    args = run_render_step.parse_args(["save", f"--job={job_dir}", f"--unit={unit}", "--attempt=0"])
    wav = streaming_wav((samples * 32767).astype("<i2").tobytes())
    assert run_render_step.run_step(args, lambda: wav) == 0
    capsys.readouterr()


def _save_all(job_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _save(job_dir, UNITS[0], _tone(2.0), capsys)
    _save(job_dir, UNITS[1], _tone(2.0), capsys)


def _tone(seconds: float) -> np.ndarray:
    return np.full(int(SERVICE_SAMPLE_RATE * seconds), 0.03, dtype=np.float32)


@pytest.fixture
def job_dir(tmp_path: Path) -> Path:
    return example_job(tmp_path, lines=THREE_UNIT_LINES)


def test_a_batch_without_tails_transcribes_every_unit_once_and_judges_each(job_dir, capsys, monkeypatch):
    monkeypatch.setattr("spike.render.job.render_job.load_tail_setting", lambda: TailSetting("none", "그래"))
    _save_all(job_dir, capsys)
    texts = [unit.text for index, unit in enumerate(job_units(load_render_job(job_dir))) if index in UNITS]

    assert _batch(job_dir, "tails", capsys) == {"paths": []}
    assert _batch(job_dir, "cut", capsys, texts="[]") == {"long": []}
    segments = _batch(job_dir, "segments", capsys, vad="[]")["paths"]
    outcomes = _batch(job_dir, "qc", capsys, texts=json.dumps(texts, ensure_ascii=False))

    assert [Path(path).name for path in segments] == ["0000-a0.wav", "0002-a0.wav"]
    assert [outcome["passed"] for outcome in outcomes] == [True, True]


def test_tail_texts_go_back_to_the_unit_that_sent_them(job_dir, capsys):
    """제품 기본값(word)에서 0번(제목)만 꼬리 조각을 낸다. 받아쓰기는 그 단위의 자르기에만 쓰인다."""
    _save(job_dir, 0, head_then_word(), capsys)
    _save(job_dir, 2, _tone(2.0), capsys)
    unit0 = job_units(load_render_job(job_dir))[0].text

    paths = _batch(job_dir, "tails", capsys)["paths"]
    _batch(job_dir, "cut", capsys, texts=json.dumps([f"{unit0} 그래", unit0, "주인님"], ensure_ascii=False))

    assert [Path(path).name for path in paths] == ["0000-a0-t0.wav", "0000-a0-t1.wav", "0000-a0-t2.wav"]
    take = json.loads((job_dir / "attempts" / "0000-a0.take.json").read_text(encoding="utf-8"))
    assert take["cut_failed"] is False


def test_a_text_count_that_does_not_match_the_clips_stops_the_batch(job_dir, capsys, monkeypatch):
    monkeypatch.setattr("spike.render.job.render_job.load_tail_setting", lambda: TailSetting("none", "그래"))
    _save_all(job_dir, capsys)
    _batch(job_dir, "tails", capsys)
    _batch(job_dir, "cut", capsys, texts="[]")
    _batch(job_dir, "segments", capsys, vad="[]")

    argv = ["qc", f"--job={job_dir}", f"--units={json.dumps(UNITS)}", "--attempt=0", '--texts=["하나"]']

    assert run_step(parse_args(argv)) == 1
    assert capsys.readouterr().out == ""


def test_a_vad_count_that_does_not_match_the_long_units_stops_the_batch(job_dir, capsys, monkeypatch):
    monkeypatch.setattr("spike.render.job.render_job.load_tail_setting", lambda: TailSetting("none", "그래"))
    _save_all(job_dir, capsys)
    _batch(job_dir, "tails", capsys)
    _batch(job_dir, "cut", capsys, texts="[]")

    argv = ["segments", f"--job={job_dir}", f"--units={json.dumps(UNITS)}", "--attempt=0", '--vad=[[{"start_time": 0.0, "end_time": 1.0}]]']

    assert run_step(parse_args(argv)) == 1

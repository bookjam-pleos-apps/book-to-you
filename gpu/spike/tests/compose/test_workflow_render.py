import json
from pathlib import Path

import numpy as np
import pytest
from fake_compose_service import FakeService
from job_fixture import example_job

from spike.render.attempt.attempt_files import attempt_audio, attempt_record_file
from spike.sound.audio import Audio
from spike.render.attempt.render_attempts import AttemptRecord, record_to_dict
from spike.render.attempt.render_attempts import UnitOutcome
from spike.render.job.render_job import job_units, load_render_job, render_job_with
from spike.render.story_store import save_unit_audio
from spike.story.story_plan import StorySentence
from spike.compose.workflow_render import RENDER_UNIT_WORKFLOW, WorkflowUnitRenderer, rendered_from_attempt

SAMPLE_RATE = 24000
CHOSEN = 1


def _write_chosen_attempt(job_dir: Path, unit_index: int, text: str) -> Path:
    """워크플로우가 남겼을 시도 파일을 흉내 낸다. 두 번째 시도(seed +1000)를 골랐다고 한다."""
    record = AttemptRecord(CHOSEN, text, 2234, f"받아쓰기 {unit_index}", 0.5, False, 0, 0.05)
    save_unit_audio(attempt_audio(job_dir, unit_index, CHOSEN), Audio(np.full(SAMPLE_RATE // 2, 0.1, dtype=np.float32), SAMPLE_RATE))
    path = attempt_record_file(job_dir, unit_index, CHOSEN)
    path.write_text(json.dumps(record_to_dict(record), ensure_ascii=False), encoding="utf-8")
    return path


def test_each_unit_is_rendered_by_the_workflow_in_order_and_reported_like_the_python_render(tmp_path: Path, compose_service: FakeService):
    job_dir = example_job(tmp_path)
    job = load_render_job(job_dir)
    unit_count = len(job_units(job))
    written = [_write_chosen_attempt(job_dir, index, unit.text) for index, unit in enumerate(job_units(job))]
    compose_service.reply = json.dumps({"done": True, "passed": True, "attempts": 2, "chosen_attempt": CHOSEN}).encode()

    rendered = render_job_with(job_dir, job, WorkflowUnitRenderer(compose_service.url, job_dir).render_one)

    assert compose_service.workflow_ids() == [RENDER_UNIT_WORKFLOW] * unit_count
    assert [body["input"]["unit_index"] for body in compose_service.bodies] == list(range(unit_count))
    assert {body["input"]["job_dir"] for body in compose_service.bodies} == {str(job_dir.resolve())}
    assert all(set(body["input"]) == {"job_dir", "unit_index"} for body in compose_service.bodies)
    assert [(item.attempts, item.seed, item.passed, item.cer) for item in rendered] == [(2, 2234, True, 0.05)] * unit_count
    report = json.loads((job_dir / "out" / "report.json").read_text(encoding="utf-8"))
    assert [line["transcript"] for line in report] == [f"받아쓰기 {index}" for index in range(unit_count)]
    assert (job_dir / "out" / "story.wav").exists()
    assert all(path.exists() for path in written)


def test_a_record_from_another_unit_stops_the_render():
    """단위 번호가 어긋나면 다른 문장의 음성이 조용히 붙는다. 원문을 대조해 그 자리에서 멈춘다."""
    record = AttemptRecord(0, "다른 문장", 1234, "받아쓰기", 0.5, False, 0, 0.0)
    audio = Audio(np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE)

    with pytest.raises(ValueError, match="원문"):
        rendered_from_attempt(StorySentence("이번 문장", "calm", 450), record, audio, UnitOutcome(True, True, 1, 0))

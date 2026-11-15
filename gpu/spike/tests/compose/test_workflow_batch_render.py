import json
from pathlib import Path

import numpy as np
from fake_compose_service import FakeService
from job_fixture import example_job

from spike.render.attempt.attempt_files import attempt_audio, attempt_record_file
from spike.sound.audio import Audio
from spike.render.attempt.render_attempts import AttemptRecord, record_to_dict
from spike.render.job.render_job import job_units, load_render_job, render_job_all_at_once
from spike.render.story_store import save_unit_audio
from spike.compose.workflow_batch_render import RENDER_BATCH_WORKFLOW, BatchWorkflowRenderer

SAMPLE_RATE = 24000


def _write_passing_attempt(job_dir: Path, unit_index: int, text: str) -> None:
    """워크플로우가 첫 시도에서 합격했다고 남겼을 시도 파일."""
    record = AttemptRecord(0, text, 1234, f"받아쓰기 {unit_index}", 0.5, False, 0, 0.0)
    save_unit_audio(attempt_audio(job_dir, unit_index, 0), Audio(np.full(SAMPLE_RATE // 2, 0.1, dtype=np.float32), SAMPLE_RATE))
    attempt_record_file(job_dir, unit_index, 0).write_text(json.dumps(record_to_dict(record), ensure_ascii=False), encoding="utf-8")


def test_a_batch_render_sends_style_batches_and_reports_every_unit(tmp_path: Path, compose_service: FakeService):
    job_dir = example_job(tmp_path)
    job = load_render_job(job_dir)
    units = job_units(job)
    [_write_passing_attempt(job_dir, index, unit.text) for index, unit in enumerate(units)]
    compose_service.reply = b"[]"

    rendered = render_job_all_at_once(job_dir, job, lambda planned: BatchWorkflowRenderer(compose_service.url, job_dir).render(planned, 8))

    assert set(compose_service.workflow_ids()) == {RENDER_BATCH_WORKFLOW}
    sent = sorted(index for body in compose_service.bodies for index in body["input"]["unit_indices"])
    assert sent == list(range(len(units)))
    assert {body["input"]["attempt"] for body in compose_service.bodies} == {0}
    assert all(len({units[i].style for i in body["input"]["unit_indices"]}) == 1 for body in compose_service.bodies)
    assert [item.transcript for item in rendered] == [f"받아쓰기 {index}" for index in range(len(units))]
    report = json.loads((job_dir / "out" / "report.json").read_text(encoding="utf-8"))
    assert len(report) == len(units) and (job_dir / "out" / "story.wav").exists()

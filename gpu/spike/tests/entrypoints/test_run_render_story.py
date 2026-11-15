import io
import json
import tarfile
from dataclasses import dataclass
from pathlib import Path

import pytest

import spike.run_render_story as story
from spike.render.job.render_engine_setting import load_engine_setting
from spike.run_render_story import parse_args, run_step

JOB_ID = "0b6f3c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f"
URL = "http://127.0.0.1:18090/api/workflows/runs"


@dataclass(frozen=True)
class FakeRendered:
    passed: bool


def bundle_with_job() -> io.BytesIO:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as bundle:
        member = tarfile.TarInfo("job.json")
        member.size = 2
        bundle.addfile(member, io.BytesIO(b"{}"))
    buffer.seek(0)
    return buffer


def run(root: Path, step: str, stdin: io.BytesIO | None = None, job_id: str = JOB_ID, url: str = URL) -> int:
    argv = [step, f"--root={root}", f"--job-id={job_id}", f"--compose-url={url}"]
    return run_step(parse_args(argv), stdin or io.BytesIO())


def test_start_renders_in_process_and_keeps_stdout_for_one_json_line(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    calls: list[tuple] = []

    def fake_render(job_dir: Path, engine_id: str, compose_url: str, batch_size: int):
        print("렌더 진행 로그")
        calls.append((job_dir, engine_id, compose_url, batch_size))
        return [FakeRendered(True), FakeRendered(False)]

    monkeypatch.setattr(story, "render_job_dir", fake_render)

    assert run(tmp_path, "start", bundle_with_job()) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"units": 2, "failed": 1}
    assert "렌더 진행 로그" in captured.err
    setting = load_engine_setting()
    assert calls == [(tmp_path / JOB_ID, setting.engine, URL, setting.batch_size)]


def test_a_bad_job_id_fails_with_empty_stdout_before_touching_disk(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    assert run(tmp_path / "jobs", "start", bundle_with_job(), job_id="../x") == 1
    assert capsys.readouterr().out == ""
    assert not (tmp_path / "jobs").exists()


def test_cleanup_after_a_failed_render_removes_the_folder(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    def failing_render(*_args: object):
        raise RuntimeError("render-unit 실패")

    monkeypatch.setattr(story, "render_job_dir", failing_render)

    assert run(tmp_path, "start", bundle_with_job()) == 1
    assert run(tmp_path, "result") == 1
    assert capsys.readouterr().out == ""
    assert run(tmp_path, "cleanup") == 0
    assert json.loads(capsys.readouterr().out) == {"removed": True}
    assert not (tmp_path / JOB_ID).exists()


def test_start_refuses_the_unset_url_placeholder_before_unpacking(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    assert run(tmp_path, "start", bundle_with_job(), url="render-compose-url-not-set") == 1
    assert capsys.readouterr().out == ""
    assert not (tmp_path / JOB_ID).exists()

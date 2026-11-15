import json
import shutil
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from job_fixture import example_job
from repeat_audio import two_takes

from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.render.job.render_job import job_units, load_render_job, remove_render_job, run_render_job, write_unit_read_as

SAMPLE_RATE = 24000
# API 쪽 테스트도 같은 파일을 읽는다. 형식이 어긋나면 GPU에서 돌리기 전에 양쪽 중 하나가 실패한다.
SHARED_FIXTURES = Path(__file__).parents[4] / "apps/api/src/adapters/render-job/fixtures"
LINES = [
    {"text": "첫 번째 문장이에요.", "style": "calm", "pauseAfterMs": 450},
    {"text": "우와, 신나요!", "style": "excited", "pauseAfterMs": 450},
    {"text": "조용히 말했어요.", "style": "soft", "pauseAfterMs": 900},
    {"text": "다음 문단이에요.", "style": "calm", "pauseAfterMs": 450},
]


CALM_ONLY = {"calm": "calm", "excited": "calm", "soft": "calm"}
MIXED = {"calm": "calm", "excited": "excited", "soft": "soft"}


def _write_wav(path: Path) -> None:
    sf.write(path, np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE, subtype="PCM_16")


def _write_job(job_dir: Path, lines: list[dict] | None = None, max_syllables: int = 180, read_as: dict | None = None, styles: tuple[str, ...] = ("calm",), **overrides) -> None:
    job_dir.mkdir()
    references = [{"style": style, "file": f"reference-{style}.wav", "text": f"{style} 대본"} for style in styles]
    (job_dir / "job.json").write_text(json.dumps({
        "format": 2,
        "renderId": "r1",
        "storyId": "masteraway",
        "model": "model",
        "seed": 1234,
        "limits": {"maxSyllables": max_syllables, "minSyllables": 30},
        "references": references,
        "readAs": CALM_ONLY if read_as is None else read_as,
        "lines": LINES if lines is None else lines,
        **overrides,
    }, ensure_ascii=False), encoding="utf-8")
    [_write_wav(job_dir / reference["file"]) for reference in references]


class _RecordingEngine:
    def __init__(self):
        self.requests: list[CloneRequest] = []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.requests.append(request)
        return Synthesis(Audio(two_takes(SAMPLE_RATE), SAMPLE_RATE), 1)


def test_reads_the_job_the_api_writes(tmp_path: Path):
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    shutil.copy(SHARED_FIXTURES / "job.example.json", job_dir / "job.json")
    example = json.loads((SHARED_FIXTURES / "job.example.json").read_text(encoding="utf-8"))
    [_write_wav(job_dir / reference["file"]) for reference in example["references"]]
    job = load_render_job(job_dir)
    assert [reference.style for reference in job.references] == ["calm", "excited", "soft"]
    assert job.limits.max_syllables == 180
    assert [unit.style for unit in job_units(job)] == ["calm", "excited", "soft"]


@pytest.mark.usefixtures("repeat_tail")
def test_writes_every_report_field_the_api_reads(tmp_path: Path):
    job_dir = tmp_path / "job"
    _write_job(job_dir, lines=LINES[:1])
    engine = _RecordingEngine()
    run_render_job(job_dir, load_render_job(job_dir), engine, _unit_text_transcriber(job_dir))
    written = json.loads((job_dir / "out" / "report.json").read_text(encoding="utf-8"))[0]
    expected = json.loads((SHARED_FIXTURES / "report.example.json").read_text(encoding="utf-8"))[0]
    assert {key: type(value) for key, value in expected.items()}.items() <= {key: type(value) for key, value in written.items()}.items()


def test_reads_every_style_as_calm_on_the_calm_path_and_keeps_paragraph_breaks(tmp_path: Path):
    _write_job(tmp_path / "job")
    units = job_units(load_render_job(tmp_path / "job"))
    assert {unit.style for unit in units} == {"calm"}
    assert [unit.text for unit in units] == ["첫 번째 문장이에요. 우와, 신나요! 조용히 말했어요.", "다음 문단이에요."]


def test_mixed_job_splits_units_where_the_reference_changes(tmp_path: Path):
    _write_job(tmp_path / "job", read_as=MIXED, styles=("calm", "excited", "soft"))
    units = job_units(load_render_job(tmp_path / "job"))
    assert [(unit.style, unit.text) for unit in units] == [
        ("calm", "첫 번째 문장이에요."),
        ("excited", "우와, 신나요!"),
        ("soft", "조용히 말했어요."),
        ("calm", "다음 문단이에요."),
    ]


@pytest.mark.parametrize(("overrides", "message"), [
    ({"format": None}, "형식 2만"),
    ({"readAs": {"calm": "calm", "excited": "calm"}}, "readAs에 없는 style: soft"),
    ({"readAs": MIXED}, "참조가 없는 readAs 대상: excited"),
    ({"references": [{"style": "calm", "file": "../reference-calm.wav", "text": "대본"}]}, "작업 폴더 밖"),
    ({"references": [{"style": "calm", "file": "missing.wav", "text": "대본"}]}, "참조 파일이 없습니다: missing.wav"),
])
def test_refuses_a_job_it_cannot_follow_before_rendering(tmp_path: Path, overrides: dict, message: str):
    _write_job(tmp_path / "job", **overrides)
    with pytest.raises(ValueError, match=message):
        load_render_job(tmp_path / "job")


def test_joined_units_equal_the_story_text(tmp_path: Path):
    _write_job(tmp_path / "job")
    units = job_units(load_render_job(tmp_path / "job"))
    assert " ".join(unit.text for unit in units) == " ".join(line["text"] for line in LINES)


def test_refuses_a_sentence_over_the_limit(tmp_path: Path):
    _write_job(tmp_path / "job", max_syllables=3)
    with pytest.raises(ValueError, match="허용 길이"):
        job_units(load_render_job(tmp_path / "job"))


def _unit_text_transcriber(job_dir: Path):
    """단위마다 원문을 돌려준다. 제목 단위는 반복해 생성하므로 보낸 글(request.text)과 원문이 다르다."""
    texts = iter([unit.text for unit in job_units(load_render_job(job_dir))])
    return lambda _: next(texts)


@pytest.mark.usefixtures("repeat_tail")
def test_render_uses_the_job_reference_and_writes_what_publish_reads(tmp_path: Path):
    job_dir = tmp_path / "job"
    _write_job(job_dir)
    engine = _RecordingEngine()
    rendered = run_render_job(job_dir, load_render_job(job_dir), engine, _unit_text_transcriber(job_dir))
    assert all(item.passed for item in rendered)
    assert {request.reference_path for request in engine.requests} == {job_dir / "reference-calm.wav"}
    assert {request.reference_text for request in engine.requests} == {"calm 대본"}
    report = json.loads((job_dir / "out" / "report.json").read_text(encoding="utf-8"))
    assert " ".join(line["text"] for line in report) == " ".join(line["text"] for line in LINES)
    assert [line["passed"] for line in report] == [True, True]
    assert sf.info(job_dir / "out" / "story.wav").samplerate == SAMPLE_RATE


@pytest.mark.usefixtures("repeat_tail")
def test_mixed_render_reads_each_unit_with_its_reference(tmp_path: Path):
    job_dir = tmp_path / "job"
    _write_job(job_dir, read_as=MIXED, styles=("calm", "excited", "soft"))
    engine = _RecordingEngine()
    run_render_job(job_dir, load_render_job(job_dir), engine, _unit_text_transcriber(job_dir))
    used = {request.text: (request.reference_path.name, request.reference_text) for request in engine.requests}
    assert used["우와, 신나요!"] == ("reference-excited.wav", "excited 대본")
    assert used["조용히 말했어요."] == ("reference-soft.wav", "soft 대본")


def test_a_unit_that_never_matches_is_reported_failed_after_three_attempts(tmp_path: Path):
    job_dir = tmp_path / "job"
    _write_job(job_dir, lines=LINES[:1])
    engine = _RecordingEngine()
    rendered = run_render_job(job_dir, load_render_job(job_dir), engine, lambda _: "전혀 다른 말")
    assert [item.passed for item in rendered] == [False]
    assert len(engine.requests) == 3
    assert len({request.seed for request in engine.requests}) == 3
    report = json.loads((job_dir / "out" / "report.json").read_text(encoding="utf-8"))
    assert report[0]["passed"] is False


def test_cleanup_removes_a_job_and_nothing_else(tmp_path: Path):
    job_dir = tmp_path / "job"
    _write_job(job_dir)
    remove_render_job(job_dir)
    assert not job_dir.exists()
    with pytest.raises(ValueError, match="작업 폴더가 아니어서"):
        remove_render_job(tmp_path)
    assert tmp_path.exists()


def test_a_unit_replaced_during_the_render_reads_the_other_recording_without_moving_unit_boundaries(tmp_path: Path):
    job_dir = example_job(tmp_path)
    before = job_units(load_render_job(job_dir))

    write_unit_read_as(job_dir, {1: "calm"})
    after = job_units(load_render_job(job_dir))

    assert [unit.text for unit in after] == [unit.text for unit in before]
    assert after[1].style == "calm" and before[1].style != "calm"
    assert [unit.style for index, unit in enumerate(after) if index != 1] == [unit.style for index, unit in enumerate(before) if index != 1]


def test_a_unit_replacement_without_a_recording_is_refused(tmp_path: Path):
    job_dir = example_job(tmp_path)
    write_unit_read_as(job_dir, {0: "child"})

    with pytest.raises(ValueError, match="대체 녹음"):
        load_render_job(job_dir)

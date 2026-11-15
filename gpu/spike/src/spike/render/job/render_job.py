"""API 배치가 내보낸 작업 폴더 하나를 렌더한다. 판정과 파일은 여기에 두고 모델은 진입점에서 주입한다."""
import json
import shutil
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from functools import partial
from pathlib import Path

from spike.clone.engine.clone_port import CloneEngine
from spike.story.story_plan import StorySentence, sentence_from_line
from spike.render.story_render import (
    Reference,
    RenderedSentence,
    RenderOne,
    RenderSettings,
    Transcribe,
    independent_render,
    render_story,
    stitch,
)
from spike.render.story_store import STORY_NAME, save_progress, save_rendered, save_story
from spike.story.story_units import UnitLimits, group_units, oversize_sentences, read_styles_as
from spike.render.tail.tail_plan import with_tails
from spike.render.tail.tail_setting import load_tail_setting

JOB_NAME = "job.json"
# apps/api의 RENDER_JOB_FORMAT과 같다. 다른 형식이면 조용히 calm으로 읽지 않고 시작 전에 멈춘다.
JOB_FORMAT = 2
OUT_DIR = "out"
# 렌더 도중 정한 단위별 대체 녹음(목소리 자동 보정의 calm 대체). 워크플로우 단계가 job.json과 함께 읽는다.
UNIT_READ_AS_NAME = "unit-read-as.json"


@dataclass(frozen=True)
class JobReference:
    style: str
    file: str
    text: str


@dataclass(frozen=True)
class RenderJob:
    model: str
    seed: int
    references: tuple[JobReference, ...]
    read_as: Mapping[str, str]
    limits: UnitLimits
    sentences: tuple[StorySentence, ...]
    unit_read_as: Mapping[int, str] = field(default_factory=dict)


def _parse_job(raw: dict) -> RenderJob:
    return RenderJob(
        raw["model"],
        raw["seed"],
        tuple(JobReference(item["style"], item["file"], item["text"]) for item in raw["references"]),
        dict(raw["readAs"]),
        UnitLimits(raw["limits"]["maxSyllables"], raw["limits"]["minSyllables"]),
        tuple(sentence_from_line(line) for line in raw["lines"]),
    )


def job_problems(job: RenderJob, job_dir: Path) -> list[str]:
    """API가 정한 readAs를 그대로 따르므로, 따를 수 없는 작업은 GPU를 쓰기 전에 모두 찾아 알린다."""
    styles = [reference.style for reference in job.references]
    unread = sorted({sentence.style for sentence in job.sentences} - job.read_as.keys())
    unrecorded = sorted(set(job.read_as.values()) - set(styles))
    outside = [reference.file for reference in job.references if Path(reference.file).name != reference.file]
    absent = [name for name in (reference.file for reference in job.references) if name not in outside and not (job_dir / name).is_file()]
    return [
        *(f"readAs에 없는 style: {style}" for style in unread),
        *(f"참조가 없는 readAs 대상: {style}" for style in unrecorded),
        *(f"참조 style이 겹칩니다: {style}" for style in sorted({style for style in styles if styles.count(style) > 1})),
        *(f"작업 폴더 밖을 가리키는 참조 파일: {name}" for name in outside),
        *(f"참조 파일이 없습니다: {name}" for name in absent),
        *(f"참조가 없는 단위 대체 녹음: {unit}번 {style}" for unit, style in sorted(job.unit_read_as.items()) if style not in styles),
    ]


def _unit_read_as(job_dir: Path) -> dict[int, str]:
    path = job_dir / UNIT_READ_AS_NAME
    return {int(unit): style for unit, style in json.loads(path.read_text(encoding="utf-8")).items()} if path.exists() else {}


def write_unit_read_as(job_dir: Path, unit_read_as: Mapping[int, str]) -> None:
    """이미 정한 대체에 더한다. 같은 단위를 두 번 정하면 나중 값이다."""
    merged = {**_unit_read_as(job_dir), **unit_read_as}
    (job_dir / UNIT_READ_AS_NAME).write_text(json.dumps({str(unit): style for unit, style in sorted(merged.items())}), encoding="utf-8")


def load_render_job(job_dir: Path) -> RenderJob:
    raw = json.loads((job_dir / JOB_NAME).read_text(encoding="utf-8"))
    if raw.get("format") != JOB_FORMAT:
        raise ValueError(f"작업 파일 형식 {JOB_FORMAT}만 읽습니다: {raw.get('format')}")
    job = replace(_parse_job(raw), unit_read_as=_unit_read_as(job_dir))
    problems = job_problems(job, job_dir)
    if problems:
        raise ValueError(f"작업 파일을 따를 수 없습니다: {problems}")
    return job


def job_units(job: RenderJob) -> list[StorySentence]:
    """확정본의 표시는 두고 이번 렌더만 readAs대로 읽는다. 묶기 전에 바꿔야 생성 단위까지 같아진다.
    단위별 대체(unit_read_as)는 묶은 뒤에 바꿔 단위 경계를 그대로 둔다. 꼬리 대상(제목, child)은 그 뒤에 정한다.
    실제로 읽는 녹음이 child일 때만 붙인다."""
    problems = oversize_sentences(job.sentences, job.limits)
    if problems:
        raise ValueError(f"허용 길이를 넘는 문장이 있습니다: {problems}")
    grouped = group_units(read_styles_as(job.sentences, dict(job.read_as)), job.limits)
    replaced = [replace(unit, style=job.unit_read_as.get(index, unit.style)) for index, unit in enumerate(grouped)]
    return with_tails(replaced, load_tail_setting())


def render_job_with(job_dir: Path, job: RenderJob, render_one: RenderOne) -> Sequence[RenderedSentence]:
    """단위를 어떻게 렌더하든(Python, compose 워크플로우) 진행 저장과 조립은 같다. out/ 형식을 게시 단계가 읽는다."""
    out = job_dir / OUT_DIR
    rendered = render_story(job_units(job), render_one, partial(save_progress, out))
    save_story(out / STORY_NAME, stitch(rendered))
    return rendered


RenderUnits = Callable[[Sequence[StorySentence]], list[RenderedSentence]]


def render_job_all_at_once(job_dir: Path, job: RenderJob, render_units: RenderUnits) -> Sequence[RenderedSentence]:
    """배치 라운드처럼 단위가 순서대로 끝나지 않는 렌더. 다 끝난 뒤 out/에 같은 형식으로 쓴다."""
    out = job_dir / OUT_DIR
    rendered = render_units(job_units(job))
    save_rendered(out, rendered)
    save_story(out / STORY_NAME, stitch(rendered))
    return rendered


def run_render_job(job_dir: Path, job: RenderJob, engine: CloneEngine, transcribe: Transcribe) -> Sequence[RenderedSentence]:
    """API가 업로드 때 ref_prep과 같은 전처리를 했으므로 참조를 그대로 쓴다. 다시 처리하면 뒤 무음이 두 번 붙는다."""
    references = {reference.style: Reference(job_dir / reference.file, reference.text) for reference in job.references}
    settings = RenderSettings(job.model, job.seed, references)
    return render_job_with(job_dir, job, independent_render(engine, transcribe, settings))


def remove_render_job(job_dir: Path) -> None:
    """부모 음성이 들어 있는 폴더라 GPU 장비에 남기지 않는다. 다른 폴더를 지우지 않도록 작업 파일을 확인한다."""
    if not (job_dir / JOB_NAME).exists():
        raise ValueError(f"작업 폴더가 아니어서 지우지 않습니다: {job_dir}")
    shutil.rmtree(job_dir)

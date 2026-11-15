"""화자 한 명에게 필요한 작업 목록을 만든다. 파일도 모델도 건드리지 않는 순수 함수."""
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import EvalSentence, ReferenceScript, identity_threshold_for, instruct_for, ordered_for_anchor
from spike.clone.reference.degrade import PROFILES, DegradeProfile
from spike.clone.layout import ceiling_path, reference_path


@dataclass(frozen=True)
class SynthJob:
    path: Path
    text: str
    instruct: str
    identity_threshold: float | None = None


@dataclass(frozen=True)
class DegradeJob:
    src: Path
    dst: Path
    profile: DegradeProfile


Job = SynthJob | DegradeJob


def plan_speaker(
    root: Path, speaker_id: str, scripts: list[ReferenceScript], sentences: list[EvalSentence]
) -> list[Job]:
    """calm 참조가 맨 앞이라 앵커가 먼저 정해지고, 열화 작업은 항상 원본 합성 뒤에 온다."""
    references = [job for script in ordered_for_anchor(scripts) for job in _reference_jobs(root, speaker_id, script)]
    ceilings = [_ceiling_job(root, speaker_id, sentence, scripts) for sentence in sentences if sentence.ceiling]
    return references + ceilings


def _reference_jobs(root: Path, speaker_id: str, script: ReferenceScript) -> list[Job]:
    clean = reference_path(root, speaker_id, "A", script.style)
    degraded = [
        DegradeJob(clean, reference_path(root, speaker_id, p.condition, script.style), p) for p in PROFILES
    ]
    return [SynthJob(clean, script.text, script.instruct, script.identity_threshold), *degraded]


def _ceiling_job(root: Path, speaker_id: str, sentence: EvalSentence, scripts: list[ReferenceScript]) -> SynthJob:
    return SynthJob(
        ceiling_path(root, speaker_id, sentence.id),
        sentence.text,
        instruct_for(sentence.style, scripts),
        identity_threshold_for(sentence.style, scripts),
    )

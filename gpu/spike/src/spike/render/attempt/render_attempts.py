"""compose 워크플로우가 단위 하나를 렌더할 때 쓰는 판단. 시도 사양, 시도 기록, 시도 고르기, 받아쓰기 입력 계획. 순수 로직.

흐름(클론, 받아쓰기, 반복)은 워크플로우가 맡고, 판단은 Python 렌더(story_render)와 같은 함수를 쓴다.
"""
from collections.abc import Sequence
from dataclasses import asdict, dataclass, replace
from functools import reduce
from pathlib import Path

from spike.render.attempt.attempt_files import attempt_audio
from spike.render.attempt.attempt_policy import attempt_seed, attempts_done, attempts_made, prefer_later
from spike.sound.audio import Audio
from spike.clone.budget import reached_budget, token_budget
from spike.render.job.render_job import RenderJob
from spike.render.attempt.render_qc import AttemptCheck, transcript_check
from spike.render.tail.repeat_tail import spoken_text
from spike.story.story_plan import StorySentence
from spike.clone.scoring.whisper_window import cleaned_segments, exceeds_whisper_window, join_segments


@dataclass(frozen=True)
class AttemptSpec:
    unit_index: int
    attempt: int
    text: str
    unit_text: str
    reference_path: str
    reference_text: str
    seed: int
    max_new_tokens: int
    audio_path: str


@dataclass(frozen=True)
class AttemptRecord:
    attempt: int
    text: str
    seed: int
    transcript: str
    duration_sec: float
    hit_budget: bool
    missing_chars: int
    error_rate: float
    head_share: float | None = None

    @property
    def check(self) -> AttemptCheck:
        return AttemptCheck(
            hit_budget=self.hit_budget, repeats_context=False, missing_chars=self.missing_chars, error_rate=self.error_rate,
        )


@dataclass(frozen=True)
class Measurement:
    duration_sec: float
    hit_budget: bool
    is_long: bool


@dataclass(frozen=True)
class TakeFacts:
    """저장한 앞부분만 봐서는 알 수 없는, 자르기 전 생성음의 판정. Python 렌더(story_render._attempt_once)와 같은 기준이다."""
    hit_budget: bool
    cut_failed: bool
    head_share: float | None = None
    head_transcript: str | None = None


def qc_texts(take: TakeFacts, transcribed: Sequence[object]) -> list[object]:
    """QC가 단위 원문과 견줄 받아쓰기. 자르지 못한 시도는 받아쓰지 않고 실패로 둔다.
    낱말 꼬리를 자를 때 이미 받아쓴 앞부분은 같은 소리라 그 받아쓰기를 쓴다."""
    if take.cut_failed:
        return []
    if take.head_transcript is not None:
        return [take.head_transcript]
    return list(transcribed)


def needs_split_transcription(take: TakeFacts, is_long: bool) -> bool:
    """30초 창을 넘어 VAD 구간으로 나눠 받아써야 하는가. 받아쓰지 않는 시도와 이미 받아쓴 앞부분은 아니다."""
    return is_long and not take.hit_budget and not take.cut_failed and take.head_transcript is None


@dataclass(frozen=True)
class UnitOutcome:
    done: bool
    passed: bool
    attempts: int
    chosen_attempt: int


def attempt_spec(job_dir: Path, job: RenderJob, units: Sequence[StorySentence], unit_index: int, attempt: int) -> AttemptSpec:
    """Python 렌더의 요청(story_render._request)과 같은 값을 만든다. 참조는 compose 클라이언트처럼 절대 경로로 넘긴다.
    text는 모델에 보내는 글, unit_text는 받아쓰기와 견주고 기록에 남기는 단위 원문이다."""
    unit = units[unit_index]
    reference = next(item for item in job.references if item.style == unit.style)
    audio_path = attempt_audio(job_dir, unit_index, attempt)
    spoken = spoken_text(unit)
    return AttemptSpec(
        unit_index, attempt, spoken, unit.text, str((job_dir / reference.file).resolve()), reference.text,
        attempt_seed(job.seed, attempt), token_budget(spoken), str(audio_path),
    )


def measure(text: str, audio: Audio) -> Measurement:
    """길이 예산 초과는 Python 렌더와 같은 기준이고, 30초 판단은 받아쓰기 경로를 가르는 기준과 같다."""
    return Measurement(audio.duration_sec, reached_budget(audio.duration_sec, text), exceeds_whisper_window(audio))


def attempt_record(spec: AttemptSpec, measured: Measurement, segment_texts: Sequence[object], head_share: float | None = None) -> AttemptRecord:
    """길이 예산을 넘긴 시도는 받아쓰지 않는다(Python 렌더와 같음). 구간 받아쓰기는 compose 클라이언트와 같은 규칙으로 잇는다."""
    transcript = "" if measured.hit_budget else join_segments(cleaned_segments(segment_texts))
    check = transcript_check(spec.unit_text, transcript, measured.hit_budget)
    return AttemptRecord(
        spec.attempt, spec.unit_text, spec.seed, transcript, measured.duration_sec, measured.hit_budget, check.missing_chars, check.error_rate,
        head_share,
    )


def chosen_record(records: Sequence[AttemptRecord]) -> AttemptRecord:
    """앞에서부터 접는다. 결과는 Python 렌더의 _best_attempt(뒤에서부터 고름)와 같다."""
    return reduce(lambda best, later: later if prefer_later(best.check, later.check) else best, records[1:], records[0])


def unit_outcome(records: Sequence[AttemptRecord]) -> UnitOutcome:
    """records는 시도 순서대로다. 마지막 시도가 합격했거나 마지막 기회였으면 멈춘다."""
    last = records[-1]
    chosen = chosen_record(records)
    return UnitOutcome(attempts_done(last.attempt, last.check.passed), chosen.check.passed, attempts_made(last.attempt), chosen.attempt)


def outcome_from(records: Sequence[AttemptRecord], first_attempt: int) -> UnitOutcome:
    """first_attempt부터 새로 센 재시도(목소리 대체 렌더)의 결과. 시도 번호를 0부터로 옮겨 같은 규칙을 쓰고 고른 번호를 되돌린다."""
    outcome = unit_outcome([replace(record, attempt=record.attempt - first_attempt) for record in records])
    return replace(outcome, chosen_attempt=outcome.chosen_attempt + first_attempt)


def record_from_dict(raw: dict) -> AttemptRecord:
    return AttemptRecord(**raw)


def record_to_dict(record: AttemptRecord) -> dict:
    return asdict(record)


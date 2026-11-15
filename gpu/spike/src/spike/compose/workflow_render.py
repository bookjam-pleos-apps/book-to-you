"""Python 렌더가 단위마다 compose 워크플로우 render-unit을 부른다. 어댑터.

단위 안의 흐름(시도 반복, 클론, 받아쓰기, QC)은 워크플로우가 하고, 단위 순회, 진행 저장, 조립은 render_job_with가 그대로 한다.
서비스는 작업 폴더를 경로로 읽으므로 같은 장비에서 실행한다. 시도 단계는 서비스의 SPIKE_PYTHON으로 돌므로, 그 환경이 이 작업 폴더의 spike 코드와 같아야 한다.
"""
import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from spike.render.attempt.attempt_files import attempt_audio, attempt_record_file
from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.compose.compose_http import run_workflow
from spike.render.attempt.render_attempts import AttemptRecord, UnitOutcome, record_from_dict
from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence

RENDER_UNIT_WORKFLOW = "render-unit"


def rendered_from_attempt(sentence: StorySentence, record: AttemptRecord, audio: Audio, outcome: UnitOutcome) -> RenderedSentence:
    """Python 렌더와 같은 report가 나오게 한다. 시도 수는 실제로 만든 횟수, seed는 고른 시도의 값이다.
    temperature는 넘기지 않았고, 생성 시간과 코드 수는 워크플로우 안에서 잴 수 없어 비운다(2층 compose 엔진과 같음).
    고른 시도의 원문이 이번 단위와 다르면 단위 번호가 어긋난 것이라 멈춘다. 그대로 두면 다른 문장의 음성이 조용히 붙는다."""
    if record.text != sentence.text:
        raise ValueError(f"시도 기록의 원문이 단위와 다릅니다: {record.text[:30]!r} != {sentence.text[:30]!r}")
    return RenderedSentence(
        sentence, audio, record.transcript, record.error_rate, outcome.attempts, outcome.passed, record.seed, None,
        head_share=record.head_share,
    )


def chosen_rendered(job_dir: Path, sentence: StorySentence, unit_index: int, outcome: UnitOutcome) -> RenderedSentence:
    """워크플로우가 남긴 시도 파일에서 고른 시도의 기록과 음성을 읽는다."""
    record_path = attempt_record_file(job_dir, unit_index, outcome.chosen_attempt)
    record = record_from_dict(json.loads(record_path.read_text(encoding="utf-8")))
    audio = read_audio(attempt_audio(job_dir, unit_index, outcome.chosen_attempt))
    return rendered_from_attempt(sentence, record, audio, outcome)


@dataclass(frozen=True)
class WorkflowUnitRenderer:
    url: str
    job_dir: Path

    def run_unit(self, unit_index: int) -> UnitOutcome:
        workflow_input = {"job_dir": str(self.job_dir.resolve()), "unit_index": unit_index}
        return UnitOutcome(**json.loads(run_workflow(self.url, RENDER_UNIT_WORKFLOW, workflow_input)))

    def render_one(self, sentence: StorySentence, done: Sequence[RenderedSentence]) -> RenderedSentence:
        """render_story는 단위를 순서대로 렌더하므로 이미 끝난 단위 수가 이번 단위의 번호다."""
        unit_index = len(done)
        return chosen_rendered(self.job_dir, sentence, unit_index, self.run_unit(unit_index))

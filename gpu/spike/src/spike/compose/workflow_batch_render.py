"""단위를 라운드로 렌더하며 배치마다 compose 워크플로우 render-batch를 부른다. 어댑터.

배치 계획과 라운드는 render_rounds(순수), 시도 파일 쓰기와 판정 기록은 워크플로우(run_render_step), 여기서는 둘을 잇는다.
voice를 주면 QC 라운드 뒤 인물 녹음 단위의 목소리를 재고 다시 굴리며, 그래도 바닥 아래면 그 단위만 대체 녹음으로 다시 만든다.
서비스가 작업 폴더를 경로로 읽으므로 같은 장비에서 실행한다(workflow_render와 같음).
"""
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from functools import partial
from pathlib import Path

from spike.render.attempt.attempt_files import attempt_record_file
from spike.render.batch.batch_plan import Batch, plan_batches
from spike.compose.compose_http import run_workflow
from spike.render.attempt.render_attempts import UnitOutcome, outcome_from, record_from_dict
from spike.render.job.render_job import write_unit_read_as
from spike.render.batch.render_rounds import qc_rounds, run_batches
from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence
from spike.render.voice.voice_note import VoiceNote
from spike.render.voice.voice_pass import EmbedPaths, voice_pass
from spike.render.voice.voice_rounds import VoiceResult, reroll_attempt
from spike.render.voice.voice_rule import VoiceRule
from spike.compose.workflow_render import chosen_rendered

RENDER_BATCH_WORKFLOW = "render-batch"


@dataclass(frozen=True)
class VoiceSetup:
    """reload_units는 단위별 대체(unit-read-as.json)를 반영해 작업 단위를 다시 만든다."""
    rule: VoiceRule
    embed: EmbedPaths
    references: Mapping[str, Path]
    reload_units: Callable[[], list[StorySentence]]


def _note(judged: StorySentence, result: VoiceResult, replaced: bool) -> VoiceNote:
    return VoiceNote(judged.style, result.score.group, result.score.reference, result.rerolls, replaced)


@dataclass(frozen=True)
class BatchWorkflowRenderer:
    url: str
    job_dir: Path

    def run_batch(self, batch: Batch, attempt: int) -> None:
        workflow_input = {"job_dir": str(self.job_dir.resolve()), "unit_indices": list(batch.units), "attempt": attempt}
        run_workflow(self.url, RENDER_BATCH_WORKFLOW, workflow_input)

    def _record(self, unit_index: int, attempt: int):
        return record_from_dict(json.loads(attempt_record_file(self.job_dir, unit_index, attempt).read_text(encoding="utf-8")))

    def read_outcome(self, unit_index: int, attempt: int, first_attempt: int = 0) -> UnitOutcome:
        """라운드마다 남은 단위만 다시 만드므로, 끝나지 않은 단위에는 first_attempt번부터 attempt번까지 기록이 모두 있다."""
        return outcome_from([self._record(unit_index, earlier) for earlier in range(first_attempt, attempt + 1)], first_attempt)

    def passed(self, unit_index: int, attempt: int) -> bool:
        return self._record(unit_index, attempt).check.passed

    def _run_units(self, units: Sequence[StorySentence], batch_size: int, indices: Sequence[int], attempt: int) -> None:
        run_batches(plan_batches(dict(enumerate(units)), indices, batch_size), attempt, self.run_batch)

    def _replaced(self, indices: Sequence[int], voice: VoiceSetup, batch_size: int) -> dict[int, UnitOutcome]:
        """대체 녹음 렌더는 다시 굴린 시도 다음 번호부터 QC 재시도를 처음부터 한다."""
        write_unit_read_as(self.job_dir, {index: voice.rule.fallback_style for index in indices})
        units, first = voice.reload_units(), reroll_attempt(voice.rule.max_rerolls)
        read = partial(self.read_outcome, first_attempt=first)
        return qc_rounds({index: units[index] for index in indices}, batch_size, self.run_batch, read, first_attempt=first)

    def _voice_checked(self, units: Sequence[StorySentence], outcomes: Mapping[int, UnitOutcome], batch_size: int, voice: VoiceSetup) -> list[RenderedSentence]:
        """대체 렌더가 QC를 통과하지 못하면 원래 녹음의 가장 나은 시도를 쓴다. 게시를 막는 것보다 낫다."""
        run_attempt = partial(self._run_units, units, batch_size)
        results = voice_pass(self.job_dir, units, outcomes, voice.references, voice.rule, voice.embed, run_attempt, self.passed)
        fallback = sorted(index for index, result in results.items() if result.step == "fallback")
        replaced = {i: o for i, o in (self._replaced(fallback, voice, batch_size) if fallback else {}).items() if o.passed}
        reloaded = voice.reload_units() if replaced else list(units)
        chosen = {index: replace(outcomes[index], chosen_attempt=result.attempt) for index, result in results.items()}
        final = {**outcomes, **chosen, **replaced}
        rendered = [chosen_rendered(self.job_dir, reloaded[i] if i in replaced else unit, i, final[i]) for i, unit in enumerate(units)]
        return [replace(item, voice=_note(units[i], results[i], i in replaced)) if i in results else item for i, item in enumerate(rendered)]

    def render(self, units: Sequence[StorySentence], batch_size: int, voice: VoiceSetup | None = None) -> list[RenderedSentence]:
        outcomes = qc_rounds(dict(enumerate(units)), batch_size, self.run_batch, self.read_outcome)
        if voice is None:
            return [chosen_rendered(self.job_dir, unit, index, outcomes[index]) for index, unit in enumerate(units)]
        return self._voice_checked(units, outcomes, batch_size, voice)

"""배치 렌더 뒤 목소리 자동 보정: 짚인 단위를 다시 굴리고, 그래도 바닥 아래면 대체 녹음으로 다시 만든다. 워크플로우와 임베딩은 가짜다."""
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from job_fixture import example_job

from spike.render.attempt.attempt_files import attempt_audio, attempt_record_file
from spike.sound.audio import Audio
from spike.render.batch.batch_plan import Batch
from spike.render.attempt.render_attempts import AttemptRecord, record_to_dict
from spike.render.job.render_job import job_units, load_render_job
from spike.render.story_store import save_unit_audio
from spike.render.voice.voice_rule import VoiceRule
from spike.compose.workflow_batch_render import BatchWorkflowRenderer, VoiceSetup

RATE = 24000
EXCITED = {"style": "excited", "pauseAfterMs": 450}
CALM = {"style": "calm", "pauseAfterMs": 450}
# 묶으면 calm 0(제목), excited 1, calm 2, excited 3이 된다.
LINES = [
    {**CALM, "text": "주인님이 집을 비운 사이"},
    {**EXCITED, "text": "“집 잘 지키고 있어.”"},
    {**CALM, "text": "고양이와 강아지와 생쥐가 함께 집을 지키기로 했어요. 모두 문 앞에 모였어요."},
    {**EXCITED, "text": "“우리가 지킬게요!”"},
]
RULE = VoiceRule(frozenset({"excited"}), 0.1, 10, 1, "calm", 0.7, 0.5)
GOOD, BAD = np.array([1.0, 0.0]), np.array([0.0, 1.0])


@dataclass(frozen=True)
class FakeBatchRenderer(BatchWorkflowRenderer):
    """render-batch 워크플로우처럼 배치의 단위마다 합격한 시도 파일을 쓰고, 보낸 배치를 적는다."""
    sent: list = field(default_factory=list)

    def run_batch(self, batch: Batch, attempt: int) -> None:
        self.sent.append((batch.style, batch.units, attempt))
        units = job_units(load_render_job(self.job_dir))
        [self._write(index, attempt, units[index].text) for index in batch.units]

    def _write(self, index: int, attempt: int, text: str) -> None:
        save_unit_audio(attempt_audio(self.job_dir, index, attempt), Audio(np.full(RATE // 4, 0.1, dtype=np.float32), RATE))
        record = AttemptRecord(attempt, text, 1234 + 1000 * attempt, text, 0.25, False, 0, 0.0)
        attempt_record_file(self.job_dir, index, attempt).write_text(json.dumps(record_to_dict(record), ensure_ascii=False), encoding="utf-8")


def _embed(vectors: dict[str, np.ndarray]):
    return lambda paths: [vectors.get(path.name, GOOD) for path in paths]


def _render(tmp_path: Path, vectors: dict[str, np.ndarray]):
    job_dir = example_job(tmp_path, lines=LINES)
    references = {"excited": job_dir / "reference-excited.wav", "calm": job_dir / "reference-calm.wav"}
    voice = VoiceSetup(RULE, _embed(vectors), references, lambda: job_units(load_render_job(job_dir)))
    renderer = FakeBatchRenderer("http://unused", job_dir)
    return renderer, renderer.render(job_units(load_render_job(job_dir)), 8, voice)


def test_units_with_their_own_voice_are_kept_after_one_batch_per_style(tmp_path: Path):
    renderer, rendered = _render(tmp_path, {})

    assert renderer.sent == [("calm", (0, 2), 0), ("excited", (1, 3), 0)]
    assert [item.voice is None for item in rendered] == [True, False, True, False]
    assert all(not item.voice.fallback and item.voice.rerolls == 0 for item in rendered if item.voice)


def test_a_unit_that_stays_off_after_rerolls_is_read_with_the_fallback_recording(tmp_path: Path):
    renderer, rendered = _render(tmp_path, {"0001-a0.wav": BAD, "0001-a3.wav": BAD})

    assert renderer.sent[2:] == [("excited", (1,), 3), ("calm", (1,), 4)]
    assert (rendered[1].sentence.style, rendered[1].seed) == ("calm", 1234 + 4000)
    assert (rendered[1].voice.judged_style, rendered[1].voice.rerolls, rendered[1].voice.fallback) == ("excited", 1, True)
    assert rendered[3].voice.fallback is False


def test_a_reroll_that_sounds_right_replaces_the_first_take(tmp_path: Path):
    renderer, rendered = _render(tmp_path, {"0001-a0.wav": BAD})

    assert renderer.sent[2:] == [("excited", (1,), 3)]
    assert (rendered[1].sentence.style, rendered[1].seed, rendered[1].voice.rerolls) == ("excited", 1234 + 3000, 1)

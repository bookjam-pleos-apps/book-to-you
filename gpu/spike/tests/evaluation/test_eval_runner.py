from pathlib import Path

import numpy as np
import soundfile as sf

from fakes import SAMPLE_RATE, FixedPitchTracker, FixedTranscriber, gliding_f0, tone
from spike.sound.audio import Audio
from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, plan_clones
from spike.evaluation.clone_eval.eval_runner import EvalContext, load_baselines, load_eval_meta, load_reference_gates, run_evaluations
from spike.evaluation.clone_eval.evaluator import Scorers, SpeakerBaseline
from spike.clone.plan.experiment import load_experiments, select
from spike.clone.layout import ceiling_path, reference_meta_path, reference_path
from spike.clone.meta_store import merge_meta

class ConstantEmbedder:
    def embed(self, audio: Audio) -> np.ndarray:
        return np.array([1.0, 0.0])


def _write_tone(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, tone(), SAMPLE_RATE)


def _clone_jobs(outputs: Path) -> list[CloneJob]:
    settings = PlanSettings(recordings=outputs / "rec", outputs=outputs, prep_version="v1")
    jobs = plan_clones(select(load_experiments(), ["calm_only"]), ["p_sohee"], load_eval_sentences()[:6],
                       load_reference_scripts(), settings)
    return [j for j in jobs if isinstance(j, CloneJob)]


def test_evaluations_accumulate_in_eval_meta(tmp_path: Path):
    jobs = _clone_jobs(tmp_path)[:2]
    [_write_tone(job.out_path) for job in jobs]
    clone_meta = {jobs[0].key: {"hitBudget": True}, jobs[1].key: {"hitBudget": False}}
    context = EvalContext(Scorers(FixedTranscriber(jobs[0].sentence.text), ConstantEmbedder(), FixedPitchTracker(gliding_f0(200, 300))), {}, clone_meta, {}, tmp_path)
    assert run_evaluations(jobs, context) == (jobs[0].key, jobs[1].key)
    meta = load_eval_meta(tmp_path)
    assert meta[jobs[0].key]["cer"] == 0.0 and meta[jobs[0].key]["hitBudget"] is True
    assert meta[jobs[1].key]["hitBudget"] is False


def test_baselines_load_only_existing_ceiling_recordings(tmp_path: Path):
    sentences = load_eval_sentences()
    ceiling_ids = [s.id for s in sentences if s.ceiling][:2]
    [_write_tone(ceiling_path(tmp_path, "p_sohee", sid)) for sid in ceiling_ids]
    baselines = load_baselines(["p_sohee", "d_mom30"], sentences, tmp_path, {}, Scorers(FixedTranscriber(""), ConstantEmbedder(), FixedPitchTracker(gliding_f0(200, 300))))
    assert baselines["p_sohee"].ceiling_similarity is not None
    assert baselines["d_mom30"] == SpeakerBaseline()


def test_baselines_leave_out_ceiling_clips_that_failed_the_identity_gate(tmp_path: Path):
    sentences = load_eval_sentences()
    passed, failed = [ceiling_path(tmp_path, "p_sohee", s.id) for s in sentences if s.ceiling][:2]
    [_write_tone(path) for path in (passed, failed)]
    merge_meta(reference_meta_path(tmp_path, "p_sohee"), {passed.name: {"identityOk": True}, failed.name: {"identityOk": False}})
    gates = load_reference_gates(tmp_path, ["p_sohee"])
    baselines = load_baselines(["p_sohee"], sentences, tmp_path, gates, Scorers(FixedTranscriber(""), ConstantEmbedder(), FixedPitchTracker(gliding_f0(200, 300))))
    assert baselines["p_sohee"] == SpeakerBaseline()


class LoudnessEmbedder:
    """큰 소리와 작은 소리를 서로 다른 화자처럼 임베딩한다."""

    def embed(self, audio: Audio) -> np.ndarray:
        return np.array([1.0, 0.0]) if np.abs(audio.samples).max() > 0.4 else np.array([0.0, 1.0])


def _write_quiet_tone(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, tone(level=0.2), SAMPLE_RATE)


def test_baseline_closer_to_another_speakers_calm_loses_its_similarity_anchor(tmp_path: Path):
    sentences = load_eval_sentences()
    [_write_tone(ceiling_path(tmp_path, "d_grandma60", s.id)) for s in sentences if s.ceiling]
    _write_quiet_tone(reference_path(tmp_path, "d_grandma60", "A", "calm"))
    _write_tone(reference_path(tmp_path, "d_mom30", "A", "calm"))
    scorers = Scorers(FixedTranscriber(""), LoudnessEmbedder(), FixedPitchTracker(gliding_f0(200, 300)))
    baselines = load_baselines(["d_grandma60", "d_mom30"], sentences, tmp_path, {}, scorers)
    assert baselines["d_grandma60"].anchor is None and baselines["d_grandma60"].ceiling_similarity is None
    assert baselines["d_grandma60"].syllables_per_sec_by_style

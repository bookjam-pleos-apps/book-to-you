from pathlib import Path

import numpy as np
import pytest

from fakes import FixedPitchTracker, FixedTranscriber, gliding_f0, tone_audio
from spike.sound.audio import Audio
from spike.clone.budget import count_syllables
from spike.clone.catalog import EvalSentence, load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, plan_clones
from spike.evaluation.clone_eval.evaluator import EVAL_VERSION, Scorers, SpeakerBaseline, evaluate_clone, speaker_baseline
from spike.clone.plan.experiment import load_experiments, select

class LevelEmbedder:
    """음량을 화자 차이처럼 쓰는 가짜 임베더. 음량이 같으면 같은 화자다."""

    def embed(self, audio: Audio) -> np.ndarray:
        return np.array([1.0, float(np.abs(audio.samples).max())])


def _sentence(text: str, style: str = "calm") -> EvalSentence:
    return EvalSentence(id="x", style=style, tags=(), ceiling=True, text=text)


def _scorers(transcript: str = "", f0: np.ndarray = gliding_f0(200, 400)) -> Scorers:
    return Scorers(FixedTranscriber(transcript), LevelEmbedder(), FixedPitchTracker(f0))


def _job() -> CloneJob:
    settings = PlanSettings(recordings=Path("/rec"), outputs=Path("/out"), prep_version="v1")
    jobs = plan_clones(select(load_experiments(), ["calm_only"]), ["p_sohee"], load_eval_sentences(),
                       load_reference_scripts(), settings)
    return next(j for j in jobs if isinstance(j, CloneJob))


def test_baseline_needs_two_ceiling_clips():
    assert speaker_baseline([(_sentence("토끼"), tone_audio(0.5))], _scorers()) == SpeakerBaseline()


def test_baseline_measures_real_speech_rate_per_style_and_similarity():
    clips = [
        (_sentence("토끼가잤어", "calm"), tone_audio(0.5, sec=1.0)),
        (_sentence("토끼가잤어", "calm"), tone_audio(0.5, sec=1.0)),
        (_sentence("토끼가잤어", "excited"), tone_audio(0.5, sec=0.5)),
    ]
    baseline = speaker_baseline(clips, _scorers())
    assert baseline.ceiling_similarity == pytest.approx(1.0)
    assert baseline.syllables_per_sec_by_style == pytest.approx({"calm": 5.0, "excited": 10.0}, rel=0.05)


def test_clone_entry_records_cer_and_ratios_against_baseline():
    job = _job()
    baseline = SpeakerBaseline(anchor=np.array([1.0, 0.5]), ceiling_similarity=0.8)
    entry = evaluate_clone(job, tone_audio(0.5), False, _scorers(job.sentence.text), baseline)
    assert entry["cer"] == 0.0
    assert entry["simRatio"] == pytest.approx(1 / 0.8, abs=1e-3)
    assert entry["rateRatio"] is None
    assert entry["evalVersion"] == EVAL_VERSION and entry["longestGapSec"] == 0.0 and entry["syllables"] == count_syllables(job.sentence.text)
    assert (entry["sentenceStyle"], entry["referenceStyle"]) == (job.sentence.style, "calm")


def test_speech_rate_is_compared_with_real_speech_of_the_same_style():
    job = _job()
    rates = {job.sentence.style: 4.0, "calm": 100.0}
    baseline = SpeakerBaseline(syllables_per_sec_by_style=rates)
    entry = evaluate_clone(job, tone_audio(0.5, sec=2.0), False, _scorers(""), baseline)
    assert entry["rateRatio"] == pytest.approx(count_syllables(job.sentence.text) / 2.0 / 4.0, rel=0.03)


def test_clone_without_baseline_has_no_similarity():
    job = _job()
    entry = evaluate_clone(job, tone_audio(0.5), True, _scorers(""), SpeakerBaseline())
    assert entry["speakerSim"] is None and entry["simRatio"] is None
    assert entry["cer"] == 1.0 and entry["hitBudget"] is True


def test_prosody_is_compared_with_ceiling_of_the_same_style():
    job = _job()
    other_style = next(s for s in ("calm", "excited") if s != job.sentence.style)
    baseline = SpeakerBaseline(f0_range_by_style={job.sentence.style: 4.8, other_style: 100.0})
    entry = evaluate_clone(job, tone_audio(0.5), False, _scorers(f0=gliding_f0(200, 400)), baseline)
    assert entry["f0RangeSt"] == pytest.approx(9.6, abs=0.1)
    assert entry["f0RangeRatio"] == pytest.approx(2.0, abs=0.03)
    assert entry["sentenceId"] == job.sentence.id and entry["energyRatio"] is None

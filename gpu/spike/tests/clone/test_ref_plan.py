from pathlib import Path

from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.reference.degrade import PROFILES
from spike.clone.reference.ref_plan import DegradeJob, SynthJob, plan_speaker

ROOT = Path("/rec")


def _plan():
    return plan_speaker(ROOT, "d_mom30", load_reference_scripts(), load_eval_sentences())


def test_first_job_synthesizes_the_calm_anchor():
    first = _plan()[0]
    assert isinstance(first, SynthJob) and first.path.name == "A_calm.wav"


def test_job_count_is_references_with_degrades_plus_ceilings():
    scripts, sentences = load_reference_scripts(), load_eval_sentences()
    expected = len(scripts) * (1 + len(PROFILES)) + sum(s.ceiling for s in sentences)
    assert len(_plan()) == expected


def test_every_degrade_source_is_synthesized_earlier():
    jobs = _plan()
    synth_index = {job.path: i for i, job in enumerate(jobs) if isinstance(job, SynthJob)}
    degrades = [(i, job) for i, job in enumerate(jobs) if isinstance(job, DegradeJob)]
    assert all(synth_index[job.src] < i for i, job in degrades)


def test_all_paths_stay_inside_the_speaker_folder():
    jobs = _plan()
    paths = [job.path if isinstance(job, SynthJob) else job.dst for job in jobs]
    assert all(p.parent == ROOT / "d_mom30" for p in paths)



def test_identity_threshold_follows_the_style_of_each_synthesized_clip():
    thresholds = {s.style: s.identity_threshold for s in load_reference_scripts()}
    excited_ceiling = next(s for s in load_eval_sentences() if s.ceiling and s.style == "excited")
    jobs = {job.path.name: job for job in _plan() if isinstance(job, SynthJob)}
    assert jobs["A_calm.wav"].identity_threshold is None
    assert jobs["A_excited.wav"].identity_threshold == thresholds["excited"] is not None
    assert jobs[f"A_ceil_{excited_ceiling.id}.wav"].identity_threshold == thresholds["excited"]

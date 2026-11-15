from argparse import Namespace
from pathlib import Path

from spike.clone.catalog import load_speakers
from spike.evaluation.clone_eval.cli_plan import plan_from_args
from spike.clone.plan.clone_plan import CloneJob


def test_plan_follows_selected_experiments_and_speakers(tmp_path: Path):
    run = plan_from_args(Namespace(experiments=["calm_only"], speakers=["p_sohee"], out=tmp_path))
    clones = [j for j in run.jobs if isinstance(j, CloneJob)]
    assert [e.id for e in run.experiments] == ["calm_only"]
    assert run.speaker_ids == ["p_sohee"] and run.outputs == tmp_path
    assert clones and all(c.speaker_id == "p_sohee" and c.experiment.id == "calm_only" for c in clones)


def test_plan_reads_the_script_the_speaker_actually_recorded(tmp_path: Path):
    own_script = next(s for s in load_speakers() if s.id == "s3_phone").scripts["soft"]
    run = plan_from_args(Namespace(experiments=["baseline"], speakers=["s3_phone"], out=tmp_path))
    texts = {j.reference.text for j in run.jobs if isinstance(j, CloneJob) and j.reference_style == "soft"}
    assert texts == {own_script}

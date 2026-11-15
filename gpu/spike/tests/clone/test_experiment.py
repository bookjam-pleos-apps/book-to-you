from pathlib import Path

import pytest

from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import PlanSettings, missing_references, plan_clones
from spike.clone.plan.experiment import load_experiments, select, unknown_engines


def _by_id():
    return {e.id: e for e in load_experiments()}


def test_experiment_inherits_defaults_and_overrides_only_what_it_states():
    experiments = _by_id()
    assert experiments["baseline"].conditions == ("A", "B", "C")
    assert experiments["small_model"].model.endswith("0.6B-Base")
    assert experiments["small_model"].non_streaming is True


def test_style_map_redirects_reference_style():
    calm_only = _by_id()["calm_only"]
    assert calm_only.reference_style("excited") == "calm"
    assert calm_only.reference_style("calm") == "calm"


def test_sentence_styles_limit_which_sentences_are_included():
    experiments = _by_id()
    assert experiments["baseline"].includes("calm")
    assert not experiments["whisper_for_soft"].includes("calm")


def _required_reference_names(experiment_ids: list[str]) -> set[str]:
    experiments = select(load_experiments(), experiment_ids)
    settings = PlanSettings(Path("/rec"), Path("/out"), "v")
    jobs = plan_clones(experiments, ["s1"], load_eval_sentences(), load_reference_scripts(), settings)
    return {path.name for path in missing_references(jobs, lambda _: False)}


def test_reduced_real_speaker_experiments_need_only_four_references():
    names = _required_reference_names(["real_quiet", "real_phone_calm"])
    assert names == {"A_calm.wav", "A_excited.wav", "A_soft.wav", "B_calm.m4a"}


def test_macbook_only_emotion_comparison_needs_only_quiet_references():
    names = _required_reference_names(["real_quiet", "real_quiet_calm_only"])
    assert names == {"A_calm.wav", "A_excited.wav", "A_soft.wav"}


def test_real_speaker_experiments_run_only_when_named():
    default_ids = {e.id for e in select(load_experiments(), None)}
    assert "baseline" in default_ids
    assert not any(i.startswith("real_") for i in default_ids)
    assert [e.id for e in select(load_experiments(), ["real_quiet"])] == ["real_quiet"]


def test_every_mapped_style_has_a_reference_script():
    styles = {s.style for s in load_reference_scripts()}
    targets = {target for e in load_experiments() for _, target in e.style_map}
    assert targets <= styles


def test_experiments_are_hashable():
    assert len(set(load_experiments())) == len(load_experiments())


def test_select_without_ids_leaves_out_explicit_only_experiments():
    assert select(load_experiments(), None) == [e for e in load_experiments() if not e.explicit_only]


def test_select_rejects_unknown_id():
    with pytest.raises(KeyError):
        select(load_experiments(), ["baseline", "nope"])


def test_unknown_engines_reports_unregistered_engine():
    assert unknown_engines(load_experiments(), ["qwen3-base", "qwen3-base-compose"]) == []
    assert unknown_engines(load_experiments(), ["qwen3-base"]) == ["qwen3-base-compose"]

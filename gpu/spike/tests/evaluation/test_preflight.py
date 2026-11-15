from pathlib import Path

from spike.clone.catalog import load_eval_sentences, load_reference_scripts
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, PrepareJob, plan_clones
from spike.clone.plan.experiment import load_experiments, select
from spike.evaluation.clone_eval.preflight import PreflightInputs, blocking_problems, build_report

RECORDINGS = Path("/rec")
SETTINGS = PlanSettings(recordings=RECORDINGS, outputs=Path("/out"), prep_version="v1")


def _inputs(clone_meta: dict[str, dict] | None = None) -> PreflightInputs:
    sentences = load_eval_sentences()
    jobs = plan_clones(select(load_experiments(), ["calm_only"]), ["p_sohee"], sentences,
                       load_reference_scripts(), SETTINGS)
    return PreflightInputs(jobs, ["p_sohee"], sentences, RECORDINGS, clone_meta or {}, {}, {})


def _clones(inputs: PreflightInputs) -> list[CloneJob]:
    return [j for j in inputs.jobs if isinstance(j, CloneJob)]


def _all_tools(_: str) -> bool:
    return True


def test_empty_workspace_needs_every_reference_and_clone():
    inputs = _inputs()
    report = build_report(inputs, lambda _: False, _all_tools)
    assert report.clones_by_experiment == {"calm_only": len(_clones(inputs))}
    assert report.to_generate == len(_clones(inputs))
    assert len(report.missing_references) == len([j for j in inputs.jobs if isinstance(j, PrepareJob)])
    assert len(report.missing_ceilings["p_sohee"]) == sum(s.ceiling for s in inputs.sentences)


def test_workspace_with_every_file_has_nothing_missing():
    report = build_report(_inputs(), lambda _: True, _all_tools)
    assert report.missing_references == [] and report.missing_ceilings == {} and report.missing_tools == []
    assert report.to_generate == 0


def test_outputs_from_other_settings_are_reported_and_ready_ones_wait_for_evaluation():
    inputs = _inputs()
    first, second = _clones(inputs)[:2]
    clone_meta = {first.key: {"fingerprint": "old"}, second.key: {"fingerprint": second.fingerprint}}
    generated = {first.out_path, second.out_path}
    report = build_report(_inputs(clone_meta), lambda path: path in generated, _all_tools)
    assert report.stale_outputs == [first.key]
    assert report.to_evaluate == 1 and report.to_generate == len(_clones(inputs)) - 2


def test_missing_tools_are_reported():
    report = build_report(_inputs(), lambda _: True, lambda tool: tool != "ffmpeg")
    assert report.missing_tools == ["ffmpeg"]


def _recordings_without_ceilings(path: Path) -> bool:
    return path.is_relative_to(RECORDINGS) and not path.name.startswith("A_ceil_")


def test_missing_ceilings_alone_do_not_block():
    report = build_report(_inputs(), _recordings_without_ceilings, _all_tools)
    assert report.missing_ceilings and blocking_problems(report) == []


def test_missing_references_stale_outputs_and_tools_block():
    inputs = _inputs()
    first = _clones(inputs)[0]
    report = build_report(_inputs({first.key: {"fingerprint": "old"}}), lambda path: path == first.out_path, lambda _: False)
    assert blocking_problems(report) == ["참조 녹음 1개 누락", "다른 설정으로 만든 출력 1개 (지우거나 실험 id 변경)",
                                         "도구 설치 필요: ffmpeg"]

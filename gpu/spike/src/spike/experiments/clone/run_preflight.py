"""GPU 실행 전 점검. torch와 모델을 import하지 않아 맥에서도, DGX에서 첫 명령으로도 몇 초 안에 돈다.

사용: uv run --group dev python -m spike.experiments.clone.run_preflight [--experiments baseline calm_only] [--speakers p_sohee]
"""
from spike.clone.cli_output import abort_if, print_list
from spike.evaluation.clone_eval.cli_plan import parse_plan_args, plan_from_args
from spike.evaluation.clone_eval.preflight import PreflightReport, blocking_problems
from spike.evaluation.clone_eval.workspace_check import inspect_workspace


def _print_report(report: PreflightReport) -> None:
    print("실험별 클론 수:", report.clones_by_experiment)
    print(f"새로 생성할 클론: {report.to_generate}개 / 평가 대기(생성된 것 중): {report.to_evaluate}개")
    print_list("참조 녹음 누락:", report.missing_references)
    print_list("다른 설정으로 만든 출력:", report.stale_outputs)
    print_list("천장 녹음 누락 (해당 스타일 판정 보류):",
               [f"{speaker}: {len(paths)}개" for speaker, paths in report.missing_ceilings.items()])
    print_list("설치되지 않은 도구:", report.missing_tools)


def main() -> None:
    report = inspect_workspace(plan_from_args(parse_plan_args()))
    _print_report(report)
    abort_if(blocking_problems(report), "GPU 실행 전에 해결할 문제:")
    print("점검 통과: GPU에서 run_clone을 실행해도 됩니다.")


if __name__ == "__main__":
    main()

"""조건별 렌더 평균 화자 유사도(참조 기준)를 기준 조건과 견준 마크다운 표를 낸다. 합격 판정이 아니다. GPU 없이 돈다.

조건 json 형식은 spike.evaluation.render_eval.compare_config에 있다. 참조가 기준 조건과 다른 조건은 숫자로 판정하지 않는다.
사용(gpu/spike에서): uv run --group dev python -m spike.experiments.measure.run_compare_renders \\
    --metrics outputs/eval_set/unit_metrics.json outputs/eval_set/unit_metrics_seed.json \\
    --conditions data/eval-compare-character.json --baseline r0 [--key simHead.s4]
"""
import argparse
import json
from collections.abc import Mapping, Sequence
from pathlib import Path

from spike.evaluation.render_eval.compare_config import parse_conditions, parse_thresholds
from spike.evaluation.render_eval.render_compare import DEFAULT_KEY, MIN_SEEDS, ConditionResult, Threshold, compare_conditions

DATA = Path(__file__).resolve().parents[4] / "data"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metrics", type=Path, nargs="+", required=True, help="run_measure_eval 출력. 여러 개면 이어 붙인다")
    parser.add_argument("--conditions", type=Path, required=True)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--key", default=DEFAULT_KEY, help="참조 기준 값만. simCentroid는 렌더 사이 비교에 쓰지 않는다")
    parser.add_argument("--thresholds", type=Path, default=DATA / "eval-compare-thresholds.json")
    return parser


def _metric_rows(paths: Sequence[Path]) -> list[Mapping[str, object]]:
    rows = [row for path in paths for row in json.loads(path.read_text(encoding="utf-8"))]
    if not all(isinstance(row, dict) for row in rows):
        raise SystemExit("단위 지표 표는 객체 목록이어야 한다")
    return rows


def _read(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _line(result: ConditionResult) -> str:
    renders = ", ".join(f"{render.split('/')[-1]} {mean:.3f}" for render, mean in result.render_means)
    return (f"| {result.name} | {result.reference or '-'} | {renders} | {result.mean:.3f} | "
            f"{result.difference:+.3f} | {result.verdict} |")


def _threshold_rule(threshold: Threshold | None) -> str:
    if threshold is None:
        return "이 값은 seed 잡음 근거가 없어 문턱이 없다. 차이만 적는다."
    return (f"seed만 다른 렌더 쌍의 차이 최대 {threshold.seed_noise_max:g}, 문턱 {threshold.min_difference:g} "
            f"({threshold.source}). 차이가 문턱 이상일 때만 나빠짐·좋아짐이다.")


def comparison_table(results: Sequence[ConditionResult], key: str, baseline: str, threshold: Threshold | None) -> str:
    rule = (f"{key} 렌더 평균(제목 단위 제외), 기준 {baseline}. 조건마다 seed {MIN_SEEDS}개 이상만 숫자로 읽는다. "
            f"{_threshold_rule(threshold)} 참조가 기준과 다른 조건은 청취로 판정한다.")
    header = ["| 조건 | 참조 | 렌더 평균 | 조건 평균 | 기준과 차이 | 판정 |", "|---|---|---|---|---|---|"]
    return "\n".join([rule, "", *header, *map(_line, results)])


def main() -> None:
    args = _parser().parse_args()
    try:
        threshold = parse_thresholds(_read(args.thresholds), str(args.thresholds)).get(args.key)
        conditions = parse_conditions(_read(args.conditions), str(args.conditions))
        results = compare_conditions(_metric_rows(args.metrics), conditions, args.baseline, args.key, threshold)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    print(comparison_table(results, args.key, args.baseline, threshold))


if __name__ == "__main__":
    main()

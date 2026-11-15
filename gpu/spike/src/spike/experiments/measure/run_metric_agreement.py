"""시험 세트 최신 버전과 단위 지표 표로 지표가 청취 지목과 맞는지(층화 AUC) 낸다. GPU 없이 돈다.

단위 지표 표는 [{"render", "unit", 지표...}] json 목록이다. spike.experiments.measure.run_measure_eval이 만든다.
사용: uv run python -m spike.experiments.measure.run_metric_agreement --metrics outputs/eval_set/unit_metrics.json --key simHead.s4 --higher-is-better
"""
import argparse
import json
import math
from collections.abc import Sequence
from pathlib import Path

from spike.evaluation.eval_set.eval_set_rows import item_from_row
from spike.evaluation.eval_set.eval_set_store import latest_set, read_set_rows
from spike.evaluation.eval_set.eval_strata import listening_strata, unit_values
from spike.evaluation.eval_set.eval_vocab import Kind, is_kind
from spike.evaluation.eval_set.metric_agreement import agreement, verdict

ROOT = Path(__file__).resolve().parents[4]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metrics", type=Path, required=True)
    parser.add_argument("--key", required=True, help="점으로 나눈 경로, 예: simHead.s4")
    parser.add_argument("--higher-is-better", action="store_true", help="유사도처럼 높을수록 좋은 지표")
    parser.add_argument("--kinds", nargs="*", default=None, help="이 종류의 지목만 센다. 없으면 모두")
    return parser


def _kinds(names: Sequence[str] | None) -> frozenset[Kind] | None:
    if names is None:
        return None
    unknown = [name for name in names if not is_kind(name)]
    if unknown:
        raise SystemExit(f"모르는 지목 종류: {unknown}")
    return frozenset(name for name in names if is_kind(name))


def _metric_rows(path: Path) -> list[object]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit(f"{path}: 단위 지표 표는 json 목록이어야 한다")
    return rows


def main() -> None:
    args = _parser().parse_args()
    _, latest = latest_set(ROOT / "data")
    if latest is None:
        raise SystemExit("시험 세트가 없다. 먼저 python -m spike.experiments.measure.run_build_eval_set")
    items = [item_from_row(row) for row in read_set_rows(latest)]
    values = unit_values(_metric_rows(args.metrics), args.key, args.higher_is_better)
    if not any(math.isfinite(v) for v in values.values()):
        raise SystemExit(f"{args.key} 값이 하나도 없다. 경로를 확인한다")
    result = agreement(listening_strata(items, values, _kinds(args.kinds)))
    print(f"{latest.name} {args.key}: AUC {result.auc:.2f} [{result.low:.2f}–{result.high:.2f}] 쌍 {result.pairs} → {verdict(result)}")


if __name__ == "__main__":
    main()

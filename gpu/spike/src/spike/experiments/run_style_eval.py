"""test-sentences로 라벨링 방법을 비교한다. 합격선은 없고, 표본이 작아 건수를 그대로 보고한다.

규칙만: uv run --group dev python -m spike.experiments.run_style_eval --out report.json
Nimble까지: 같은 명령에 --nimble (ssh -L 18092:127.0.0.1:18092 <4090 호스트>로 연결해 둔다)
"""
import argparse
import hashlib
import json
from pathlib import Path

from spike.sound.atomic import atomic_path
from spike.clone.catalog import load_eval_sentences
from spike.story.style_decision import draft_style
from spike.story.style_eval import JUDGED_STYLES, NIMBLE_CONDITIONS, baselines, nimble_condition
from spike.compose.style_tag_client import DEFAULT_URL, score_text
from spike.story.style_tag_plan import DATA_DIR, StyleSchema, load_style_schema

SCHEMA_PATH = DATA_DIR / "style-schema.json"


def _nimble_results(schema: StyleSchema, url: str) -> dict[str, dict]:
    sentences = load_eval_sentences()
    return {
        condition.id: nimble_condition(
            sentences,
            condition,
            schema,
            lambda text: score_text(url, schema, text),
            lambda probabilities: draft_style(probabilities, schema.min_confidence),
        )
        for condition in NIMBLE_CONDITIONS
    }


def _score_cell(score: dict) -> str:
    hits, picked, actual = score["tp"], score["tp"] + score["fp"], score["tp"] + score["fn"]
    return f"재현 {hits}/{actual}, 정밀 {hits}/{picked}"


def _summary_line(name: str, summary: dict) -> str:
    cells = (f"{style} {_score_cell(summary['scores'][style])}" for style in JUDGED_STYLES)
    return f"{name}: " + " | ".join(cells)


def _report_lines(report: dict) -> list[str]:
    baseline_lines = [_summary_line(name, summary) for name, summary in report["baselines"].items()]
    nimble_lines = [
        _summary_line(f"{name}/{stage}", result[stage])
        for name, result in (report["nimble"] or {}).items()
        for stage in ("raw", "decided")
    ]
    return [*baseline_lines, *nimble_lines]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--nimble", action="store_true")
    parser.add_argument("--url", default=DEFAULT_URL)
    args = parser.parse_args()
    if args.out.exists():
        raise SystemExit(f"이미 있는 측정 결과는 덮어쓰지 않습니다: {args.out}")
    schema = load_style_schema()
    report = {
        "schemaSha256": hashlib.sha256(SCHEMA_PATH.read_bytes()).hexdigest(),
        "baselines": baselines(load_eval_sentences()),
        "nimble": _nimble_results(schema, args.url) if args.nimble else None,
    }
    with atomic_path(args.out) as tmp:
        tmp.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(_report_lines(report)))


if __name__ == "__main__":
    main()

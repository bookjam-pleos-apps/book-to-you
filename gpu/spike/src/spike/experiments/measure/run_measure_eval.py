"""평가 루프 단위 지표: 렌더의 모든 단위에 화자 유사도(참조 기준, 렌더 평균 기준), 음높이, 말 속도를 잰다.

맥 CPU에서 돈다(ECAPA, pYIN). 렌더 하나(단위 40~60개)에 약 20초다. 결과는 run_metric_agreement와
run_compare_renders가 읽는 평평한 행 목록 json이다.
사용(gpu/spike에서): uv run --group dev --with 'speechbrain>=1.0' --with torchaudio python -m spike.experiments.measure.run_measure_eval \\
    --out outputs/eval_set/unit_metrics.json [--renders exp_v3/redhood_1 exp_v3/redhood_2]
렌더를 주지 않으면 청취 기록(data/eval-listenings.json)의 렌더와 data/eval-extra-renders.json을 잰다.
"""
import argparse
import json
import tempfile
from pathlib import Path

from spike.sound.audio_io import read_audio
from spike.evaluation.render_eval.eval_measure import measure_unit, measurement_order, render_rows
from spike.evaluation.render_eval.eval_measure_sources import ReferenceBank, load_extra_renders, load_reference_templates, report_rows
from spike.evaluation.eval_set.eval_set_store import load_listenings, load_render
from spike.clone.identity import Embedder
from spike.sound.prosody import PitchTracker

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--renders", nargs="*", default=None, help="outputs 기준 렌더 이름. 없으면 청취 기록 + 추가 렌더")
    parser.add_argument("--references", type=Path, default=DATA / "eval-references.json")
    parser.add_argument("--extra", type=Path, default=DATA / "eval-extra-renders.json")
    parser.add_argument("--listenings", type=Path, default=DATA / "eval-listenings.json")
    return parser


def _measure_render(render: str, picks_file: str | None, embedder: Embedder, tracker: PitchTracker,
                    bank: ReferenceBank) -> list[dict[str, object]]:
    loaded = load_render(ROOT, render, picks_file)
    reports = report_rows(ROOT, loaded)
    measured = [
        measure_unit(read_audio(ROOT / audio), unit, report, embedder, tracker, bank.for_style)
        for audio, unit, report in zip(loaded.audio, loaded.units, reports)
    ]
    return render_rows(render, measured)


def _renders_and_picks(args: argparse.Namespace) -> tuple[list[str], dict[str, str]]:
    listenings, picks = load_listenings(args.listenings)
    extra = load_extra_renders(args.extra)
    all_picks = picks | {render: p for render, p in extra.items() if p is not None}
    if args.renders:
        return list(args.renders), all_picks
    return measurement_order([li.render for li in listenings], list(extra)), all_picks


def main() -> None:
    from spike.sound.pitch_tracker import PyinPitchTracker
    from spike.clone.scoring.speaker_embedding import EcapaEmbedder

    args = _parser().parse_args()
    renders, picks = _renders_and_picks(args)
    templates = load_reference_templates(args.references, ROOT)
    embedder, tracker = EcapaEmbedder(device="cpu"), PyinPitchTracker()
    with tempfile.TemporaryDirectory() as work_dir:
        bank = ReferenceBank(embedder, Path(work_dir), templates)
        rows = [row for render in renders for row in _measure_render(render, picks.get(render), embedder, tracker, bank)]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(renders)}개 렌더, {len(rows)}개 단위 → {args.out}")


if __name__ == "__main__":
    main()

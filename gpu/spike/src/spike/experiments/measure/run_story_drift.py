"""두 렌더의 묶음별 지표를 비교해 표로 출력한다. 판정하지 않는다. speechbrain과 librosa가 필요하고 맥의 CPU에서 돈다.

사용: uv run --group dev --with 'librosa>=1.0' --with 'speechbrain>=1.0' --with torchaudio python -m spike.experiments.measure.run_story_drift \\
  --baseline outputs/story_passage --baseline-leveling none --dir outputs/story_chain --speaker s1b

--baseline-leveling과 --leveling은 폴더의 저장 방식에 맞춘다. story_passage의 units는 이미 음량을 맞춘 소리라 none이고, run_story가 새로 만든 폴더는 per_unit이다.
"""
import argparse
from collections.abc import Sequence
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.evaluation.render_eval.long_form_eval import Boundary, measure_boundaries
from spike.sound.pitch_tracker import PyinPitchTracker
from spike.sound.prosody import PitchTracker
from spike.clone.scoring.speaker_embedding import EcapaEmbedder
from spike.render.story_render import LEVELERS, RenderedSentence, leveled_units, unit_starts
from spike.render.story_store import load_units
from spike.evaluation.render_eval.story_trend import METRICS, UnitTrend, halves, mean_abs_f0_change, paired_differences, rendered_trends
from spike.clone.reference.style_embeddings import style_embeddings

UNKNOWN = "   -  "


def _cell(value: float | None) -> str:
    return UNKNOWN if value is None else f"{value:+6.2f}"


def _row(label: str, trend: UnitTrend) -> str:
    return f"{label:>4} " + " ".join(_cell(getattr(trend, metric)) for metric in METRICS)


def _boundary_f0(units: Sequence[RenderedSentence], leveling: str, tracker: PitchTracker) -> list[Boundary]:
    return measure_boundaries(leveled_units(units, leveling), unit_starts(units), tracker)


def _print_table(title: str, trends: Sequence[UnitTrend]) -> None:
    print(f"\n{title}\n묶음 {' '.join(METRICS)}")
    print(*[_row(str(index), trend) for index, trend in enumerate(trends)], sep="\n")


def _print_halves(differences: Sequence[UnitTrend]) -> None:
    print("\n비교−기준, 앞 절반 → 뒤 절반")
    print(*[f"{metric}: {_cell(halves(differences, metric)[0])} → {_cell(halves(differences, metric)[1])}" for metric in METRICS], sep="\n")


def _print_boundary_f0(title: str, boundaries: Sequence[Boundary]) -> None:
    print(f"{title} 경계 음높이 변화 절댓값 평균: {_cell(mean_abs_f0_change(boundaries))}반음")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--baseline-leveling", choices=sorted(LEVELERS), required=True)
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--leveling", choices=sorted(LEVELERS), default="per_unit")
    parser.add_argument("--speaker", required=True)
    add_condition_argument(parser)
    args = parser.parse_args()
    baseline, compared = load_units(args.baseline), load_units(args.dir)
    tracker, embedder = PyinPitchTracker(), EcapaEmbedder(device="cpu")
    references = style_embeddings(args.speaker, args.condition, (item.sentence.style for item in [*baseline, *compared]), embedder)
    before = rendered_trends(baseline, args.baseline_leveling, tracker, embedder, references)
    after = rendered_trends(compared, args.leveling, tracker, embedder, references)
    differences = paired_differences(before, after)
    _print_table("비교 렌더", after)
    _print_table("비교−기준", differences)
    _print_halves(differences)
    print()
    _print_boundary_f0("기준", _boundary_f0(baseline, args.baseline_leveling, tracker))
    _print_boundary_f0("비교", _boundary_f0(compared, args.leveling, tracker))


if __name__ == "__main__":
    main()

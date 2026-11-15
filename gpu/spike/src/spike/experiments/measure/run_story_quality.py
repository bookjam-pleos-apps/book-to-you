"""전체 렌더를 청취 전 기준으로 잰다. 합격 판정이 아니다. speechbrain과 librosa가 필요하고 맥의 CPU에서 돈다.

사용: uv run --group dev --with 'librosa>=1.0' --with 'speechbrain>=1.0' --with torchaudio python -m spike.experiments.measure.run_story_quality \\
  --baseline outputs/q_base --dir outputs/q_onehop --speaker s1b

폰 녹음은 --condition B를 더한다. 묶음마다 자기 style의 참조와 비교하고, 유사도 선은 calm 묶음에만 건다.
report에 없는 샘플링 조건은 폴더의 render_settings.json을 본다. 옛 story_passage는 저장 방식이 달라 --baseline-leveling none을 준다.
"""
import argparse
from collections.abc import Sequence
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.sound.pitch_tracker import PyinPitchTracker
from spike.clone.scoring.speaker_embedding import EcapaEmbedder
from spike.evaluation.render_eval.story_quality import (
    BarCheck,
    articulation_rate,
    centroid_similarity_mean,
    fastest_unit_changes,
    lowest_window_similarity,
    missing_candidates,
    story_bar_checks,
    style_similarity_means,
)
from spike.render.story_render import LEVELERS, RenderedSentence
from spike.render.story_script import refuse_different_script
from spike.render.story_store import load_units
from spike.evaluation.render_eval.story_trend import UnitTrend, paired_differences, rendered_trends
from spike.clone.reference.style_embeddings import style_embeddings


def _line(check: BarCheck) -> str:
    value = "없음" if check.value is None else f"{check.value:+.3f}"
    return f"{'통과' if check.passed else '탈락'}  {check.name}: {value} (선 {check.limit:+.3f})"


def _print_checks(checks: Sequence[BarCheck]) -> None:
    print(*[_line(check) for check in checks], sep="\n")


def _fastest_line(differences: Sequence[UnitTrend]) -> str:
    return ", ".join(f"{index}번 {change:+.2f}" for index, change in fastest_unit_changes(differences)) or "없음"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--baseline-leveling", choices=sorted(LEVELERS), default="per_unit")
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--leveling", choices=sorted(LEVELERS), default="per_unit")
    parser.add_argument("--speaker", required=True)
    add_condition_argument(parser)
    return parser


def _matching_baseline(folder: Path, compared: Sequence[RenderedSentence]) -> list[RenderedSentence]:
    """앞부분만 만든 비교 렌더는 기준의 같은 범위와 맞춘다. 대본이 다르면 비교할 수 없다."""
    baseline = load_units(folder)[: len(compared)]
    refuse_different_script([item.sentence for item in compared], baseline, "기준 렌더")
    return baseline


def main() -> None:
    args = _parser().parse_args()
    compared = load_units(args.dir)
    baseline = _matching_baseline(args.baseline, compared)
    tracker, embedder = PyinPitchTracker(), EcapaEmbedder(device="cpu")
    references = style_embeddings(args.speaker, args.condition, (item.sentence.style for item in [*baseline, *compared]), embedder)
    before = rendered_trends(baseline, args.baseline_leveling, tracker, embedder, references)
    after = rendered_trends(compared, args.leveling, tracker, embedder, references)
    differences = paired_differences(before, after)
    print(f"{args.dir}\n주 지표: 렌더 평균 목소리 기준 유사도 {centroid_similarity_mean(compared, embedder):.3f} (기준 {centroid_similarity_mean(baseline, embedder):.3f})")
    print("청취 전 기준")
    _print_checks(story_bar_checks(compared, differences, after))
    print(f"누락 후보(단위, 글자 수): {missing_candidates(compared)}")
    print(f"참고: style별 자기 참조 유사도 { {style: round(value, 3) for style, value in style_similarity_means(compared, after).items()} }")
    print(f"참고: 많이 빨라진 묶음(음절/초) {_fastest_line(differences)}")
    print(f"참고: 조음 속도 {articulation_rate(compared):.2f}음절/초 (기준 {articulation_rate(baseline):.2f})")
    print(f"참고: 8초 창 최저 유사도 {lowest_window_similarity(compared, embedder, references):.3f} (기준 {lowest_window_similarity(baseline, embedder, references):.3f})")


if __name__ == "__main__":
    main()

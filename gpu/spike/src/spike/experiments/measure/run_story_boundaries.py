"""저장한 단위의 경계 변화를 출력한다. 들을 곳을 고르는 순위가 아니라 조건끼리 비교하는 참고 수치다.

사용: uv run --group dev python -m spike.experiments.measure.run_story_boundaries --dir outputs/story_passage
"""
import argparse
from pathlib import Path

from spike.clone.scoring.eval_metrics import syllables_per_sec
from spike.listening.listening_plan import clock
from spike.evaluation.render_eval.long_form_eval import Boundary, measure_boundaries
from spike.sound.pitch_tracker import PyinPitchTracker
from spike.render.story_render import LEVELERS, RenderedSentence, leveled_units, unit_starts
from spike.render.story_store import load_units, report_line


def _boundary_line(boundary: Boundary) -> str:
    f0 = "없음" if boundary.delta_f0_semitones is None else f"{boundary.delta_f0_semitones:+.1f}반음"
    return f"{clock(boundary.at_sec)}  단위 {boundary.unit}→{boundary.unit + 1}  음량 {boundary.delta_energy_db:+.1f}dB  음높이 {f0}"


def _unit_line(index: int, start_sec: float, item: RenderedSentence) -> str:
    rate = syllables_per_sec(item.sentence.text, item.audio)
    speed = "잴 수 없음" if rate is None else f"초당 {rate:.2f}음절"
    return f"{clock(start_sec)}  단위 {index}  {speed}  시도 {item.attempts}  이득 {report_line(item)['gainDb']:+.1f}dB"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--leveling", choices=sorted(LEVELERS), default="per_unit")
    args = parser.parse_args()
    rendered = load_units(args.dir)
    starts = unit_starts(rendered)
    rate = rendered[0].audio.sample_rate
    print(*[_unit_line(i, start / rate, item) for i, (start, item) in enumerate(zip(starts, rendered))], sep="\n")
    boundaries = measure_boundaries(leveled_units(rendered, args.leveling), starts, PyinPitchTracker())
    print("\n경계별 변화", *[_boundary_line(boundary) for boundary in boundaries], sep="\n")


if __name__ == "__main__":
    main()

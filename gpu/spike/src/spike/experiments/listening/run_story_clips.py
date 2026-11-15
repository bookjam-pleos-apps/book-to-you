"""저장한 단위로 섞인 듣기 파일과 정답표를 GPU 없이 만들고, 지목한 시각을 클립으로 찾는다.

만들기: uv run --group dev python -m spike.experiments.listening.run_story_clips --dir outputs/story_passage --speaker s1b --unheard-from-unit 12
찾기: uv run --group dev python -m spike.experiments.listening.run_story_clips --dir outputs/story_passage --marks 1:32 2:07

만드는 쪽 출력에는 클립 순서를 적지 않는다. 듣는 사람이 조건을 알면 시험이 무의미해진다.
"""
import argparse
from dataclasses import asdict
from pathlib import Path
from random import Random

from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.clone.layout import Condition
from spike.listening.listening_plan import (
    PlacedClip,
    boundary_clips,
    clip_at,
    control_clips,
    listening_track,
    near_clip_change,
    place_clips,
    seconds_of_mark,
    shuffled,
    speech_spans,
)
from spike.listening.listening_store import heard_story, listening_folder, load_key, reference_lead, refuse_rebuild, save_listening, starts_with_quote
from spike.render.story_render import RenderedSentence, unit_starts
from spike.render.story_store import load_units

DEFAULT_SEED = 20261103


def _key_line(order: int, item: PlacedClip, units: list[RenderedSentence], unheard_from: int) -> dict:
    return {
        "order": order,
        **asdict(item),
        "startsWithQuote": starts_with_quote(units[item.clip.unit]),
        "unheard": item.clip.unit >= unheard_from,
    }


def build(out: Path, speaker: str, condition: Condition, unheard_from: int, seed: int) -> None:
    folder = listening_folder(out)
    refuse_rebuild(folder)
    units = load_units(out)
    story = heard_story(out, units)
    rate, rng = story.sample_rate, Random(seed)
    spans = speech_spans([item.audio for item in units], unit_starts(units))
    clips = [*boundary_clips(spans, rate), *control_clips(spans, rate, unheard_from, rng)]
    lead = reference_lead(speaker, condition)
    placed = place_clips(shuffled(clips, rng), len(lead), rate)
    lines = [_key_line(order, item, units, unheard_from) for order, item in enumerate(placed)]
    key = {"seed": seed, "sampleRate": rate, "unheardFromUnit": unheard_from, "clips": lines}
    save_listening(folder, listening_track(story, placed, lead), key)


def _mark_line(mark: str, key: dict, placed: list[PlacedClip]) -> str:
    rate = key["sampleRate"]
    sample = seconds_of_mark(mark) * rate
    found = clip_at(placed, sample, rate)
    if found is None:
        return f"{mark}  클립 밖"
    line = key["clips"][placed.index(found)]
    caution = "  확인 필요(클립 전환 근처)" if near_clip_change(placed, sample, rate) else ""
    return (
        f"{mark}  #{line['order']} {found.clip.kind} 단위 {found.clip.unit}"
        f"  따옴표 {line['startsWithQuote']}  미청취 {line['unheard']}"
        f"  클립 시작 {(sample - found.at) / rate:.1f}초 뒤{caution}"
    )


def lookup(out: Path, marks: list[str]) -> None:
    key, placed = load_key(listening_folder(out))
    print(*[_mark_line(mark, key, placed) for mark in marks], sep="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--speaker")
    add_condition_argument(parser)
    parser.add_argument("--unheard-from-unit", type=int)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--marks", nargs="+")
    args = parser.parse_args()
    if args.marks:
        lookup(args.dir, args.marks)
        return
    if args.speaker is None or args.unheard_from_unit is None:
        parser.error("듣기 파일을 만들려면 --speaker와 --unheard-from-unit이 필요합니다")
    build(args.dir, args.speaker, args.condition, args.unheard_from_unit, args.seed)


if __name__ == "__main__":
    main()

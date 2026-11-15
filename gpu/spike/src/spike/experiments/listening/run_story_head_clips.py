"""생성한 앞부분을 섞어 듣기 파일과 정답표를 GPU 없이 만들고, 지목한 시각으로 체이닝을 판정한다.

만들기: uv run --group dev python -m spike.experiments.listening.run_story_head_clips --dir outputs/story_passage --heads outputs/story_heads --speaker s1b
판정: uv run --group dev python -m spike.experiments.listening.run_story_head_clips --heads outputs/story_heads --marks 1:32 2:07

만드는 쪽 출력에는 클립 순서와 조건을 적지 않는다.
"""
import argparse
from dataclasses import asdict
from pathlib import Path
from random import Random

import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.listening.head_clips import (
    CHAIN,
    CURRENT,
    JUNCTION_UNIT,
    HeadMark,
    chain_verdict,
    flag_rate,
    head_clip_samples,
    pooled_clips,
    require_late_junctions,
)
from spike.render.trials.head_store import load_head_plan
from spike.clone.layout import Condition
from spike.listening.listening_plan import PlacedClip, clip_at, listening_track, near_clip_change, place_clips, seconds_of_mark, shuffled, speech_spans
from spike.listening.listening_store import heard_story, listening_folder, load_key, reference_lead, refuse_rebuild, save_listening, starts_with_quote
from spike.render.trials.run_store import load_run
from spike.render.trials.story_heads import head_jobs, pending_jobs
from spike.render.story_render import RenderedSentence, unit_starts
from spike.render.story_store import load_units

DEFAULT_SEED = 20261104


def _finished_run(heads: Path) -> list[dict]:
    """끝나지 않은 실행으로 만들면 조건별 클립 수가 달라 비교가 틀어진다."""
    records = load_run(heads)
    missing = pending_jobs(head_jobs(load_head_plan()), records)
    if missing:
        raise ValueError(f"아직 생성되지 않은 앞부분이 {len(missing)}개 있습니다")
    require_late_junctions(records)
    return records


def _clip_parts(records: list[dict], heads: Path, story: Audio, units: list[RenderedSentence]) -> list[np.ndarray]:
    starts = unit_starts(units)
    spans = speech_spans([item.audio for item in units], starts)
    return [
        head_clip_samples(story, spans[record["unit"] - 1], starts[record["unit"]], read_audio(heads / record["file"]))
        for record in records
    ]


def _label(record: dict, units: list[RenderedSentence]) -> dict:
    return {
        "condition": record["condition"],
        "seed": record["seed"],
        "startsWithQuote": starts_with_quote(units[record["unit"]]),
    }


def build(story_dir: Path, heads: Path, speaker: str, condition: Condition, seed: int) -> None:
    folder = listening_folder(heads)
    refuse_rebuild(folder)
    records = _finished_run(heads)
    units = load_units(story_dir)
    story = heard_story(story_dir, units)
    rate = story.sample_rate
    pool, clips = pooled_clips(_clip_parts(records, heads, story, units), [record["unit"] for record in records], rate)
    lead = reference_lead(speaker, condition)
    placed = place_clips(shuffled(clips, Random(seed)), len(lead), rate)
    labels = dict(zip(clips, records))
    lines = [{"order": order, **asdict(item), **_label(labels[item.clip], units)} for order, item in enumerate(placed)]
    save_listening(folder, listening_track(pool, placed, lead), {"seed": seed, "sampleRate": rate, "clips": lines})


def _unclear_marks(marks: list[str], placed: list[PlacedClip], rate: int) -> list[str]:
    def unclear(sample: int) -> bool:
        return clip_at(placed, sample, rate) is None or near_clip_change(placed, sample, rate)

    return [mark for mark in marks if unclear(seconds_of_mark(mark) * rate)]


def _group_line(name: str, marks: list[HeadMark]) -> str:
    rates = [f"{condition} {flag_rate([m for m in marks if m.condition == condition]):.0%}" for condition in (CURRENT, CHAIN)]
    return f"{name}: {', '.join(rates)}"


def _print_verdict(results: list[HeadMark], quote_units: set[int]) -> None:
    print(chain_verdict(results))
    print(_group_line(f"따옴표({JUNCTION_UNIT}번 제외)", [m for m in results if m.unit in quote_units and m.unit != JUNCTION_UNIT]))
    print(_group_line("따옴표 아님", [m for m in results if m.unit not in quote_units]))
    print(_group_line(f"{JUNCTION_UNIT}번", [m for m in results if m.unit == JUNCTION_UNIT]))


def judge(heads: Path, marks: list[str]) -> None:
    key, placed = load_key(listening_folder(heads))
    rate, lines = key["sampleRate"], key["clips"]
    unclear = _unclear_marks(marks, placed, rate)
    if unclear:
        print("어느 클립인지 알 수 없는 시각:", *unclear)
        print("판정을 내지 않습니다. 듣는 사람에게 확인한 뒤 클립 안쪽 시각으로 고쳐 다시 실행하세요.")
        return
    found = [clip_at(placed, seconds_of_mark(mark) * rate, rate) for mark in marks]
    flagged = {item.at for item in found if item is not None}
    results = [HeadMark(line["condition"], line["clip"]["unit"], line["seed"], line["at"] in flagged) for line in lines]
    _print_verdict(results, {line["clip"]["unit"] for line in lines if line["startsWithQuote"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--heads", type=Path, required=True)
    parser.add_argument("--dir", type=Path)
    parser.add_argument("--speaker")
    add_condition_argument(parser)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--marks", nargs="*")
    args = parser.parse_args()
    if args.marks is not None:
        judge(args.heads, args.marks)
        return
    if args.dir is None or args.speaker is None:
        parser.error("듣기 파일을 만들려면 --dir와 --speaker가 필요합니다")
    build(args.dir, args.heads, args.speaker, args.condition, args.seed)


if __name__ == "__main__":
    main()

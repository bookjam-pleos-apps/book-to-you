"""구간 쌍 듣기 파일을 GPU 없이 만든다. 쌍 시작 시각만 출력하고 어느 쪽이 체이닝인지는 key.json에만 적는다.

사용: uv run --group dev python -m spike.experiments.listening.run_story_pairs --baseline outputs/story_passage --dir outputs/story_chain --speaker s1b
"""
import argparse
import json
from dataclasses import asdict
from pathlib import Path

import numpy as np

from spike.sound.audio import Audio
from spike.clone.catalog import DATA_DIR
from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.listening.head_clips import CHAIN, CURRENT, pooled_clips
from spike.listening.listening_plan import SpeechSpan, clock, listening_track, place_clips, speech_spans
from spike.listening.listening_store import heard_story, pairs_folder, reference_lead, refuse_rebuild, save_listening
from spike.listening.pair_clips import PairSlot, boundary_samples, pair_slots, parse_pair_plan
from spike.render.story_render import unit_starts
from spike.render.story_store import load_units

PLAN_NAME = "story-pairs.json"


def _source(folder: Path) -> tuple[Audio, list[SpeechSpan]]:
    units = load_units(folder)
    story = heard_story(folder, units)
    return story, speech_spans([item.audio for item in units], unit_starts(units))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--speaker", required=True)
    add_condition_argument(parser)
    args = parser.parse_args()
    out = pairs_folder(args.dir)
    refuse_rebuild(out)
    plan = parse_pair_plan(json.loads((DATA_DIR / PLAN_NAME).read_text(encoding="utf-8")))
    sources = {CURRENT: _source(args.baseline), CHAIN: _source(args.dir)}
    rate = sources[CHAIN][0].sample_rate
    slots = pair_slots(plan, (CURRENT, CHAIN))

    def samples_of(slot: PairSlot) -> np.ndarray:
        story, spans = sources[slot.condition]
        return boundary_samples(story, spans, slot.unit, plan.side_sec)

    pool, clips = pooled_clips([samples_of(slot) for slot in slots], [slot.unit for slot in slots], rate)
    lead = reference_lead(args.speaker, args.condition)
    placed = place_clips(clips, len(lead), rate)
    lines = [{"order": order, **asdict(item), **asdict(slot)} for order, (item, slot) in enumerate(zip(placed, slots))]
    save_listening(out, listening_track(pool, placed, lead), {"seed": plan.seed, "sampleRate": rate, "clips": lines})
    print(*[f"쌍 {line['pair'] + 1}: {clock(line['at'] / rate)}" for line in lines[::2]], sep="\n")


if __name__ == "__main__":
    main()

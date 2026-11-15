"""저장한 단위를 GPU 없이 다시 잇는다. 음량 방식과 쉼 길이를 바꿔 들어 보는 용도다.

사용: uv run --group dev python -m spike.experiments.render.run_story_assemble --dir outputs/story_passage --leveling none --out outputs/story_passage/none.wav
"""
import argparse
from pathlib import Path

from spike.render.story_render import LEVELERS, stitch, with_pause
from spike.render.story_store import load_units, save_story


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--leveling", choices=sorted(LEVELERS), default="per_unit")
    parser.add_argument("--pause-ms", type=int)
    args = parser.parse_args()
    units = load_units(args.dir)
    paced = units if args.pause_ms is None else with_pause(units, args.pause_ms)
    story = stitch(paced, args.leveling)
    save_story(args.out, story)
    print(f"단위 {len(paced)}개, 길이 {story.duration_sec:.0f}초 → {args.out}")


if __name__ == "__main__":
    main()

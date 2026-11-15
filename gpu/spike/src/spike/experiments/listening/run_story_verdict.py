"""구간 쌍 답과 체이닝 전체 청취의 지목으로 3단계 채택 여부를 판정한다. GPU 없이 돈다.

사용: uv run --group dev python -m spike.experiments.listening.run_story_verdict --dir outputs/story_chain \\
  --picks 앞앞뒤 뒤앞앞 앞뒤뒤 앞앞앞 뒤뒤앞 앞앞뒤 --marks 1:32 5:07 --repeats 0 --playable yes

--picks는 쌍마다 이어 읽기, 덜 단조로움, 더 본인 같음 순서로 앞/뒤를 적는다. 지목이 없으면 --marks를 비운다.
"""
import argparse
from collections.abc import Sequence
from pathlib import Path

from spike.listening.head_clips import CHAIN
from spike.listening.listening_plan import seconds_of_mark
from spike.listening.listening_store import load_key, pairs_folder
from spike.render.story_chain import near_decoder_junction
from spike.render.story_render import RenderedSentence, unit_starts
from spike.render.story_store import load_units
from spike.listening.story_verdict import RenderValidity, marked_boundary, picks_of_chain, story_verdict


def _chain_is_front(render: Path) -> list[bool]:
    key, _ = load_key(pairs_folder(render))
    return [first["condition"] == CHAIN for first in key["clips"][::2]]


def _mark_line(mark: str, units: Sequence[RenderedSentence], starts_sec: Sequence[float]) -> str:
    sec = seconds_of_mark(mark)
    boundary = marked_boundary(sec, starts_sec)
    where = "경계 밖" if boundary is None else f"경계 {boundary}번 (시작 후 {sec - starts_sec[boundary]:+.1f}초)"
    return f"{mark}  {where}{'  접합부 근처' if near_decoder_junction(sec, units, starts_sec) else ''}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--picks", nargs="+", required=True)
    parser.add_argument("--marks", nargs="*", default=[])
    parser.add_argument("--repeats", type=int, required=True)
    parser.add_argument("--playable", choices=["yes", "no"], required=True)
    args = parser.parse_args()
    units = load_units(args.dir)
    validity = RenderValidity(sum(item.context_used for item in units), sum(not item.passed for item in units))
    print(validity)
    if not validity.valid:
        print("렌더 유효성 미달이라 판정하지 않습니다.")
        return
    rate = units[0].audio.sample_rate
    starts_sec = [start / rate for start in unit_starts(units)]
    print(*[_mark_line(mark, units, starts_sec) for mark in args.marks], sep="\n")
    boundaries = {marked_boundary(seconds_of_mark(mark), starts_sec) for mark in args.marks} - {None}
    continuity, monotony, likeness = picks_of_chain(args.picks, _chain_is_front(args.dir))
    print(story_verdict(continuity, monotony, likeness, boundaries, args.repeats, args.playable == "yes"))


if __name__ == "__main__":
    main()

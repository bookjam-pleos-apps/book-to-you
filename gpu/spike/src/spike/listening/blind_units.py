"""여러 렌더의 같은 단위를 섞어 번호만 붙인 클립으로 내는 순서. 사람이 어느 조건인지 모르고 듣게 한다. 순수 로직."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from random import Random


@dataclass(frozen=True)
class BlindClip:
    number: int
    source: str
    unit: int


def blind_clips(source_units: Mapping[str, Sequence[int]], seed: int) -> list[BlindClip]:
    """렌더마다 고른 단위를 한 번씩 넣고 섞는다. 같은 seed면 같은 순서다. 번호는 1부터다."""
    pairs = [(source, unit) for source in sorted(source_units) for unit in source_units[source]]
    Random(seed).shuffle(pairs)
    return [BlindClip(number, source, unit) for number, (source, unit) in enumerate(pairs, start=1)]


def clip_name(clip: BlindClip, total: int) -> str:
    return f"{clip.number:0{len(str(total))}d}.wav"

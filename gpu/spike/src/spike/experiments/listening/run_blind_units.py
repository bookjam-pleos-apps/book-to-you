"""렌더 폴더 여러 개의 단위를 섞어 블라인드 청취 폴더를 만든다. 정답은 private/key.json에만 쓴다.

음량은 단위마다 맞춘다(story.wav와 같은 per_unit). 크기 차이로 조건이 드러나지 않게 하기 위해서다.
사용: python -m spike.experiments.listening.run_blind_units --out outputs/exp/blind --seed 7 --source repeat=outputs/exp/redhood_repeat_1234 --source word=...
"""
import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.sound.audio_level import leveled
from spike.listening.blind_units import blind_clips, clip_name
from spike.render.story_store import load_unit_texts, save_unit_audio, unit_path

KEY_NAME = "private/key.json"


def _sources(pairs: Sequence[str]) -> dict[str, Path]:
    return {label: Path(path) for label, path in (pair.split("=", 1) for pair in pairs)}


def build(out: Path, sources: dict[str, Path], seed: int, units: list[int] | None = None) -> int:
    """units를 주면 모든 렌더에서 그 단위만 넣는다(렌더끼리 같은 대사를 짝지어 들을 때)."""
    if (out / KEY_NAME).exists():
        raise FileExistsError(f"이미 만든 청취 폴더는 덮어쓰지 않습니다: {out}")
    texts = {label: load_unit_texts(path) for label, path in sources.items()}
    clips = blind_clips({label: units if units is not None else range(len(lines)) for label, lines in texts.items()}, seed)

    def write(clip) -> dict:
        audio = read_audio(unit_path(sources[clip.source], clip.unit))
        save_unit_audio(out / clip_name(clip, len(clips)), Audio(leveled(audio.samples), audio.sample_rate))
        return {"clip": clip.number, "source": clip.source, "dir": str(sources[clip.source]), "unit": clip.unit, "text": texts[clip.source][clip.unit]}

    key = [write(clip) for clip in clips]
    (out / KEY_NAME).parent.mkdir(parents=True, exist_ok=True)
    (out / KEY_NAME).write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    return len(key)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--source", action="append", required=True, help="이름=렌더 폴더. 이름은 정답표에만 남는다")
    parser.add_argument("--units", help="넣을 단위 번호(쉼표로 구분). 주지 않으면 모든 단위")
    args = parser.parse_args()
    units = None if args.units is None else [int(unit) for unit in args.units.split(",")]
    print(f"클립 {build(args.out, _sources(args.source), args.seed, units)}개: {args.out}")


if __name__ == "__main__":
    main()

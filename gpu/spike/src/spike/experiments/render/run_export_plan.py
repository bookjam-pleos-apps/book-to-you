"""확정본을 run_story --plan-from이 읽는 계획 폴더로 내보낸다. --plan-from은 직접 호출 엔진 전용이다.

--limits를 주면 생성 단위로 묶고, 주지 않으면 문장 단위 그대로 내보낸다. 허용 길이는 음질 측정 값을 쓴다.
--read-as soft=calm은 확정본의 표시는 두고 이번 렌더만 다른 참조로 읽는다. 검증되지 않은 style이 있으면 이 옵션이 필수다.
사용: uv run --group dev python -m spike.experiments.render.run_export_plan --story ../../content/stories/frog.json --out outputs/plans/frog
"""
import argparse
from collections.abc import Sequence
from pathlib import Path

from spike.clone.cli_output import abort_if, print_list
from spike.story.story_document import load_confirmed_story
from spike.story.story_plan import StorySentence
from spike.render.story_store import save_plan
from spike.story.story_draft import STYLES
from spike.story.story_units import (
    group_units,
    load_unit_limits,
    oversize_sentences,
    read_as_conflicts,
    read_as_problems,
    read_styles_as,
    short_units,
    unverified_styles,
)
from spike.story.unit_openings import SHOUT_WARNING, shouting_openings


def _grouped(sentences: Sequence[StorySentence], limits_path: Path) -> list[StorySentence]:
    limits = load_unit_limits(limits_path)
    abort_if(oversize_sentences(sentences, limits), "허용 길이를 넘는 문장이 있습니다. 원고를 고치세요")
    units = group_units(sentences, limits)
    print_list("짧은 단위 (음색이 흔들릴 수 있습니다)", short_units(units, limits))
    return units


def _parse_read_as(pairs: Sequence[str]) -> dict[str, str]:
    parts = [pair.split("=") for pair in pairs]
    abort_if([f"--read-as는 soft=calm 형식입니다: {pair}" for pair, part in zip(pairs, parts) if len(part) != 2 or not all(part)], "잘못된 옵션:")
    abort_if(read_as_conflicts([(part[0], part[1]) for part in parts]), "잘못된 옵션:")
    mapping = {part[0]: part[1] for part in parts}
    abort_if(read_as_problems(mapping, STYLES), "잘못된 옵션:")
    return mapping


def _refuse_unverified(sentences: Sequence[StorySentence], mapping: dict[str, str]) -> None:
    abort_if(
        [f"{style}: 녹음이 검증되지 않았습니다. --read-as {style}=calm을 주세요" for style in unverified_styles(sentences, mapping)],
        "렌더 계획을 쓰지 않습니다:",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--story", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--limits", type=Path)
    parser.add_argument("--read-as", action="append", default=[], metavar="STYLE=STYLE")
    args = parser.parse_args()
    mapping = _parse_read_as(args.read_as)
    confirmed = load_confirmed_story(args.story)
    _refuse_unverified(confirmed, mapping)
    sentences = read_styles_as(confirmed, mapping)
    units = sentences if args.limits is None else _grouped(sentences, args.limits)
    print_list(SHOUT_WARNING, shouting_openings(units))
    save_plan(args.out, units)
    print(f"{len(sentences)}문장을 {len(units)}단위 계획으로 썼습니다 → {args.out}")


if __name__ == "__main__":
    main()

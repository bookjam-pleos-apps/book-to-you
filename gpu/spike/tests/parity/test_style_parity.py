import re
from pathlib import Path

from spike.story.story_draft import STYLES

SHARED_VOCAB = Path(__file__).resolve().parents[4] / "packages/shared/src/vocab.ts"


def _shared_styles() -> tuple[str, ...]:
    declared = re.search(r"export const STYLES = \[([^\]]*)\] as const;", SHARED_VOCAB.read_text(encoding="utf-8"))
    assert declared is not None, f"{SHARED_VOCAB}에서 STYLES 선언을 찾지 못했습니다"
    return tuple(re.findall(r'"(\w+)"', declared.group(1)))


def test_draft_styles_match_the_shared_vocabulary():
    assert STYLES == _shared_styles()

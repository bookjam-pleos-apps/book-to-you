import re
import unittest

from helpers import SCRIPTS

from guyeon_common import STYLES

SHARED_VOCAB = SCRIPTS.parents[2] / "packages/shared/src/vocab.ts"


def shared_styles() -> tuple[str, ...]:
    declared = re.search(r"export const STYLES = \[([^\]]*)\] as const;", SHARED_VOCAB.read_text(encoding="utf-8"))
    if declared is None:
        raise AssertionError(f"{SHARED_VOCAB}에서 STYLES 선언을 찾지 못했습니다")
    return tuple(re.findall(r'"(\w+)"', declared.group(1)))


class SharedVocabulary(unittest.TestCase):
    def test_cast_styles_match_the_shared_vocabulary(self) -> None:
        self.assertEqual(STYLES, shared_styles())

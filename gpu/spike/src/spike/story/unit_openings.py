"""생성 단위가 짧은 외침으로 시작하는지 찾는다.

ICL은 참조 녹음 끝에서 이어 생성한다. 단위 첫머리가 짧은 외침이면 첫 1~3초가 본인 목소리가 아니라
기본 TTS 목소리가 된다(Qwen3-TTS #80). 청취에서 "왕자야!", "영차, 영차!", "여보!"가 그랬고
seed를 바꿔도 고쳐지지 않았다. 외침을 쉼표로 바꾸거나 문장 가운데로 옮기면 고쳐졌다.
"""
import re
from collections.abc import Sequence

from spike.clone.budget import count_syllables
from spike.story.story_plan import StorySentence

# 문제였던 외침은 2~5음절이었다. 외침을 가운데로 옮긴 "빨간 모자가 영차, 영차!"(9음절)는 괜찮았다.
OPENING_SHOUT_MAX_SYLLABLES = 8
_FIRST_CLAUSE = re.compile(r"[\s“\"‘']*([^.?!…？！]*)([.?!…？！])")
_EXCLAMATIONS = ("!", "！")
# excited 녹음 대본은 외침으로 가득해("우와, 저것 좀 봐!") 외침으로 이어 생성해도 무너지지 않았다.
# 어부의 "흥!", "암!"으로 시작하는 excited 단위 5개는 전체 청취에서 지목되지 않았다.
# 블라인드 시험은 아니다. excited 첫머리 붕괴가 보고되면 이 예외부터 다시 본다.
SHOUTING_STYLES = ("excited",)
SHOUT_WARNING = "첫머리가 짧은 외침인 단위 (첫 1~3초가 다른 목소리가 될 수 있습니다. 외침을 쉼표로 바꾸거나 문장 가운데로 옮기세요)"


def opening_shout(text: str) -> str | None:
    """첫 문장 부호가 느낌표이고 그 앞이 짧으면 그 외침을 돌려준다."""
    match = _FIRST_CLAUSE.match(text)
    if match is None or match.group(2) not in _EXCLAMATIONS:
        return None
    clause = match.group(1).strip()
    return clause if 0 < count_syllables(clause) <= OPENING_SHOUT_MAX_SYLLABLES else None


def shouting_openings(units: Sequence[StorySentence]) -> list[str]:
    return [
        f"{unit.style}: {unit.text[:40]}"
        for unit in units
        if unit.style not in SHOUTING_STYLES and opening_shout(unit.text) is not None
    ]

"""초안의 구연 규칙 위반을 경고한다. 결과를 자동으로 바꾸지는 않는다.

입력은 decision_candidates가 받는 초안이다(sentences의 text, speaker, suggestedStyle, emotion, 최상위 cast).
"""

import re
from itertools import groupby

from guyeon_common import NARRATOR, audible, syllables

# 45음절을 넘으면 문장 분할을 제안한다.
MAX_SYLLABLES = 45
# 인물 대사의 절반 이상이 soft이면 경고한다.
SOFT_SHARE = 0.5
# 대사 끝 동물 울음은 masteraway에서만 청취 확인됐으므로 다른 이야기는 경고한다.
# 같은 울음을 되풀이한 말(멍멍멍멍)도 잡는다. 한 음절 울음(꿀)은 낱말과 헷갈려 두 음절 이상만 둔다.
ANIMAL_SOUNDS = (
    "멍멍", "왈왈", "컹컹", "야옹", "냐옹", "찍찍", "꽥꽥", "꿀꿀", "짹짹", "개굴", "음매", "매애", "삐약", "어흥", "꼬끼오", "히힝", "부엉",
)
SPOKEN = re.compile("“([^”]*)”")
EDGE_MARKS = " \t\n.,!?~…·"


def _speaker(line: dict) -> str:
    return line.get("speaker") or NARRATOR


def _warning(kind: str, lines: list[dict], note: str) -> dict:
    return {"kind": kind, "from": lines[0]["index"], "to": lines[-1]["index"], "text": lines[0]["text"][:40], "note": note}


def long_sentences(lines: list[dict]) -> list[dict]:
    return [
        _warning("긴 문장", [line], f"{syllables(line['text'])}음절, {MAX_SYLLABLES}음절이 넘으면 나누자고 제안한다")
        for line in lines
        if syllables(line["text"]) > MAX_SYLLABLES
    ]


def _same_sound_pair(left: dict, right: dict) -> bool:
    speakers = (_speaker(left), _speaker(right))
    return NARRATOR not in speakers and speakers[0] != speakers[1] and audible(left["suggestedStyle"]) == audible(right["suggestedStyle"])


def same_sound_partners(lines: list[dict]) -> list[dict]:
    return [
        _warning("같은 소리로 마주 말함", [left, right], f"{_speaker(left)}와 {_speaker(right)}가 모두 {audible(left['suggestedStyle'])}로 읽힌다")
        for left, right in zip(lines, lines[1:])
        if _same_sound_pair(left, right)
    ]


def _soft_speaker_warning(name: str, own: list[dict]) -> list[dict]:
    soft = [line for line in own if audible(line["suggestedStyle"]) == "soft"]
    if not soft or len(soft) < len(own) * SOFT_SHARE:
        return []
    return [_warning("대사 많은 인물에 soft", soft, f"{name}의 대사 {len(own)}개 중 {len(soft)}개가 soft다")]


def soft_on_speakers(lines: list[dict], cast: list[dict]) -> list[dict]:
    """cast에서 soft로 정한 인물(기운 없는 할머니)은 SKILL이 허용하므로 뺀다."""
    allowed = {item.get("name") for item in cast if isinstance(item, dict) and item.get("style") == "soft"}
    spoken = sorted((line for line in lines if _speaker(line) not in (NARRATOR, *allowed)), key=_speaker)
    return [warning for name, own in groupby(spoken, key=_speaker) for warning in _soft_speaker_warning(name, list(own))]


def _is_sound(word: str) -> bool:
    return any(word == sound * (len(word) // len(sound)) for sound in ANIMAL_SOUNDS if len(word) >= len(sound))


def _ends_with_sound(spoken: str) -> bool:
    words = spoken.strip(EDGE_MARKS).split()
    return len(words) > 1 and _is_sound(words[-1].strip(EDGE_MARKS)) and not all(_is_sound(word.strip(EDGE_MARKS)) for word in words)


def animal_tails(lines: list[dict]) -> list[dict]:
    return [
        _warning("대사 끝 울음 말버릇", [line], "렌더 뒤 청취로 확인(masteraway 통과)")
        for line in lines
        if any(_ends_with_sound(spoken) for spoken in SPOKEN.findall(line["text"]))
    ]


def rule_warnings(document: dict) -> list[dict]:
    lines = document["sentences"]
    return [
        *long_sentences(lines),
        *same_sound_partners(lines),
        *soft_on_speakers(lines, document.get("cast", [])),
        *animal_tails(lines),
    ]

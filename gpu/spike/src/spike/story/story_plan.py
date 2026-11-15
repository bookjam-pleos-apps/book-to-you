"""동화 본문을 문장과 감정, 쉼 계획으로 바꾼다. 외부 라이브러리를 쓰지 않는 순수 로직이다."""
import re
from dataclasses import dataclass, replace
from functools import reduce
from typing import Literal

SENTENCE_END = re.compile(r"(?<=[.!?…”])\s+")
HANGUL = re.compile(r"[가-힣]")
DIALOGUE_TAILS = ("합니다", "하였습니다", "하고", "하면서", "하는", "이렇게", "하였", "하니")
MIN_PASSAGE_SYLLABLES = 30
MAX_PASSAGE_SYLLABLES = 180
SENTENCE_PAUSE_MS = 450
PARAGRAPH_PAUSE_MS = 900
EXCITED_MARKS = ("!", "?")


TailKind = Literal["repeat", "word"]


@dataclass(frozen=True)
class SpokenTail:
    """단위 뒤에 붙여 읽히고 잘라 버리는 꼬리. kind가 자르는 방법을 정한다(repeat_tail 모듈 참고)."""
    text: str
    kind: TailKind


@dataclass(frozen=True)
class StorySentence:
    """tail은 렌더 때만 쓰는 값이라 계획 파일(sentence_line)에 남기지 않는다."""
    text: str
    style: str
    pause_after_ms: int
    tail: SpokenTail | None = None


def sentence_line(sentence: StorySentence) -> dict:
    return {"text": sentence.text, "style": sentence.style, "pauseAfterMs": sentence.pause_after_ms}


def sentence_from_line(line: dict) -> StorySentence:
    return StorySentence(line["text"], line["style"], line["pauseAfterMs"])


def split_sentences(paragraph: str) -> list[str]:
    return [part.strip() for part in SENTENCE_END.split(paragraph) if part.strip()]


def rule_style(sentence: str) -> str:
    """대사 중 느낌표나 물음표가 있는 문장만 신남으로 둔다. 잠자리 동화라 나머지는 차분하게 읽는다."""
    is_dialogue = sentence.startswith("“") or sentence.endswith("”")
    if is_dialogue and any(mark in sentence for mark in EXCITED_MARKS):
        return "excited"
    return "calm"


def _plan_paragraph(paragraph: str) -> list[StorySentence]:
    sentences = split_sentences(paragraph)
    return [
        StorySentence(
            sentence,
            rule_style(sentence),
            PARAGRAPH_PAUSE_MS if index == len(sentences) - 1 else SENTENCE_PAUSE_MS,
        )
        for index, sentence in enumerate(sentences)
    ]


def _paragraphs(body: str) -> list[str]:
    return [paragraph.strip() for paragraph in body.split("\n\n") if paragraph.strip()]


def plan_story(body: str) -> list[StorySentence]:
    return [sentence for paragraph in _paragraphs(body) for sentence in _plan_paragraph(paragraph)]


def _syllables(text: str) -> int:
    return len(HANGUL.findall(text))


def _continues(previous: str, following: str) -> bool:
    """쉼표로 끝난 구절이나 '합니다' 같은 대사 꼬리는 빈 줄로 나뉘어도 한 문장이다. 너무 짧은 단위도 음색이 흔들려 묶는다."""
    if _syllables(previous) + _syllables(following) > MAX_PASSAGE_SYLLABLES:
        return False
    return (
        previous.endswith(",")
        or following.startswith(DIALOGUE_TAILS)
        or _syllables(previous) < MIN_PASSAGE_SYLLABLES
    )


def merge_passages(paragraphs: list[str]) -> list[str]:
    def absorb(passages: list[str], paragraph: str) -> list[str]:
        if passages and _continues(passages[-1], paragraph):
            return [*passages[:-1], f"{passages[-1]} {paragraph}"]
        return [*passages, paragraph]

    return reduce(absorb, paragraphs, [])


def plan_units(body: str, unit: str, single_style: str | None) -> list[StorySentence]:
    """생성 단위 비교용 계획. 문단보다 큰 단위는 문장별 감정을 표현할 수 없어 single_style이 필요하다."""
    plans = {
        "sentence": lambda: plan_story(body),
        "paragraph": lambda: [StorySentence(p, "calm", PARAGRAPH_PAUSE_MS) for p in _paragraphs(body)],
        "passage": lambda: [StorySentence(p, "calm", PARAGRAPH_PAUSE_MS) for p in merge_passages(_paragraphs(body))],
        "whole": lambda: [StorySentence(" ".join(_paragraphs(body)), "calm", 0)],
    }
    planned = plans[unit]()
    if single_style is None:
        return planned
    return [replace(item, style=single_style) for item in planned]


def excerpt(units: list[StorySentence], first: int, count: int | None) -> list[StorySentence]:
    """전체 계획을 자른다. 발췌 본문을 따로 계획하면 묶음 경계가 전체 렌더와 달라져 비교가 무의미해진다."""
    last = len(units) if count is None else first + count
    if first < 0 or last > len(units) or first >= last:
        raise ValueError(f"단위 {len(units)}개에서 {first}~{last} 구간을 고를 수 없습니다")
    return units[first:last]

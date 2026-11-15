"""동화 본문을 태깅할 문장으로 나눈다. 인용 안에서는 끊지 않고, 짝이 안 맞는 따옴표는 추측하지 않고 거부한다."""
import re
from dataclasses import dataclass, replace
from functools import reduce
from itertools import accumulate, cycle

from spike.story.story_plan import PARAGRAPH_PAUSE_MS, SENTENCE_PAUSE_MS

PARAGRAPH_GAP = re.compile(r"\n\s*\n")
WORD_GAP = re.compile(r"\s+")
SINGLE_BREAK = re.compile(r"(?<=\S)[ \t]*\n[ \t]*(?=\S)")
STRAIGHT_QUOTE = re.compile('"')
TERMINATORS = frozenset(".!?…")
QUOTE_CLOSERS = {"“": "”", "‘": "’", '"': '"', "'": "'"}
CLOSERS = frozenset(QUOTE_CLOSERS.values())
WORD_LETTER = re.compile(r"[가-힣A-Za-z]")
# story_plan의 옛 분할과 꼬리 목록은 story-heads와 story-pairs의 번호를 지키려고 그대로 둔다. 새 원고는 이 모듈로 나눈다.
# `하는 수 없이`나 `이렇게 토토는`이 앞 대사에 붙지 않도록 시작 낱말이 정확히 같을 때만 꼬리로 본다.
DIALOGUE_TAIL_WORDS = frozenset(
    {"합니다.", "하였습니다.", "하셨습니다.", "하고", "하고,", "하고는", "하면서", "하면서,", "하니", "하니까", "하니까,", "하는,"}
)


@dataclass(frozen=True)
class SentenceSlot:
    text: str
    pause_after_ms: int


def spare_closers(paragraph: str) -> list[int]:
    """spare[i]는 i번째 글자 뒤에 남은 `’` 수에서 `‘` 수를 뺀 값이다."""
    steps = [(char == "’") - (char == "‘") for char in paragraph]
    return list(accumulate(reversed(steps), initial=0))[::-1][1:]


def is_apostrophe(open_quotes: tuple[str, ...], before: str, char: str, after: str, spare: int) -> bool:
    """글자 사이의 `’`는 `‘`가 열려 있지 않거나, 열린 `‘`를 모두 닫을 `’`가 뒤에 남을 때 아포스트로피다.
    `‘rock’n’roll이야’`는 끝의 `’`가 닫고, `‘엄마’가`는 뒤에 남은 `’`가 없어 여기서 닫는다.
    """
    if char != "’" or not (WORD_LETTER.fullmatch(before) and WORD_LETTER.fullmatch(after)):
        return False
    return "’" not in open_quotes or open_quotes.count("’") <= spare


def _after_char(open_quotes: tuple[str, ...], around: tuple[str, str, str, int]) -> tuple[str, ...]:
    before, char, after, spare = around
    if is_apostrophe(open_quotes, before, char, after, spare):
        return open_quotes
    if open_quotes and char == open_quotes[-1]:
        return open_quotes[:-1]
    if char in QUOTE_CLOSERS:
        return (*open_quotes, QUOTE_CLOSERS[char])
    if char in CLOSERS:
        raise ValueError(f"여는 따옴표 없이 {char}가 나왔습니다")
    return open_quotes


def _quote_states(paragraph: str) -> list[tuple[str, ...]]:
    """states[i]는 앞의 i글자를 읽은 뒤 열려 있는 따옴표다."""
    around = zip(f" {paragraph}", paragraph, f"{paragraph[1:]} ", spare_closers(paragraph))
    try:
        states = list(accumulate(around, _after_char, initial=()))
    except ValueError as error:
        raise ValueError(f"{error}: {paragraph}") from error
    if states[-1]:
        raise ValueError(f"닫히지 않은 따옴표가 있습니다: {paragraph}")
    return states


def _ends_sentence(paragraph: str, gap: re.Match[str], states: list[tuple[str, ...]]) -> bool:
    if states[gap.start()]:
        return False
    before, after = paragraph[gap.start() - 1], paragraph[gap.end()]
    return before in TERMINATORS or (before in CLOSERS and after in QUOTE_CLOSERS) or _is_marked_break(gap, before, after)


def _is_marked_break(gap: re.Match[str], before: str, after: str) -> bool:
    """대사와 서술의 분위기가 다를 때 복원본의 줄바꿈 한 번으로 나눈다. 빈 줄과 달리 문단 쉼이 생기지 않는다."""
    return "\n" in gap.group() and (before in CLOSERS or after in QUOTE_CLOSERS)


def split_paragraph(paragraph: str) -> list[str]:
    states = _quote_states(paragraph)
    cuts = [gap for gap in WORD_GAP.finditer(paragraph) if _ends_sentence(paragraph, gap, states)]
    starts = [0, *(cut.end() for cut in cuts)]
    ends = [*(cut.start() for cut in cuts), len(paragraph)]
    return [" ".join(paragraph[start:end].split()) for start, end in zip(starts, ends)]


def _paragraph_slots(paragraph: str) -> list[SentenceSlot]:
    sentences = split_paragraph(paragraph)
    return [
        SentenceSlot(sentence, PARAGRAPH_PAUSE_MS if index == len(sentences) - 1 else SENTENCE_PAUSE_MS)
        for index, sentence in enumerate(sentences)
    ]


def _is_dialogue_tail(previous: str, following: str) -> bool:
    return previous[-1] in CLOSERS and following.split()[0] in DIALOGUE_TAIL_WORDS


def _is_lead_in(sentence: str) -> bool:
    return sentence.endswith(",")


def _continues(previous: str, following: str) -> bool:
    """쉼표 도입부는 대사와 잇지 않는다. 이으면 `“가” 하고 토끼는, “나” 합니다`처럼 두 화자가 한 style로 묶인다."""
    joins_narration = _is_lead_in(previous) and following[0] not in QUOTE_CLOSERS
    return joins_narration or _is_dialogue_tail(previous, following)


def _absorb(slots: list[SentenceSlot], slot: SentenceSlot) -> list[SentenceSlot]:
    """앞 문단의 쉼은 사라진다. 이어지는 말 사이에 문단 쉼을 두면 낭독이 끊긴다."""
    if slots and _continues(slots[-1].text, slot.text):
        return [*slots[:-1], replace(slot, text=f"{slots[-1].text} {slot.text}")]
    return [*slots, slot]


def _settled_pause(slot: SentenceSlot) -> SentenceSlot:
    return replace(slot, pause_after_ms=SENTENCE_PAUSE_MS) if _is_lead_in(slot.text) else slot


def split_story(body: str) -> list[SentenceSlot]:
    paragraphs = [paragraph.strip() for paragraph in PARAGRAPH_GAP.split(body) if paragraph.strip()]
    slots = [slot for paragraph in paragraphs for slot in _paragraph_slots(paragraph)]
    return [_settled_pause(slot) for slot in reduce(_absorb, slots, [])]


def stray_line_breaks(body: str) -> int:
    """문장 끝도 따옴표 옆도 아닌 줄바꿈을 센다. 접힌 원고의 신호이고, 그런 원고는 따옴표 옆에서 잘못 나뉜다."""
    breaks = SINGLE_BREAK.finditer(body)
    return sum(
        body[found.start() - 1] not in TERMINATORS | CLOSERS and body[found.end()] not in QUOTE_CLOSERS for found in breaks
    )


def has_quotes(body: str) -> bool:
    return any(char in QUOTE_CLOSERS for char in body)


def body_warnings(body: str) -> list[str]:
    stray = stray_line_breaks(body)
    return [
        *([] if has_quotes(body) else ["따옴표가 없어 대사와 꼬리를 나누지 못합니다. 대사를 복원한 원고를 넣으세요."]),
        *(
            [f"접힌 줄로 보이는 줄바꿈이 {stray}곳 있습니다. 따옴표 옆에서 문장이 잘못 나뉠 수 있으니 줄을 펴세요."]
            if stray
            else []
        ),
    ]


def curly_quotes(text: str) -> str:
    """판단 때만 쓴다. 대본은 원문 그대로 둔다."""
    marks = cycle("“”")
    return STRAIGHT_QUOTE.sub(lambda _: next(marks), text)

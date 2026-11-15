"""태깅 초안과 사람 검수. 초안은 `style` 키가 없어 렌더 계획으로 읽히지 않는다. 확정본은 검수를 마친 뒤에만 만든다."""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field

from spike.clone.budget import count_syllables
from spike.story.story_plan import StorySentence, rule_style
from spike.story.story_split import CLOSERS, QUOTE_CLOSERS, SentenceSlot, curly_quotes

# deep과 child는 인물 녹음(cast.style)으로만 정한다. 문장 태거는 고르지 않으므로 태깅 후보와 확정 라벨을 나눈다.
TAGGED_STYLES = ("calm", "excited", "soft")
STYLES = (*TAGGED_STYLES, "deep", "child")
LONG_NARRATION_SYLLABLES = 15
LONG_TAIL_NOTE = "대사 뒤 서술이 길어 대사의 감정으로 읽힐 수 있습니다"
LONG_LEAD_NOTE = "대사 앞 서술이 길어 대사의 감정으로 읽힐 수 있습니다"


@dataclass(frozen=True)
class Suggestion:
    style: str
    probabilities: Mapping[str, float] = field(default_factory=dict)


Tagger = Callable[[Sequence[SentenceSlot], int], Suggestion]


@dataclass(frozen=True)
class DraftSentence:
    text: str
    pause_after_ms: int
    suggestion: Suggestion
    notes: tuple[str, ...] = ()
    confirmed_style: str | None = None
    speaker: str | None = None
    emotion: str | None = None


def suggest_by_rule(slots: Sequence[SentenceSlot], index: int) -> Suggestion:
    return Suggestion(rule_style(curly_quotes(slots[index].text)))


def _tail_after_quote(text: str) -> str:
    last_closer = max((text.rfind(closer) for closer in CLOSERS), default=-1)
    return text[last_closer + 1 :] if last_closer >= 0 else ""


def _lead_before_quote(text: str) -> str:
    openings = [text.find(opener) for opener in QUOTE_CLOSERS if opener in text]
    return text[: min(openings)] if openings else ""


def narration_notes(text: str) -> tuple[str, ...]:
    narration = ((_tail_after_quote(text), LONG_TAIL_NOTE), (_lead_before_quote(text), LONG_LEAD_NOTE))
    return tuple(note for part, note in narration if count_syllables(part) > LONG_NARRATION_SYLLABLES)


def build_draft(slots: Sequence[SentenceSlot], tag: Tagger) -> list[DraftSentence]:
    return [
        DraftSentence(slot.text, slot.pause_after_ms, tag(slots, index), narration_notes(slot.text))
        for index, slot in enumerate(slots)
    ]


def _annotation(sentence: DraftSentence) -> dict:
    return {key: value for key, value in (("speaker", sentence.speaker), ("emotion", sentence.emotion)) if value is not None}


def draft_line(index: int, sentence: DraftSentence) -> dict:
    return {
        "index": index,
        "text": sentence.text,
        "pauseMs": sentence.pause_after_ms,
        "suggestedStyle": sentence.suggestion.style,
        "probabilities": dict(sentence.suggestion.probabilities),
        "notes": list(sentence.notes),
        "confirmedStyle": sentence.confirmed_style,
        **_annotation(sentence),
    }


def parse_draft_line(line: dict) -> DraftSentence:
    return DraftSentence(
        text=line["text"],
        pause_after_ms=line["pauseMs"],
        suggestion=Suggestion(line["suggestedStyle"], line["probabilities"]),
        notes=tuple(line["notes"]),
        confirmed_style=line["confirmedStyle"],
        speaker=line.get("speaker"),
        emotion=line.get("emotion"),
    )


def _line_problems(index: int, sentence: DraftSentence, slot: SentenceSlot) -> list[str]:
    checks = (
        (sentence.text != slot.text, f"{index}번: 대본이 원고와 다릅니다. 원고를 고치고 초안을 다시 만드세요"),
        (sentence.pause_after_ms != slot.pause_after_ms, f"{index}번: 쉼이 원고의 계획과 다릅니다"),
        (sentence.confirmed_style is None, f"{index}번: 검수하지 않았습니다"),
        (
            sentence.confirmed_style not in (None, *STYLES),
            f"{index}번: 알 수 없는 감정입니다 ({sentence.confirmed_style})",
        ),
    )
    return [problem for failed, problem in checks if failed]


def confirmation_problems(draft: Sequence[DraftSentence], slots: Sequence[SentenceSlot]) -> list[str]:
    """글자가 하나라도 달라지면 QC의 기준 대본과 생성할 대본이 어긋나므로 원고와 대조한다."""
    if len(draft) != len(slots):
        return [f"문장 수가 원고와 다릅니다: 초안 {len(draft)}개, 원고 {len(slots)}개"]
    return [problem for index, (line, slot) in enumerate(zip(draft, slots)) for problem in _line_problems(index, line, slot)]


def _confirmed_sentence(line: DraftSentence) -> StorySentence:
    if line.confirmed_style is None:
        raise ValueError(f"검수하지 않은 문장은 확정할 수 없습니다: {line.text}")
    return StorySentence(line.text, line.confirmed_style, line.pause_after_ms)


def confirmed_sentences(draft: Sequence[DraftSentence]) -> list[StorySentence]:
    return [_confirmed_sentence(line) for line in draft]


def draft_annotations(draft: Sequence[DraftSentence]) -> list[dict]:
    return [_annotation(line) for line in draft]

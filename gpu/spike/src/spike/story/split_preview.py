"""복원본을 분할기가 나누는 그대로 미리 보여 준다. 판정하지 않고, 태깅 전에 문장 경계와 쉼을 확인하는 용도다."""
from collections.abc import Sequence
from dataclasses import dataclass

from spike.clone.budget import count_syllables
from spike.story.story_draft import narration_notes
from spike.story.story_plan import PARAGRAPH_PAUSE_MS
from spike.story.story_split import SentenceSlot, body_warnings, split_story


@dataclass(frozen=True)
class PreviewSentence:
    index: int
    text: str
    syllables: int
    pause_after_ms: int
    notes: tuple[str, ...]


@dataclass(frozen=True)
class SplitPreview:
    sentences: tuple[PreviewSentence, ...]
    warnings: tuple[str, ...]
    error: str | None


def alone_in_paragraph(slots: Sequence[SentenceSlot], index: int) -> bool:
    """group_units는 문단 쉼을 넘어 잇지 않는다. 그래서 문단에 혼자인 문장은 라벨과 관계없이 혼자 생성된다."""
    opens = index == 0 or slots[index - 1].pause_after_ms >= PARAGRAPH_PAUSE_MS
    return opens and slots[index].pause_after_ms >= PARAGRAPH_PAUSE_MS


def solo_unit_notes(syllables: int, alone: bool, min_syllables: int | None) -> tuple[str, ...]:
    if min_syllables is None or not alone or syllables >= min_syllables:
        return ()
    return (f"문단에 혼자라 라벨과 관계없이 {syllables}음절 단위로 생성됩니다(최소 {min_syllables}음절)",)


def _preview_sentence(slots: Sequence[SentenceSlot], index: int, min_syllables: int | None) -> PreviewSentence:
    slot = slots[index]
    syllables = count_syllables(slot.text)
    solo = solo_unit_notes(syllables, alone_in_paragraph(slots, index), min_syllables)
    return PreviewSentence(index, slot.text, syllables, slot.pause_after_ms, (*narration_notes(slot.text), *solo))


def preview_split(body: str, min_syllables: int | None = None) -> SplitPreview:
    """짝이 맞지 않는 따옴표는 예외 대신 error로 돌려준다. 에이전트가 고쳐서 다시 부르면 되는 입력 문제다.

    최소 길이는 렌더할 실험의 설정에서 오므로 받을 때만 짧은 단위를 알린다.
    """
    warnings = tuple(body_warnings(body))
    try:
        slots = split_story(body)
    except ValueError as error:
        return SplitPreview((), warnings, str(error))
    sentences = tuple(_preview_sentence(slots, index, min_syllables) for index in range(len(slots)))
    return SplitPreview(sentences, warnings, None)

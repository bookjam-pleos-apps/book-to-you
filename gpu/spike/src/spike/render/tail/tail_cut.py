"""꼬리를 붙여 생성한 소리에서 단위 소리만 남긴다. 꼬리 방식에 따라 repeat_cut이나 word_cut으로 나눈다. 어댑터.

낱말 꼬리는 후보 조각을 먼저 받아써야 자를 수 있다. Python 렌더는 바로 받아쓰고, compose 워크플로우는 조각을 whisper에 보낸 뒤 받아쓰기를 넘긴다.
"""
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from spike.sound.audio import Audio
from spike.render.tail.repeat_check import head_share
from spike.render.tail.repeat_cut import cut_repeat
from spike.render.tail.repeat_tail import head_fraction
from spike.story.story_plan import StorySentence
from spike.render.tail.tail_match import first_heard
from spike.render.tail.tail_plan import tail_word
from spike.clone.scoring.whisper_window import exceeds_whisper_window
from spike.render.tail.word_cut import cut_before, word_clips


@dataclass(frozen=True)
class CutTake:
    """audio가 None이면 자를 곳을 찾지 못한 것이다. head_share는 반복 꼬리일 때만 잰다.
    head_transcript는 낱말 꼬리를 자를 때 이미 받아쓴, 잘라 낸 앞부분의 받아쓰기다. QC가 같은 소리를 다시 받아쓰지 않게 한다.
    30초를 넘는 앞부분은 whisper 창 하나에 다 들어가지 않아 None으로 두고 QC가 구간으로 나눠 받아쓴다."""
    audio: Audio | None
    head_share: float | None = None
    head_transcript: str | None = None


def tail_clips(sentence: StorySentence, audio: Audio) -> list[Audio]:
    """받아써야 하는 꼬리 조각. 낱말 꼬리가 아니면 없다."""
    if sentence.tail is None or sentence.tail.kind != "word":
        return []
    return word_clips(audio)


def _cut_repeat(sentence: StorySentence, audio: Audio) -> CutTake:
    head = cut_repeat(audio, head_fraction(sentence))
    return CutTake(head, None if head is None else head_share(head.duration_sec, audio.duration_sec))


def _cut_word(word: str, text: str, audio: Audio, transcripts: Sequence[str]) -> CutTake:
    heard = first_heard(transcripts, word, text)
    if heard is None:
        return CutTake(None)
    head = cut_before(audio, heard.candidate)
    return CutTake(head, head_transcript=None if exceeds_whisper_window(head) else heard.transcript)


def cut_with_transcripts(sentence: StorySentence, audio: Audio, transcripts: Sequence[str]) -> CutTake:
    """transcripts는 tail_clips 순서의 받아쓰기다."""
    if sentence.tail is None:
        return CutTake(audio)
    if sentence.tail.kind == "repeat":
        return _cut_repeat(sentence, audio)
    return _cut_word(tail_word(sentence.tail), sentence.text, audio, transcripts)


def cut_tail(sentence: StorySentence, audio: Audio, transcribe: Callable[[Audio], str]) -> CutTake:
    return cut_with_transcripts(sentence, audio, [transcribe(clip) for clip in tail_clips(sentence, audio)])

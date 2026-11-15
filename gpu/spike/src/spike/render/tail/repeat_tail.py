"""꼬리를 붙인 단위가 모델에 보내는 글. 순수 로직.

Qwen3-TTS Base는 한국어 생성의 마지막 음절을 짧게 끊고, 이어 말하는 중에는 끊지 않는다. 그래서 단위 뒤에 꼬리를 더 읽혀 자른다.
꼬리는 마지막 문장 반복(repeat, 자르기는 repeat_cut) 또는 짧은 낱말(word, 자르기는 word_cut)이다. 누구에게 붙일지는 tail_plan이 정한다.
"""
from spike.clone.budget import count_syllables
from spike.story.story_plan import StorySentence, split_sentences

SENTENCE_MARKS = (".", "?", "!", "…")
QUOTES = "“”‘’\""


def _ends_with_mark(text: str) -> bool:
    return text.rstrip().rstrip(QUOTES).endswith(SENTENCE_MARKS)


def repeat_tail_of(text: str) -> str:
    """마지막 문장에서 따옴표를 뺀다. 제목처럼 부호가 없으면 마침표를 붙여야 앞부분과 반복부 사이에 쉼이 생긴다."""
    tail = split_sentences(text)[-1].strip(QUOTES).strip()
    return tail if _ends_with_mark(text) else f"{tail}."


def spoken_head(text: str) -> str:
    return text if _ends_with_mark(text) else f"{text.rstrip()}."


def spoken_text(sentence: StorySentence) -> str:
    """모델에 보내는 글. 반복하지 않는 단위는 원문 그대로다."""
    if sentence.tail is None:
        return sentence.text
    return f"{spoken_head(sentence.text)} {sentence.tail.text}"


def head_fraction(sentence: StorySentence) -> float:
    """보낸 글에서 앞부분이 차지하는 음절 비율. 자를 쉼을 찾는 첫 추정이다."""
    return count_syllables(spoken_head(sentence.text)) / count_syllables(spoken_text(sentence))

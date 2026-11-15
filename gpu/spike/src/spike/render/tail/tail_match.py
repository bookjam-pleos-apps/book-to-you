"""낱말 꼬리를 어느 쉼에서 자를지 받아쓰기로 정한다. 순수 로직.

자를 위치를 소리만으로 정하면 된소리 앞 막힘 무음('기뻐'의 'ㅃ' 앞)에서 말끝을 자르고도 받아쓰기 QC(빠진 글자 2자까지)를 통과할 수 있다.
그래서 두 가지를 받아쓰기로 확인한다.
1. 생성음 전체가 꼬리 낱말로 끝나야 한다. 모델이 꼬리를 빠뜨렸으면 끝 쉼은 문장 안의 쉼이다.
2. 그 쉼에서 잘라 낸 앞부분이 원문의 마지막 글자들로 끝나야 한다. 말끝까지 잘랐거나 꼬리 첫소리("그")가 남으면 맞지 않는다.
"""
from collections.abc import Sequence
from dataclasses import dataclass

from spike.clone.scoring.eval_metrics import normalize_for_cer

ENDING_CHARS = 2


def said_word(whole: str, word: str) -> bool:
    return normalize_for_cer(whole).endswith(normalize_for_cer(word))


def kept_ending(head: str, text: str) -> bool:
    ending = normalize_for_cer(text)[-ENDING_CHARS:]
    return bool(ending) and normalize_for_cer(head).endswith(ending)


@dataclass(frozen=True)
class HeardHead:
    """자를 후보 번호와 그 후보에서 잘라 낸 앞부분의 받아쓰기."""
    candidate: int
    transcript: str


def first_heard(transcripts: Sequence[str], word: str, text: str) -> HeardHead | None:
    """transcripts는 [생성음 전체, 후보 0의 앞부분, 후보 1의 앞부분, ...]의 받아쓰기다(word_cut.word_clips 순서). 후보는 늦은 쉼부터다.
    꼬리를 말했고 말끝이 남은 첫 후보이고, 없으면 None이다."""
    if not transcripts or not said_word(transcripts[0], word):
        return None
    return next((HeardHead(index, head) for index, head in enumerate(transcripts[1:]) if kept_ending(head, text)), None)

"""클론 출력의 객관 지표. 모델 없이 계산하는 순수 함수."""
import re
import unicodedata
from difflib import SequenceMatcher
from functools import partial, reduce
from itertools import accumulate

from spike.sound.audio import Audio
from spike.clone.budget import count_syllables
from spike.clone.scoring.korean_numerals import reading_candidates
from spike.sound.speech_activity import voiced_duration

SCORED_CHAR = re.compile(r"[가-힣a-z0-9]")
PREVIOUS_TAIL_CHARS = 12
TRANSCRIPT_HEAD_CHARS = 20
MIN_REPEAT_EXCESS = 2
MIN_ANCHOR_CHARS = 3
MAX_MISSING_CHARS = 2


def normalize_for_cer(text: str) -> str:
    """띄어쓰기와 문장부호는 Whisper가 임의로 바꾸므로 비교에서 뺀다.
    NFD로 풀린 한글은 자모라 음절 범위에 안 걸려 원문이 통째로 빠진다. API(cer.ts)처럼 NFC로 먼저 모은다."""
    return "".join(SCORED_CHAR.findall(unicodedata.normalize("NFC", text).lower()))


def cer(reference: str, hypothesis: str) -> float:
    """전사의 숫자는 읽는 법이 여럿이라, 정답에 가장 가까운 읽기로 잰다."""
    return min(_plain_cer(reference, candidate) for candidate in reading_candidates(hypothesis))


def _plain_cer(reference: str, hypothesis: str) -> float:
    ref, hyp = normalize_for_cer(reference), normalize_for_cer(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return _edit_distance(ref, hyp) / len(ref)


def _edit_distance(ref: str, hyp: str) -> int:
    first_row = list(range(len(ref) + 1))
    return reduce(partial(_next_row, ref), hyp, first_row)[-1]


def _next_row(ref: str, prev: list[int], char: str) -> list[int]:
    deleted_or_substituted = [
        min(prev[j] + 1, prev[j - 1] + (ref[j - 1] != char)) for j in range(1, len(ref) + 1)
    ]
    return list(accumulate([prev[0] + 1, *deleted_or_substituted], lambda left, cur: min(cur, left + 1)))


def _longest_shared_run(first: str, second: str) -> int:
    return SequenceMatcher(None, first, second, autojunk=False).find_longest_match().size


def repeats_previous(previous_text: str, transcript: str, text: str) -> bool:
    """전사 앞머리가 정답 대본보다 앞 묶음 끝을 더 닮았으면 앞 대본이 새어 나온 것으로 본다.

    2자 반복은 대부분 못 잡고, 묶음 안쪽 반복이나 전사에 드러나지 않는 반복도 못 잡는다. 없다는 증거로 쓰지 말고 들어서 확인한다.
    """
    tail = normalize_for_cer(previous_text)[-PREVIOUS_TAIL_CHARS:]
    heard = normalize_for_cer(transcript)[:TRANSCRIPT_HEAD_CHARS]
    expected = normalize_for_cer(text)[:TRANSCRIPT_HEAD_CHARS]
    return _longest_shared_run(tail, heard) - _longest_shared_run(tail, expected) >= MIN_REPEAT_EXCESS


def longest_missing_run(text: str, transcript: str) -> int:
    """대본에서 전사에 없는 가장 긴 구간의 글자 수. CER은 긴 단위일수록 짧은 문장 누락을 평균으로 숨긴다.

    짧게 우연히 맞은 글자로 구간이 쪼개지지 않도록 긴 일치만 기준으로 삼는다. 전사기가 놓친 것도 걸리므로 후보로 보고 들어서 확인한다.
    """
    ref, hyp = normalize_for_cer(text), normalize_for_cer(transcript)
    blocks = SequenceMatcher(None, ref, hyp, autojunk=False).get_matching_blocks()
    anchors = [(0, 0, 0), *[tuple(block) for block in blocks if block.size >= MIN_ANCHOR_CHARS], (len(ref), len(hyp), 0)]
    gaps = [
        (after[0] - before[0] - before[2]) - (after[1] - before[1] - before[2])
        for before, after in zip(anchors, anchors[1:])
    ]
    return max(0, *gaps)


def syllables_per_sec(text: str, audio: Audio) -> float | None:
    duration = voiced_duration(audio)
    if duration == 0.0:
        return None
    return count_syllables(text) / duration

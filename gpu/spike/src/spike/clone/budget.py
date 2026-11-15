import re

HANGUL_SYLLABLE = re.compile(r"[가-힣]")
MIN_TOKENS = 100
TOKENS_PER_SYLLABLE = 6
CODEC_TOKENS_PER_SEC = 12.5
BUDGET_SLACK_SEC = 0.2


def count_syllables(text: str) -> int:
    return len(HANGUL_SYLLABLE.findall(text))


def token_budget(text: str) -> int:
    """12Hz 코덱 기준 음절당 약 0.48초 여유. EOS를 못 내는 폭주(#118)를 끊는 상한."""
    return max(MIN_TOKENS, count_syllables(text) * TOKENS_PER_SYLLABLE)


def reached_budget(duration_sec: float, text: str) -> bool:
    """출력이 상한 길이에 닿았으면 EOS 없이 잘렸다고 본다. 라이브러리가 종료 사유를 돌려주지 않아 길이로 추정한다."""
    return duration_sec >= token_budget(text) / CODEC_TOKENS_PER_SEC - BUDGET_SLACK_SEC

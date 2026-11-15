"""아라비아 숫자를 한국어 읽기 후보로 펼친다. Whisper가 '일곱 개'를 '7개'로 적어도 CER이 부풀지 않게 한다. 순수 함수."""
import re
from itertools import product

DIGIT_RUN = re.compile(r"(\d+)")
THOUSANDS_COMMA = re.compile(r"(?<=\d),(?=\d{3})")
SINO_DIGITS = ("", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구")
SINO_PLACES = ((1000, "천"), (100, "백"), (10, "십"), (1, ""))
NATIVE_ONES = ("", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉")
NATIVE_ONES_ATTRIBUTIVE = ("", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉")
NATIVE_TENS = ("", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔")
NATIVE_MAX = 99
MAX_NUMBER_RUNS = 4


def sino_reading(n: int) -> str:
    if n == 0:
        return "영"
    man, rest = divmod(n, 10000)
    if man == 0:
        return _sino_below_10000(rest)
    return ("" if man == 1 else sino_reading(man)) + "만" + _sino_below_10000(rest)


def _sino_below_10000(n: int) -> str:
    """십·백·천 앞의 1은 읽지 않는다(일십이 아니라 십)."""
    digits = ((n // place % 10, unit) for place, unit in SINO_PLACES)
    return "".join(("" if d == 1 and unit else SINO_DIGITS[d]) + unit for d, unit in digits if d)


def native_readings(n: int) -> tuple[str, ...]:
    """단독형(하나, 스물)과 관형형(한 개, 스무 살). 고유어 수사는 99까지만 쓴다."""
    if not 1 <= n <= NATIVE_MAX:
        return ()
    tens, ones = divmod(n, 10)
    standalone = NATIVE_TENS[tens] + NATIVE_ONES[ones]
    attributive_tens = "스무" if tens == 2 and ones == 0 else NATIVE_TENS[tens]
    return tuple(dict.fromkeys((standalone, attributive_tens + NATIVE_ONES_ATTRIBUTIVE[ones])))


def number_readings(n: int) -> tuple[str, ...]:
    return tuple(dict.fromkeys((sino_reading(n), *native_readings(n))))


def reading_candidates(text: str) -> list[str]:
    """숫자 덩어리마다 읽기 후보를 곱해 펼친다. 숫자가 많으면 조합이 폭발하므로 한자어 읽기 하나로 줄인다."""
    parts = DIGIT_RUN.split(THOUSANDS_COMMA.sub("", text))
    numbers = parts[1::2]
    if not numbers:
        return [text]
    expand = number_readings if len(numbers) <= MAX_NUMBER_RUNS else lambda n: (sino_reading(n),)
    options = [expand(int(part)) if i % 2 else (part,) for i, part in enumerate(parts)]
    return ["".join(choice) for choice in product(*options)]

import pytest

from spike.clone.scoring.korean_numerals import (
    MAX_NUMBER_RUNS,
    native_readings,
    number_readings,
    reading_candidates,
    sino_reading,
)


@pytest.mark.parametrize(
    ("n", "reading"),
    [(0, "영"), (7, "칠"), (10, "십"), (11, "십일"), (105, "백오"), (1000, "천"), (2024, "이천이십사"),
     (10000, "만"), (35000, "삼만오천")],
)
def test_sino_reading(n: int, reading: str):
    assert sino_reading(n) == reading


@pytest.mark.parametrize(
    ("n", "readings"),
    [(1, ("하나", "한")), (3, ("셋", "세")), (7, ("일곱",)), (10, ("열",)), (20, ("스물", "스무")),
     (21, ("스물하나", "스물한")), (100, ())],
)
def test_native_readings_include_attributive_forms(n: int, readings: tuple[str, ...]):
    assert native_readings(n) == readings


def test_number_readings_put_sino_first_without_duplicates():
    assert number_readings(7) == ("칠", "일곱")


def test_text_without_digits_is_its_own_only_candidate():
    assert reading_candidates("모두 일곱 개") == ["모두 일곱 개"]


def test_candidates_cover_every_reading_combination():
    candidates = reading_candidates("1, 2개")
    assert "하나, 두개" in candidates and "일, 이개" in candidates
    assert len(candidates) == 3 * 3


def test_thousands_separator_is_one_number():
    assert "천원" in reading_candidates("1,000원")


def test_many_numbers_fall_back_to_sino_only():
    text = " ".join(str(n) for n in range(1, MAX_NUMBER_RUNS + 2))
    assert reading_candidates(text) == ["일 이 삼 사 오"]

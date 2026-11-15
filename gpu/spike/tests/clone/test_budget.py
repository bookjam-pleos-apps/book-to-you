from spike.clone.budget import CODEC_TOKENS_PER_SEC, MIN_TOKENS, count_syllables, reached_budget, token_budget


def test_counts_only_hangul_syllables():
    assert count_syllables("\"토토야, 3시야!\"") == 5


def test_short_text_gets_minimum_budget():
    assert token_budget("잘 자.") == MIN_TOKENS


def test_long_text_scales_with_syllables():
    text = "가" * 50
    assert token_budget(text) == 300


def test_output_at_budget_length_counts_as_cut_off():
    text = "잘 자."
    assert reached_budget(MIN_TOKENS / CODEC_TOKENS_PER_SEC, text)


def test_normal_length_output_is_not_cut_off():
    assert not reached_budget(1.5, "잘 자, 토토. 내일도 신나는 하루가 기다리고 있을 거야.")

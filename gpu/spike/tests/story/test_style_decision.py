from spike.story.style_decision import DEFAULT_STYLE, draft_style

MIN_CONFIDENCE = 0.6


def test_clear_non_calm_winner_is_kept():
    assert draft_style({"calm": 0.05, "excited": 0.9, "soft": 0.05}, MIN_CONFIDENCE) == "excited"


def test_clear_calm_stays_calm():
    assert draft_style({"calm": 0.9, "excited": 0.05, "soft": 0.05}, MIN_CONFIDENCE) == DEFAULT_STYLE


def test_ambiguous_scores_fall_back_to_calm():
    assert draft_style({"calm": 0.3, "excited": 0.4, "soft": 0.3}, MIN_CONFIDENCE) == DEFAULT_STYLE


def test_two_non_calm_styles_in_a_tie_fall_back_to_calm():
    assert draft_style({"calm": 0.0, "excited": 0.5, "soft": 0.5}, MIN_CONFIDENCE) == DEFAULT_STYLE

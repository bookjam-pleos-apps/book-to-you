import pytest

from spike.render.voice.voice_rule_setting import load_voice_rule, voice_rule_from


def test_the_product_rule_targets_child_and_falls_back_to_calm():
    rule = load_voice_rule()

    assert (rule.styles, rule.fallback_style) == (frozenset({"child"}), "calm")
    assert 0 < rule.bottom_share < 1 and rule.min_group >= 2


@pytest.mark.parametrize("change", [{"bottomShare": 0}, {"minGroup": 1}, {"maxRerolls": -1}, {"fallbackStyle": "child"}])
def test_a_rule_that_cannot_be_followed_is_refused(change):
    raw = {"styles": ["child"], "bottomShare": 0.1, "minGroup": 4, "maxRerolls": 2, "fallbackStyle": "calm",
           "groupFloor": 0.7, "referenceFloor": 0.5}

    with pytest.raises(ValueError):
        voice_rule_from({**raw, **change})

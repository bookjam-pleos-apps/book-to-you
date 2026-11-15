from spike.render.trials.head_store import load_head_plan


def test_chosen_units_keep_quote_and_other_boundaries_together():
    assert load_head_plan().units == (5, 6, 7, 8, 17, 20, 24, 25)

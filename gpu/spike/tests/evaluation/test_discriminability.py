import numpy as np

from spike.evaluation.clone_eval.discriminability import MIN_MARGIN, discriminates, discrimination_margin

ANCHOR = np.array([1.0, 0.0])


def test_anchor_closer_to_someone_elses_calm_does_not_discriminate():
    margin = discrimination_margin(ANCHOR, np.array([0.6, 0.8]), [np.array([1.0, 0.1])])
    assert margin < 0 and not discriminates(margin)


def test_anchor_clearly_closest_to_its_own_calm_discriminates():
    margin = discrimination_margin(ANCHOR, np.array([1.0, 0.1]), [np.array([0.0, 1.0])])
    assert margin > MIN_MARGIN and discriminates(margin)


def test_single_speaker_cannot_be_judged_and_is_not_blocked():
    assert discrimination_margin(ANCHOR, ANCHOR, []) is None
    assert discriminates(None)

import pytest

from spike.render.batch.batch_transcripts import flattened, split_back


def test_texts_return_to_the_unit_that_sent_each_clip():
    groups = [["a0", "a1"], [], ["c0"]]

    assert flattened(groups) == ["a0", "a1", "c0"]
    assert split_back(["A0", "A1", "C0"], [len(group) for group in groups]) == [["A0", "A1"], [], ["C0"]]


def test_a_count_mismatch_stops_instead_of_shifting_texts_to_other_units():
    with pytest.raises(ValueError):
        split_back(["A0"], [1, 1])

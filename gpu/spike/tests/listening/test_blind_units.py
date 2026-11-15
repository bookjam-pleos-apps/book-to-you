from spike.listening.blind_units import blind_clips, clip_name


def test_every_unit_of_every_render_appears_once_in_a_fixed_shuffle():
    clips = blind_clips({"repeat": range(3), "word": range(3), "none": range(2)}, seed=7)

    assert sorted((clip.source, clip.unit) for clip in clips) == sorted(
        [("repeat", u) for u in range(3)] + [("word", u) for u in range(3)] + [("none", u) for u in range(2)]
    )
    assert [clip.number for clip in clips] == list(range(1, 9))
    assert clips == blind_clips({"none": range(2), "word": range(3), "repeat": range(3)}, seed=7)
    assert clips != blind_clips({"repeat": range(3), "word": range(3), "none": range(2)}, seed=8)


def test_clip_names_are_padded_to_sort_in_listening_order():
    clips = blind_clips({"a": range(93)}, seed=1)

    assert clip_name(clips[0], 93) == "01.wav" and clip_name(clips[-1], 93) == "93.wav"


def test_only_the_chosen_units_of_each_render_are_mixed():
    clips = blind_clips({"serial": [4, 9], "batch": [4, 9]}, seed=3)

    assert sorted((clip.source, clip.unit) for clip in clips) == [("batch", 4), ("batch", 9), ("serial", 4), ("serial", 9)]

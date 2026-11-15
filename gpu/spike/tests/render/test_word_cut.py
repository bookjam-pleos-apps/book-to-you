import numpy as np
from word_audio import HEAD_SEC, RATE, head_then_word, silence, tone

from spike.sound.audio import Audio
from spike.sound.audio_gaps import KEEP_INTO_GAP_SEC
from spike.render.tail.word_cut import cut_before, word_clips, word_gaps


def test_candidates_start_from_the_latest_pause_with_a_word_sized_tail():
    audio = Audio(head_then_word(), RATE)

    assert [gap[0] / 100 for gap in word_gaps(audio)] == [HEAD_SEC, 1.0]


def test_the_whole_take_and_each_candidate_head_are_sent_for_transcription():
    audio = Audio(head_then_word(), RATE)

    whole, latest, earlier = word_clips(audio)

    assert whole is audio
    assert abs(latest.duration_sec - (HEAD_SEC + KEEP_INTO_GAP_SEC)) < 0.02
    assert earlier.duration_sec < latest.duration_sec


def test_a_short_pause_before_the_word_is_still_a_candidate():
    """모델이 "그래" 앞에서 0.04~0.06초만 쉬었다."""
    audio = Audio(np.concatenate([tone(300, 1.0), silence(0.05), tone(500, 0.3)]), RATE)

    assert len(word_gaps(audio)) == 1


def test_cutting_before_the_first_candidate_keeps_the_whole_head():
    head = cut_before(Audio(head_then_word(), RATE), 0)

    assert abs(head.duration_sec - (HEAD_SEC + KEEP_INTO_GAP_SEC)) < 0.02


def test_a_tail_longer_than_a_word_is_not_a_candidate():
    long_tail = Audio(np.concatenate([tone(300, 1.0), silence(0.3), tone(500, 2.0)]), RATE)

    assert word_gaps(long_tail) == []

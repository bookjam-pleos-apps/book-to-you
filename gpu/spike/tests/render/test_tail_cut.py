import numpy as np
from repeat_audio import two_takes
from word_audio import HEAD_SEC, RATE, head_then_word
from word_transcriber import fake_transcribe

from spike.sound.audio import Audio
from spike.sound.audio_gaps import KEEP_INTO_GAP_SEC
from spike.story.story_plan import StorySentence
from spike.render.tail.tail_cut import cut_tail, cut_with_transcripts, tail_clips
from spike.render.tail.tail_plan import TailSetting, with_tails

TITLE = StorySentence("빨간 모자", "calm", 900)
CALM = StorySentence("엄마가 말했어요.", "calm", 450)


def _title(mode: str) -> StorySentence:
    return with_tails([TITLE], TailSetting(mode, "그래"))[0]


def test_units_without_a_tail_keep_the_whole_take():
    audio = Audio(two_takes(RATE), RATE)

    take = cut_tail(CALM, audio, lambda _: "듣지 않아야 한다")

    assert take.audio is audio and take.head_share is None


def test_a_word_tail_is_cut_at_the_pause_whose_clip_is_heard_as_the_word():
    audio, heard = Audio(head_then_word(), RATE), []

    take = cut_tail(_title("word"), audio, lambda clip: heard.append(clip.duration_sec) or fake_transcribe(clip))

    assert take.audio is not None
    assert abs(take.audio.duration_sec - (HEAD_SEC + KEEP_INTO_GAP_SEC)) < 0.02
    assert take.head_share is None
    assert len(heard) == 3
    assert take.head_transcript == "빨간 모자"


def test_a_word_tail_whose_word_was_not_spoken_cannot_be_cut():
    take = cut_with_transcripts(_title("word"), Audio(head_then_word(), RATE), ["빨간 모자", "빨간 모자", "빨간 모"])

    assert take.audio is None


def test_only_word_tails_send_clips_to_transcription():
    audio = Audio(head_then_word(), RATE)

    assert [len(tail_clips(_title(mode), audio)) for mode in ("word", "repeat", "none")] == [3, 0, 0]


def test_a_repeat_tail_reports_its_head_share():
    audio = Audio(two_takes(RATE), RATE)

    take = cut_with_transcripts(_title("repeat"), audio, [])

    assert take.audio is not None
    assert np.isclose(take.head_share, take.audio.duration_sec / audio.duration_sec)

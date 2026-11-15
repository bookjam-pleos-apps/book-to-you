from spike.render.attempt.vad_clips import NOTHING, WHOLE, Span, clip_args, transcription_plan

SEGMENTS = [{"start_time": 0.1, "end_time": 12.5, "confidence": 0.9}, {"start_time": 13.0, "end_time": 31.2, "confidence": 0.8}]


def test_a_runaway_attempt_is_not_transcribed():
    assert transcription_plan(hit_budget=True, is_long=True, segments=SEGMENTS) == NOTHING


def test_audio_within_the_window_is_transcribed_whole_like_the_short_workflow():
    assert transcription_plan(hit_budget=False, is_long=False, segments=SEGMENTS) == WHOLE


def test_longer_audio_is_transcribed_per_vad_segment_like_transcribe_long():
    plan = transcription_plan(hit_budget=False, is_long=True, segments=SEGMENTS)

    assert (plan.whole, plan.spans) == (False, (Span(0.1, 12.5), Span(13.0, 31.2)))


def test_clips_are_cut_with_the_audio_clipper_command():
    """audio_clipper/drivers/ffmpeg.py(포크 5bd4e1e6)의 명령과 같아야 Whisper가 같은 소리를 듣는다."""
    args = clip_args("in.wav", Span(0.1, 12.5))

    assert args[:11] == ["-hide_banner", "-ss", "0.100000", "-to", "12.500000", "-i", "in.wav", "-vn", "-c:a", "copy", "-f"]

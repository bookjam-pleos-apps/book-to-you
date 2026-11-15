import json

import numpy as np
import pytest
from fake_compose_service import FakeService

from spike.sound.audio import Audio
from spike.compose.compose_client import LONG_TRANSCRIBE_WORKFLOW, TRANSCRIBE_WORKFLOW, ComposeError, ComposeTranscriber
from spike.clone.scoring.whisper_window import WHISPER_WINDOW_SEC

SAMPLE_RATE = 24000


def seconds(sec: float) -> Audio:
    return Audio(np.zeros(int(SAMPLE_RATE * sec), dtype=np.float32), SAMPLE_RATE)


def event_stream(*values: object) -> bytes:
    return b"".join(f"data: {json.dumps(value, ensure_ascii=False)}\n\n".encode() for value in values)


def test_audio_within_the_window_goes_to_the_short_workflow(compose_service: FakeService):
    compose_service.reply = json.dumps(" 안녕 ").encode()

    assert ComposeTranscriber(compose_service.url).transcribe(seconds(WHISPER_WINDOW_SEC)) == "안녕"
    assert compose_service.workflow_ids() == [TRANSCRIBE_WORKFLOW]


def test_longer_audio_joins_the_text_of_each_speech_segment(compose_service: FakeService):
    compose_service.reply = event_stream(" 옛날 옛적에", "어부가 살았어요. ")

    text = ComposeTranscriber(compose_service.url).transcribe(seconds(WHISPER_WINDOW_SEC + 1))

    assert text == "옛날 옛적에 어부가 살았어요."
    assert compose_service.workflow_ids() == [LONG_TRANSCRIBE_WORKFLOW]


def test_segments_keep_their_order_and_drop_empty_ones(compose_service: FakeService):
    compose_service.reply = event_stream("하나", " ", "둘")

    assert ComposeTranscriber(compose_service.url).transcribe_segments(seconds(31)) == ["하나", "둘"]


def test_no_speech_segment_gives_an_empty_transcript(compose_service: FakeService):
    compose_service.reply = b""

    assert ComposeTranscriber(compose_service.url).transcribe(seconds(31)) == ""


def test_a_stream_cut_short_is_an_error_not_a_shorter_transcript(compose_service: FakeService):
    compose_service.reply = event_stream("앞부분만")
    compose_service.cut_short = True

    with pytest.raises(ComposeError, match="끊겼습니다"):
        ComposeTranscriber(compose_service.url).transcribe(seconds(31))

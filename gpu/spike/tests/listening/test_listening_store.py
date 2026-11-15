from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from spike.sound.audio import Audio
from spike.listening.listening_plan import Clip, PlacedClip
from spike.listening import listening_store
from spike.listening.listening_store import KEY_NAME, TRACK_NAME, heard_story, load_key, reference_lead, refuse_rebuild, save_listening, starts_with_quote
from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence
from spike.render.story_store import STORY_NAME

RATE = 1000


def _unit(text: str = "가나다") -> RenderedSentence:
    return RenderedSentence(StorySentence(text, "calm", 500), Audio(np.zeros(RATE, dtype=np.float32), RATE), text, 0.0, 1, True, 1, None)


def test_saved_key_blocks_a_rebuild_and_reads_back(tmp_path: Path):
    refuse_rebuild(tmp_path)
    line = {"order": 0, "clip": {"kind": "control", "unit": 3, "start": 1, "end": 2}, "at": 5}
    save_listening(tmp_path, Audio(np.zeros(10, dtype=np.float32), RATE), {"sampleRate": RATE, "clips": [line]})
    assert (tmp_path / TRACK_NAME).exists() and (tmp_path / KEY_NAME).exists()
    with pytest.raises(FileExistsError):
        refuse_rebuild(tmp_path)
    key, placed = load_key(tmp_path)
    assert key["sampleRate"] == RATE
    assert placed == [PlacedClip(Clip("control", 3, 1, 2), 5)]


def test_story_file_matching_the_units_is_returned(tmp_path: Path):
    sf.write(tmp_path / STORY_NAME, np.zeros(1500, dtype=np.float32), RATE)
    assert len(heard_story(tmp_path, [_unit()]).samples) == 1500


def test_story_file_that_disagrees_with_the_units_stops(tmp_path: Path):
    sf.write(tmp_path / STORY_NAME, np.zeros(1400, dtype=np.float32), RATE)
    with pytest.raises(ValueError, match="단위 합계"):
        heard_story(tmp_path, [_unit()])


def test_quote_start_is_read_from_the_text():
    assert starts_with_quote(_unit("“오오”"))
    assert not starts_with_quote(_unit("하고"))


def test_reference_lead_reads_the_recording_of_the_given_condition(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """폰 녹음(B)만 있는 화자도 듣기 파일을 만들 수 있어야 한다."""
    asked: list[tuple[str, str, str]] = []
    wav = tmp_path / "lead.wav"
    sf.write(wav, np.full(RATE, 0.1, dtype=np.float32), RATE)
    monkeypatch.setattr(listening_store, "prepared_speaker_reference", lambda *key: asked.append(key) or wav)
    assert len(reference_lead("s4_phone", "B")) == RATE
    assert asked == [("s4_phone", "B", "calm")]

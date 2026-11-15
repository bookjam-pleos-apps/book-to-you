from pathlib import Path

import pytest

from spike.clone.catalog import load_reference_scripts, load_speakers
from spike.render.speaker_references import speaker_references


@pytest.fixture
def prepared_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    calls: list[tuple] = []

    def fake_prepared(speaker: str, condition: str, style: str, prepare: object) -> Path:
        calls.append((speaker, condition, style, prepare))
        return Path(f"prepared/{style}.wav")

    monkeypatch.setattr("spike.render.speaker_references.prepared_speaker_reference", fake_prepared)
    return calls


@pytest.fixture
def product_scripts() -> dict[str, str]:
    return {script.style: script.text for script in load_reference_scripts()}


def test_each_style_gets_its_prepared_audio_and_script(prepared_calls: list[tuple], product_scripts: dict[str, str]):
    prepare = object()

    references = speaker_references("s1", "A", ["calm", "excited"], prepare)

    assert references["calm"].path == Path("prepared/calm.wav")
    assert (references["calm"].text, references["excited"].text) == (product_scripts["calm"], product_scripts["excited"])
    assert prepared_calls == [("s1", "A", "calm", prepare), ("s1", "A", "excited", prepare)]


def test_speaker_script_replaces_only_the_style_it_names(prepared_calls: list[tuple], product_scripts: dict[str, str]):
    own_script = next(s for s in load_speakers() if s.id == "s3_phone").scripts["soft"]

    references = speaker_references("s3_phone", "B", ["calm", "soft"], object())

    assert references["soft"].text == own_script != product_scripts["soft"]
    assert references["calm"].text == product_scripts["calm"]


def test_speakers_without_own_script_keep_the_product_script(prepared_calls: list[tuple], product_scripts: dict[str, str]):
    assert speaker_references("s1", "A", ["soft"], object())["soft"].text == product_scripts["soft"]


def test_unregistered_speaker_is_refused_before_touching_any_recording(prepared_calls: list[tuple]):
    with pytest.raises(KeyError):
        speaker_references("s_typo", "B", ["calm"], object())

    assert prepared_calls == []

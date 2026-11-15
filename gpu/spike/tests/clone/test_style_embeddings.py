from pathlib import Path

import numpy as np

from spike.sound.audio import Audio
from spike.clone.reference.style_embeddings import style_embeddings


class FirstSampleEmbedder:
    def embed(self, audio: Audio) -> np.ndarray:
        return audio.samples[:1]


def test_each_style_is_embedded_from_its_own_reference_once(monkeypatch):
    prepared: list[tuple[str, str, str]] = []

    def fake_prepared(speaker: str, condition: str, style: str) -> Path:
        prepared.append((speaker, condition, style))
        return Path(style)

    def fake_read(path: Path) -> Audio:
        return Audio(np.array([1.0 if path.name == "calm" else 2.0]), 24000)

    monkeypatch.setattr("spike.clone.reference.style_embeddings.prepared_speaker_reference", fake_prepared)
    monkeypatch.setattr("spike.clone.reference.style_embeddings.read_audio", fake_read)
    result = style_embeddings("s2_phone", "B", ["calm", "excited", "calm"], FirstSampleEmbedder())
    assert {style: float(vector[0]) for style, vector in result.items()} == {"calm": 1.0, "excited": 2.0}
    assert sorted(prepared) == [("s2_phone", "B", "calm"), ("s2_phone", "B", "excited")]

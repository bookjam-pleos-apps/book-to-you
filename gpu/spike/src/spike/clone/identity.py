from collections.abc import Sequence
from typing import Protocol

import numpy as np

from spike.sound.audio import Audio


class Embedder(Protocol):
    def embed(self, audio: Audio) -> np.ndarray: ...


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def centroid_similarities(embeddings: Sequence[np.ndarray]) -> list[float]:
    """임베딩마다 그 평균(묶음의 평균 목소리)과의 코사인."""
    centroid = np.mean(embeddings, axis=0)
    return [cosine(e, centroid) for e in embeddings]

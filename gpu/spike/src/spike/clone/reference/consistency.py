"""생성할 때마다 목소리가 달라질 수 있는 화자(VoiceDesign)를 앵커와 같은 사람으로 유지한다."""
from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from typing import Protocol

import numpy as np

from spike.sound.audio import Audio
from spike.clone.identity import Embedder, cosine


class Voice(Protocol):
    def speak(self, text: str, instruct: str, seed: int) -> Audio: ...


@dataclass(frozen=True)
class ConsistencyPolicy:
    threshold: float = 0.6
    max_attempts: int = 4


@dataclass(frozen=True)
class Generated:
    audio: Audio
    seed: int
    similarity: float
    identity_ok: bool


Attempt = Callable[[int], Generated]


def generate_consistent(
    voice: Voice,
    embedder: Embedder,
    text: str,
    instruct: str,
    anchor: np.ndarray | None,
    base_seed: int,
    policy: ConsistencyPolicy,
) -> Generated:
    if anchor is None:
        return Generated(voice.speak(text, instruct, base_seed), base_seed, 1.0, True)
    attempt = partial(_attempt, voice, embedder, text, instruct, anchor, policy.threshold)
    return _search(attempt, base_seed, policy.max_attempts, best=None)


def _attempt(
    voice: Voice, embedder: Embedder, text: str, instruct: str, anchor: np.ndarray, threshold: float, seed: int
) -> Generated:
    audio = voice.speak(text, instruct, seed)
    similarity = cosine(embedder.embed(audio), anchor)
    return Generated(audio, seed, similarity, similarity >= threshold)


def _search(attempt: Attempt, seed: int, remaining: int, best: Generated | None) -> Generated:
    """통과하면 바로 반환하고, 시도가 다 떨어지면 가장 비슷했던 것을 반환한다. 깊이는 max_attempts로 제한된다."""
    current = attempt(seed)
    if current.identity_ok:
        return current
    best = _more_similar(best, current)
    if remaining <= 1:
        return best
    return _search(attempt, seed + 1, remaining - 1, best)


def _more_similar(best: Generated | None, current: Generated) -> Generated:
    if best is None or current.similarity > best.similarity:
        return current
    return best

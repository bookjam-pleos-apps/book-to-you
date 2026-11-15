import numpy as np

from spike.sound.audio import Audio
from spike.clone.reference.consistency import ConsistencyPolicy, generate_consistent

ANCHOR = np.array([1.0, 0.0])
SAME = np.array([1.0, 0.1])
OTHER = np.array([0.0, 1.0])
CLOSER = np.array([0.5, 1.0])


class FakeVoice:
    def __init__(self):
        self.seeds: list[int] = []

    def speak(self, text: str, instruct: str, seed: int) -> Audio:
        self.seeds.append(seed)
        return Audio(samples=np.array([float(seed)]), sample_rate=24000)


class FakeEmbedder:
    """seed → 임베딩을 정해 두어 '몇 번째 시도에서 같은 사람이 나오는지'를 흉내 낸다."""

    def __init__(self, by_seed: dict[int, np.ndarray]):
        self._by_seed = by_seed

    def embed(self, audio: Audio) -> np.ndarray:
        return self._by_seed[int(audio.samples[0])]


POLICY = ConsistencyPolicy(threshold=0.6, max_attempts=3)


def test_without_anchor_first_attempt_becomes_the_anchor():
    voice = FakeVoice()
    result = generate_consistent(voice, FakeEmbedder({}), "t", "i", None, 10, POLICY)
    assert voice.seeds == [10] and result.identity_ok


def test_retries_with_next_seed_until_same_speaker():
    voice = FakeVoice()
    embedder = FakeEmbedder({10: OTHER, 11: SAME})
    result = generate_consistent(voice, embedder, "t", "i", ANCHOR, 10, POLICY)
    assert voice.seeds == [10, 11] and result.seed == 11 and result.identity_ok


def test_keeps_most_similar_attempt_when_none_pass():
    voice = FakeVoice()
    embedder = FakeEmbedder({10: OTHER, 11: CLOSER, 12: OTHER})
    result = generate_consistent(voice, embedder, "t", "i", ANCHOR, 10, POLICY)
    assert voice.seeds == [10, 11, 12]
    assert result.seed == 11 and not result.identity_ok

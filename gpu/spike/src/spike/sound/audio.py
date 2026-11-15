from dataclasses import dataclass

import numpy as np

PCM16_SCALE = 32768


@dataclass(frozen=True)
class Audio:
    samples: np.ndarray
    sample_rate: int

    @property
    def duration_sec(self) -> float:
        return len(self.samples) / self.sample_rate


def to_mono(audio: Audio) -> Audio:
    """실제 마이크 녹음은 스테레오일 수 있다. 지표와 임베딩은 1차원 파형을 가정한다."""
    if audio.samples.ndim == 1:
        return audio
    return Audio(audio.samples.mean(axis=1).astype(np.float32), audio.sample_rate)

"""Audio를 모델 입력 샘플레이트의 torch 파형으로 바꾼다. GPU 어댑터들이 같이 쓴다. GPU 전용."""
import numpy as np
import torch
import torchaudio

from spike.sound.audio import Audio


def resampled_wave(audio: Audio, target_rate: int) -> torch.Tensor:
    wave = torch.from_numpy(np.asarray(audio.samples, dtype=np.float32))
    return torchaudio.functional.resample(wave, audio.sample_rate, target_rate)

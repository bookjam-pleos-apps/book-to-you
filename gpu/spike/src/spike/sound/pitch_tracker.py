"""PitchTracker 구현. librosa의 pYIN을 쓴다. CPU에서 돌고 qwen-tts가 이미 librosa를 끌어온다."""
import librosa
import numpy as np

from spike.sound.audio import Audio
from spike.sound.prosody import PITCH_STEP_SEC

# 아이에게 읽어 주는 신난 여성 목소리는 500Hz를 넘기도 한다. 하한은 낮은 남성 목소리 기준.
PITCH_FLOOR_HZ = 75.0
PITCH_CEILING_HZ = 600.0


class PyinPitchTracker:
    def track(self, audio: Audio) -> np.ndarray:
        f0, _, _ = librosa.pyin(
            audio.samples.astype(np.float32),
            fmin=PITCH_FLOOR_HZ,
            fmax=PITCH_CEILING_HZ,
            sr=audio.sample_rate,
            hop_length=int(audio.sample_rate * PITCH_STEP_SEC),
        )
        return f0

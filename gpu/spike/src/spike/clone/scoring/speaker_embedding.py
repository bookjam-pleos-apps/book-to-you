"""ECAPA 화자 임베딩. 동일인 검사와 4단계 화자 유사도 측정에 같이 쓴다. GPU 전용."""
import numpy as np
from speechbrain.inference.speaker import EncoderClassifier

from spike.sound.audio import Audio
from spike.sound.torch_audio import resampled_wave

ECAPA_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"
ECAPA_SAMPLE_RATE = 16000


class EcapaEmbedder:
    def __init__(self, device: str = "cuda:0"):
        self._model = EncoderClassifier.from_hparams(source=ECAPA_SOURCE, run_opts={"device": device})

    def embed(self, audio: Audio) -> np.ndarray:
        embedding = self._model.encode_batch(resampled_wave(audio, ECAPA_SAMPLE_RATE).unsqueeze(0))
        return embedding.squeeze().detach().cpu().numpy()

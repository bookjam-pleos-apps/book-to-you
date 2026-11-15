"""Whisper large-v3 한국어 전사. CER 측정용. GPU 전용."""
import torch
from transformers import pipeline

from spike.sound.audio import Audio
from spike.sound.torch_audio import resampled_wave
from spike.clone.scoring.whisper_window import exceeds_whisper_window

WHISPER_MODEL = "openai/whisper-large-v3"
WHISPER_SAMPLE_RATE = 16000


class WhisperTranscriber:
    def __init__(self, device: str = "cuda:0"):
        self._pipe = pipeline(
            "automatic-speech-recognition", model=WHISPER_MODEL, device=device, torch_dtype=torch.float16
        )

    def transcribe(self, audio: Audio) -> str:
        wave = resampled_wave(audio, WHISPER_SAMPLE_RATE)
        # 언어를 고정하지 않으면 짧은 클립을 다른 언어로 오인해 번역투로 적는다.
        # Whisper는 30초가 넘는 입력을 타임스탬프 모드에서만 받는다. 짧은 입력의 평가 결과는 바꾸지 않는다.
        is_long = exceeds_whisper_window(audio)
        result = self._pipe(
            {"raw": wave.numpy(), "sampling_rate": WHISPER_SAMPLE_RATE},
            generate_kwargs={"language": "korean", "task": "transcribe"},
            **({"return_timestamps": True} if is_long else {}),
        )
        return str(result["text"]).strip()

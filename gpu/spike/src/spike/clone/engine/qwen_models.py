"""Qwen3-TTS 모델 로더. 처음 쓰일 때 한 번만 올린다. GPU 전용."""
from functools import cache

import torch
from qwen_tts import Qwen3TTSModel

CUSTOM_VOICE_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
VOICE_DESIGN_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
DEVICE = "cuda:0"


def _load(model_id: str) -> Qwen3TTSModel:
    # GB10(SM121)은 flash-attn 빌드 불가 → sdpa
    return Qwen3TTSModel.from_pretrained(
        model_id, device_map=DEVICE, dtype=torch.bfloat16, attn_implementation="sdpa"
    )


@cache
def custom_voice_model() -> Qwen3TTSModel:
    return _load(CUSTOM_VOICE_MODEL)


@cache
def voice_design_model() -> Qwen3TTSModel:
    return _load(VOICE_DESIGN_MODEL)


@cache
def base_model(model_id: str) -> Qwen3TTSModel:
    return _load(model_id)

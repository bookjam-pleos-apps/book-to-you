"""합성 화자의 '실제 음성' 역할을 하는 목소리. 프리셋과 VoiceDesign 두 구현. GPU 전용."""
import torch

from spike.sound.audio import Audio
from spike.clone.budget import token_budget
from spike.clone.catalog import Speaker
from spike.clone.reference.consistency import Voice
from spike.clone.engine.qwen_models import custom_voice_model, voice_design_model

LANGUAGE = "Korean"


class PresetVoice:
    def __init__(self, preset: str):
        self._preset = preset

    def speak(self, text: str, instruct: str, seed: int) -> Audio:
        torch.manual_seed(seed)
        wavs, sample_rate = custom_voice_model().generate_custom_voice(
            text=text,
            language=LANGUAGE,
            speaker=self._preset,
            instruct=instruct,
            max_new_tokens=token_budget(text),
        )
        return Audio(samples=wavs[0], sample_rate=sample_rate)


class DesignedVoice:
    def __init__(self, description: str):
        self._description = description

    def speak(self, text: str, instruct: str, seed: int) -> Audio:
        torch.manual_seed(seed)
        wavs, sample_rate = voice_design_model().generate_voice_design(
            text=text,
            language=LANGUAGE,
            instruct=f"{self._description} {instruct}",
            max_new_tokens=token_budget(text),
        )
        return Audio(samples=wavs[0], sample_rate=sample_rate)


def voice_for(speaker: Speaker) -> Voice:
    if speaker.source == "preset" and speaker.preset:
        return PresetVoice(speaker.preset)
    if speaker.source == "design" and speaker.description:
        return DesignedVoice(speaker.description)
    raise ValueError(f"speaker {speaker.id} cannot be synthesized (source={speaker.source})")

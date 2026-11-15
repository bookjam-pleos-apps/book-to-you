"""클론 엔진 포트. 실행기는 이 Protocol만 알고, Qwen·CosyVoice 등 구현은 진입점에서 주입한다."""
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from spike.sound.audio import Audio


@dataclass(frozen=True)
class PromptContext:
    audio: Audio
    text: str


@dataclass(frozen=True)
class CloneRequest:
    text: str
    reference_path: Path
    reference_text: str
    model: str
    seed: int
    non_streaming: bool
    x_vector_only: bool
    temperature: float | None = None
    context: PromptContext | None = None
    max_new_tokens: int | None = None
    repetition_penalty: float | None = None
    subtalker_greedy: bool = False


@dataclass(frozen=True)
class Synthesis:
    audio: Audio
    gen_ms: int
    prompt_codes: int | None = None


class CloneEngine(Protocol):
    def synthesize(self, request: CloneRequest) -> Synthesis: ...

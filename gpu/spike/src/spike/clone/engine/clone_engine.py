"""Qwen3-TTS Base 클론 엔진. 제품 TtsEngine 포트와 같은 prepare(참조→프롬프트) / synthesize 구조. GPU 전용."""
from __future__ import annotations

from dataclasses import replace
from functools import cache
from pathlib import Path
from time import perf_counter
from typing import TYPE_CHECKING

import torch

from spike.sound.audio import Audio
from spike.clone.budget import token_budget
from spike.clone.engine.clone_port import CloneRequest, PromptContext, Synthesis
from spike.clone.engine.qwen_models import base_model

if TYPE_CHECKING:
    from qwen_tts.inference.qwen3_tts_model import VoiceClonePromptItem

LANGUAGE = "Korean"


@cache
def prepare(model_id: str, reference_path: Path, reference_text: str, x_vector_only: bool) -> list[VoiceClonePromptItem]:
    """같은 참조의 프롬프트는 한 번만 만든다. 제품에서는 이 결과를 디스크에 캐시한다."""
    return base_model(model_id).create_voice_clone_prompt(
        ref_audio=str(reference_path),
        ref_text=None if x_vector_only else reference_text,
        x_vector_only_mode=x_vector_only,
    )


def merged_prompt_item(anchor: VoiceClonePromptItem, context: VoiceClonePromptItem) -> VoiceClonePromptItem:
    """오디오가 아니라 코드를 잇는다. 화자 임베딩은 생성한 음성이 아니라 실제 녹음 값을 유지한다."""
    if anchor.ref_code is None or context.ref_code is None:
        raise ValueError("문맥을 이으려면 참조 코드가 있어야 합니다. x_vector_only와 함께 쓸 수 없습니다")
    codes = torch.cat([anchor.ref_code, context.ref_code.to(anchor.ref_code.device)], dim=0)
    return replace(anchor, ref_code=codes, ref_text=f"{anchor.ref_text} {context.ref_text}")


def _with_context(model_id: str, prompt: list[VoiceClonePromptItem], context: PromptContext | None) -> list[VoiceClonePromptItem]:
    """문맥은 조건마다 달라 캐시하지 않는다. seed를 정하기 전에 호출해 인코딩이 난수를 소모해도 결과가 흔들리지 않게 한다."""
    if context is None:
        return prompt
    encoded = base_model(model_id).create_voice_clone_prompt(
        ref_audio=(context.audio.samples, context.audio.sample_rate),
        ref_text=context.text,
        x_vector_only_mode=False,
    )
    return [merged_prompt_item(prompt[0], encoded[0])]


def _prompt_codes(prompt: list[VoiceClonePromptItem]) -> int | None:
    code = prompt[0].ref_code
    return None if code is None else int(code.shape[0])


class QwenCloneEngine:
    def synthesize(self, request: CloneRequest) -> Synthesis:
        anchor = prepare(request.model, request.reference_path, request.reference_text, request.x_vector_only)
        prompt = _with_context(request.model, anchor, request.context)
        torch.manual_seed(request.seed)
        started = perf_counter()
        wavs, sample_rate = base_model(request.model).generate_voice_clone(
            text=request.text,
            language=LANGUAGE,
            voice_clone_prompt=prompt,
            non_streaming_mode=request.non_streaming,
            max_new_tokens=token_budget(request.text) if request.max_new_tokens is None else request.max_new_tokens,
            temperature=request.temperature,
            subtalker_temperature=request.temperature,
            repetition_penalty=request.repetition_penalty,
            # None은 라이브러리 기본값(샘플링)을 뜻한다. False만 greedy가 된다.
            subtalker_dosample=False if request.subtalker_greedy else None,
        )
        gen_ms = round((perf_counter() - started) * 1000)
        return Synthesis(Audio(samples=wavs[0], sample_rate=sample_rate), gen_ms, _prompt_codes(prompt))

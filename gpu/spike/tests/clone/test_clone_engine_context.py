"""모델 없이 프롬프트 병합만 확인한다. 실제 생성 경로는 DGX 첫 실행 전까지 검증되지 않는다."""
import pytest

torch = pytest.importorskip("torch")
model_module = pytest.importorskip("qwen_tts.inference.qwen3_tts_model")
clone_engine = pytest.importorskip("spike.clone.engine.clone_engine")


def _item(frames: int, text: str, embedding: float):
    return model_module.VoiceClonePromptItem(
        ref_code=torch.zeros((frames, 16), dtype=torch.long),
        ref_spk_embedding=torch.full((4,), embedding),
        x_vector_only_mode=False,
        icl_mode=True,
        ref_text=text,
    )


def test_merge_joins_codes_and_text_but_keeps_recorded_speaker_embedding():
    merged = clone_engine.merged_prompt_item(_item(204, "참조", 1.0), _item(91, "앞 묶음", 9.0))
    assert merged.ref_code.shape == (295, 16)
    assert merged.ref_text == "참조 앞 묶음"
    assert torch.equal(merged.ref_spk_embedding, torch.full((4,), 1.0))


def test_merge_without_codes_is_refused():
    anchor = _item(204, "참조", 1.0)
    anchor.ref_code = None
    with pytest.raises(ValueError, match="참조 코드"):
        clone_engine.merged_prompt_item(anchor, _item(91, "앞", 9.0))

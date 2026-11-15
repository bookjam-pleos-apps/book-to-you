import pytest

from skip_policy import unexpected_skips

TORCH_MISSING = "Skipped: could not import 'torch': No module named 'torch'"
QWEN_SUBMODULE_MISSING = "Skipped: could not import 'qwen_tts.inference.qwen3_tts_model': No module named 'qwen_tts'"
LIBROSA_MISSING = "Skipped: could not import 'librosa': No module named 'librosa'"
FFMPEG_MISSING = "Skipped: ffmpeg not installed"


@pytest.mark.parametrize("reason", [TORCH_MISSING, QWEN_SUBMODULE_MISSING])
def test_missing_gpu_only_dependency_is_allowed(reason):
    assert unexpected_skips([reason]) == []


@pytest.mark.parametrize("reason", [LIBROSA_MISSING, FFMPEG_MISSING])
def test_other_skips_are_unexpected(reason):
    assert unexpected_skips([reason]) == [reason]


def test_only_unexpected_reasons_remain_from_mixed_skips():
    assert unexpected_skips([TORCH_MISSING, FFMPEG_MISSING]) == [FFMPEG_MISSING]

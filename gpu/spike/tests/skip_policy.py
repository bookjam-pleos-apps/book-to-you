"""허용할 skip을 정한다. 맥과 CI에 설치하지 않는 GPU 전용 의존성이 없을 때만 건너뛸 수 있다."""
from collections.abc import Iterable

GPU_ONLY_MODULES = ("torch", "qwen_tts")


def is_allowed_skip(reason: str) -> bool:
    return any(f"could not import '{module}" in reason for module in GPU_ONLY_MODULES)


def unexpected_skips(reasons: Iterable[str]) -> list[str]:
    return [reason for reason in reasons if not is_allowed_skip(reason)]

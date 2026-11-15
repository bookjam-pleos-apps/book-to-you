"""실험의 engine 값을 실행 구현으로 바꾼다. compose 모드에서 torch와 모델을 올리지 않도록 쓰는 쪽만 지연 import한다."""
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from functools import partial

from spike.clone.engine.clone_port import CloneEngine
from spike.clone.engine.engine_ids import COMPOSE_ENGINE_ID, DIRECT_ENGINE_ID
from spike.clone.reference.ref_prep import PrepareReference, prepare_reference
from spike.render.story_render import Transcribe

COMPOSE_STORY_UNITS = ("sentence",)


@dataclass(frozen=True)
class Backend:
    engine: CloneEngine
    transcribe: Transcribe
    prepare_reference: PrepareReference


def _direct_engine() -> CloneEngine:
    from spike.clone.engine.clone_engine import QwenCloneEngine

    return QwenCloneEngine()


def _service_url(compose_url: str | None) -> str:
    from spike.compose.compose_client import DEFAULT_URL

    return DEFAULT_URL if compose_url is None else compose_url


def _compose_engine(compose_url: str | None = None) -> CloneEngine:
    from spike.compose.compose_client import ComposeCloneEngine

    return ComposeCloneEngine(_service_url(compose_url))


def _direct_backend(_compose_url: str | None) -> Backend:
    from spike.clone.scoring.whisper_transcriber import WhisperTranscriber

    return Backend(_direct_engine(), WhisperTranscriber().transcribe, prepare_reference)


def _compose_backend(compose_url: str | None) -> Backend:
    from spike.compose.compose_client import ComposeTranscriber, prepare_reference_via_compose

    url = _service_url(compose_url)
    return Backend(_compose_engine(url), ComposeTranscriber(url).transcribe, partial(prepare_reference_via_compose, url=url))


ENGINE_FACTORIES: dict[str, Callable[[], CloneEngine]] = {
    DIRECT_ENGINE_ID: _direct_engine,
    COMPOSE_ENGINE_ID: _compose_engine,
}
BACKEND_FACTORIES: dict[str, Callable[[str | None], Backend]] = {
    DIRECT_ENGINE_ID: _direct_backend,
    COMPOSE_ENGINE_ID: _compose_backend,
}


def load_engines(engine_ids: Iterable[str]) -> dict[str, CloneEngine]:
    return {engine_id: ENGINE_FACTORIES[engine_id]() for engine_id in set(engine_ids)}


def load_backend(engine_id: str, compose_url: str | None = None) -> Backend:
    """compose_url은 서비스 포트가 저장소 정의와 다른 장비(DGX는 18096)에서 렌더할 때 넘긴다."""
    return BACKEND_FACTORIES[engine_id](compose_url)


def reference_preparer(engine_ids: Iterable[str]) -> PrepareReference:
    """참조 전처리 결과는 실험끼리 공유한다. 직접 호출 실험이 섞이면 서비스 없이도 돌도록 직접 실행한다."""
    if set(engine_ids) != {COMPOSE_ENGINE_ID}:
        return prepare_reference
    from spike.compose.compose_client import prepare_reference_via_compose

    return prepare_reference_via_compose


def story_option_problems(engine_id: str, chain: bool, unit: str, from_plan: bool) -> list[str]:
    """compose는 체이닝과 30초 넘는 전사를 못 한다. 렌더 중간에 죽기 전에 시작할 때 거부한다."""
    if engine_id != COMPOSE_ENGINE_ID:
        return []
    rules = (
        (chain, "--chain과 --context-from은 compose에서 지원하지 않습니다"),
        (from_plan, "--plan-from은 묶음이 30초를 넘을 수 있어 compose에서 지원하지 않습니다"),
        (unit not in COMPOSE_STORY_UNITS, f"--unit {unit}은 30초를 넘을 수 있어 compose에서 지원하지 않습니다"),
    )
    return [problem for rejected, problem in rules if rejected]

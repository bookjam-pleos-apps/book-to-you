"""API 배치의 작업 폴더를 렌더한다. 합격 여부는 report.json에 남기고 게시 단계가 판단한다.

엔진은 셋 중에서 고른다.
- qwen3-base-compose(기본): 클론과 받아쓰기를 compose 서비스가 맡고, 재시도와 QC는 이 프로세스가 한다.
- qwen3-base-workflow: 단위 하나의 렌더 흐름(재시도, 받아쓰기, QC)까지 compose 워크플로우 render-unit이 맡는다.
- qwen3-base-batch: 같은 style 단위를 --batch-size개씩 한 번에 생성하고(render-batch), 떨어진 단위만 라운드로 다시 만든다.
- qwen3-base(비상 경로): 이 프로세스가 GPU에 모델을 직접 올린다.
서비스는 음성을 경로로 읽으므로 같은 장비에서 실행한다. 서비스 엔진에서는 이 프로세스가 torch를 올리지 않는다.
사용: uv run --no-dev --extra audio python -m spike.run_render_job --job ~/vs-batch/<renderId> --compose-url URL [--engine qwen3-base-workflow]
      uv run --extra gpu python -m spike.run_render_job --job ... --engine qwen3-base
정리: uv run python -m spike.run_render_job --job ~/vs-batch/<renderId> --cleanup
"""
import argparse
from functools import partial
from collections.abc import Sequence
from pathlib import Path

from spike.clone.engine.engine_ids import BATCH_ENGINE_ID, COMPOSE_ENGINE_ID, ENGINE_IDS, SERVICE_ENGINE_IDS, WORKFLOW_ENGINE_ID
from spike.render.job.render_engine_setting import load_engine_setting
from spike.render.job.render_job import RenderJob, job_units, load_render_job, remove_render_job, render_job_all_at_once, render_job_with, run_render_job
from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence


def _workflow_rendered(job_dir: Path, job: RenderJob, compose_url: str | None) -> Sequence[RenderedSentence]:
    from spike.compose.workflow_render import WorkflowUnitRenderer

    if compose_url is None:
        raise ValueError(f"{WORKFLOW_ENGINE_ID}에는 서비스 주소가 필요합니다")
    return render_job_with(job_dir, job, WorkflowUnitRenderer(compose_url, job_dir).render_one)


def _reloaded_units(job_dir: Path) -> list[StorySentence]:
    return job_units(load_render_job(job_dir))


def _batch_rendered(job_dir: Path, job: RenderJob, compose_url: str | None, batch_size: int, voice_check: bool) -> Sequence[RenderedSentence]:
    """배치 엔진은 인물 녹음 목소리 자동 보정(data/voice-reroll.json)까지 한다. 임베딩은 서비스의 voice-embed가 잰다."""
    from spike.compose.compose_voice_embed import ComposeVoiceEmbedder
    from spike.render.voice.voice_rule_setting import load_voice_rule
    from spike.compose.workflow_batch_render import BatchWorkflowRenderer, VoiceSetup

    if compose_url is None:
        raise ValueError(f"{BATCH_ENGINE_ID}에는 서비스 주소가 필요합니다")
    references = {reference.style: job_dir / reference.file for reference in job.references}
    reload_units = partial(_reloaded_units, job_dir)
    voice = VoiceSetup(load_voice_rule(), ComposeVoiceEmbedder(compose_url), references, reload_units) if voice_check else None
    renderer = BatchWorkflowRenderer(compose_url, job_dir)
    return render_job_all_at_once(job_dir, job, lambda units: renderer.render(units, batch_size, voice))


def _rendered(job_dir: Path, job: RenderJob, engine_id: str, compose_url: str | None, batch_size: int, voice_check: bool) -> Sequence[RenderedSentence]:
    if engine_id == WORKFLOW_ENGINE_ID:
        return _workflow_rendered(job_dir, job, compose_url)
    if engine_id == BATCH_ENGINE_ID:
        return _batch_rendered(job_dir, job, compose_url, batch_size, voice_check)
    from spike.compose.engine_backends import load_backend

    backend = load_backend(engine_id, compose_url)
    return run_render_job(job_dir, job, backend.engine, backend.transcribe)


def render_job_dir(
    job_dir: Path, engine_id: str, compose_url: str | None, batch_size: int = 1, voice_check: bool = True,
) -> Sequence[RenderedSentence]:
    return _rendered(job_dir, load_render_job(job_dir), engine_id, compose_url, batch_size, voice_check)


def failed_count(rendered: Sequence[RenderedSentence]) -> int:
    return sum(not item.passed for item in rendered)


def _render(args: argparse.Namespace, batch_size: int) -> None:
    rendered = render_job_dir(args.job, args.engine, args.compose_url, batch_size, not args.no_voice_check)
    print(f"엔진 {args.engine}, 단위 {len(rendered)}개, 문장 QC 실패 {failed_count(rendered)}개")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", type=Path, required=True)
    parser.add_argument("--cleanup", action="store_true")
    parser.add_argument("--engine", choices=ENGINE_IDS, default=COMPOSE_ENGINE_ID)
    parser.add_argument("--compose-url")
    # qwen3-base-batch에서만 쓴다. 주지 않으면 시연 서버와 같은 data/render-engine.json 값이다.
    parser.add_argument("--batch-size", type=int)
    # 배치 엔진의 목소리 자동 보정을 끈다. 배치 효과만 따로 잴 때 쓴다.
    parser.add_argument("--no-voice-check", action="store_true")
    args = parser.parse_args(argv)
    problem = engine_problem(args)
    if problem is not None:
        parser.error(problem)
    return args


def engine_problem(args: argparse.Namespace) -> str | None:
    """서비스 포트는 장비마다 다르다(저장소 정의 18090, 장비 사본 18096). 18090을 다른 서비스가 쓰는 장비도 있어 기본 URL로 보내지 않는다."""
    if args.cleanup:
        return None
    uses_service = args.engine in SERVICE_ENGINE_IDS
    if uses_service and args.compose_url is None:
        return f"--engine {args.engine}에는 --compose-url이 필요합니다(장비의 서비스 주소)"
    if not uses_service and args.compose_url is not None:
        return f"--compose-url은 서비스 엔진({', '.join(SERVICE_ENGINE_IDS)})과 함께만 씁니다. 직접 호출은 서비스를 쓰지 않습니다"
    return None


def main() -> None:
    args = parse_args()
    if args.cleanup:
        remove_render_job(args.job)
        return
    batch_size = load_engine_setting().batch_size if args.batch_size is None else args.batch_size
    _render(args, batch_size)


if __name__ == "__main__":
    main()

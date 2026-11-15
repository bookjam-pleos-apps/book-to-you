"""본문 파일 하나를 실제 화자 목소리로 생성한다. GPU 전용.

사용: uv run --extra gpu python -m spike.experiments.render.run_story --body story.txt --speaker s1b --out outputs/story_sample
체이닝: uv run --extra gpu python -m spike.experiments.render.run_story --plan-from outputs/story_passage --chain --speaker s1b --out outputs/story_chain
1회 문맥: --chain 대신 --context-from outputs/story_passage를 준다. 앞 묶음 문맥을 그 렌더에서 가져와 되먹임이 없다.
폰 녹음: --condition B를 더한다. 참조는 recordings/{speaker}/B_{style}.m4a다.
compose: gpu/compose/README.md의 환경에서 --experiment real_quiet_compose를 더한다. 문장 단위만 지원한다.
"""
import argparse
from collections.abc import Iterable, Sequence
from dataclasses import replace
from functools import partial

from spike.clone.cli_output import abort_if
from spike.compose.engine_backends import Backend, load_backend, story_option_problems
from spike.clone.plan.experiment import Experiment, load_experiments, select
from spike.experiments.render.run_story_args import DEFAULT_UNIT, parse_story_args
from spike.render.speaker_references import speaker_references
from spike.render.story_chain import chained_render, one_hop_render
from spike.story.story_plan import StorySentence, excerpt, plan_units
from spike.render.story_render import RenderOne, RenderSettings, independent_render, render_story, stitch
from spike.render.story_script import refuse_different_script
from spike.render.story_store import (
    STORY_NAME,
    load_plan,
    load_units,
    refuse_overwriting_plan,
    save_progress,
    save_render_settings,
    save_story,
)
from spike.render.tail.tail_plan import TailSetting, with_tails
from spike.render.tail.tail_setting import load_tail_setting


def _settings(args: argparse.Namespace, experiment: Experiment, backend: Backend, styles: Iterable[str]) -> RenderSettings:
    """쓰는 감정의 참조만 준비한다. DGX에 calm 녹음만 올려도 돌아야 한다."""
    references = speaker_references(args.speaker, args.condition, styles, backend.prepare_reference)
    seed = experiment.seed if args.seed is None else args.seed
    return RenderSettings(
        experiment.model,
        seed,
        references,
        args.temperature,
        repetition_penalty=args.repetition_penalty,
        subtalker_greedy=args.subtalker_greedy,
    )


def _loaded_units(args: argparse.Namespace) -> list[StorySentence]:
    if args.body is not None:
        return plan_units(args.body.read_text(encoding="utf-8"), args.unit or DEFAULT_UNIT, args.single_style)
    refuse_overwriting_plan(args.plan_from, args.out)
    return load_plan(args.plan_from)


def tail_setting_of(args: argparse.Namespace) -> TailSetting:
    setting = load_tail_setting()
    return setting if args.tail is None else replace(setting, mode=args.tail)


def _planned_units(args: argparse.Namespace, tail: TailSetting) -> list[StorySentence]:
    """꼬리 대상은 발췌 전 전체 계획에서 정한다(tail_plan.with_tails)."""
    return with_tails(_loaded_units(args), tail)


def _render_one(args: argparse.Namespace, backend: Backend, settings: RenderSettings, plan: Sequence[StorySentence]) -> RenderOne:
    if args.context_from is not None:
        sources = load_units(args.context_from)
        refuse_different_script(plan, sources, "문맥 렌더")
        return one_hop_render(backend.engine, backend.transcribe, settings, sources, args.first_unit)
    make_render_one = chained_render if args.chain else independent_render
    return make_render_one(backend.engine, backend.transcribe, settings)


def main() -> None:
    args = parse_story_args()
    experiment = select(load_experiments(), [args.experiment])[0]
    uses_context = args.chain or args.context_from is not None
    abort_if(story_option_problems(experiment.engine, uses_context, args.unit or DEFAULT_UNIT, args.plan_from is not None), "지원하지 않는 옵션:")
    tail = tail_setting_of(args)
    plan = _planned_units(args, tail)
    sentences = excerpt(plan, args.first_unit, args.unit_count)
    backend = load_backend(experiment.engine)
    settings = _settings(args, experiment, backend, {sentence.style for sentence in sentences})
    render_one = _render_one(args, backend, settings, plan)
    save_render_settings(args.out, {**vars(args), "tail": tail.mode, "tail_word": tail.word})
    rendered = render_story(sentences, render_one, partial(save_progress, args.out))
    story = stitch(rendered)
    save_story(args.out / STORY_NAME, story)
    failed, chained = sum(not item.passed for item in rendered), sum(item.context_used for item in rendered)
    print(f"단위 {len(rendered)}개, 길이 {story.duration_sec:.0f}초, 실패 {failed}개, 문맥 사용 {chained}개")


if __name__ == "__main__":
    main()

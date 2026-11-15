"""run_story의 명령줄 인자. 모델을 불러오지 않고 인자 규칙을 시험할 수 있게 진입점과 나눈다."""
import argparse
from collections.abc import Sequence
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.render.tail.tail_plan import TAIL_MODES

UNITS =("sentence", "paragraph", "passage", "whole")
DEFAULT_UNIT = "sentence"
# --single-style로 이야기 전체를 한 참조로 읽을 때 고를 수 있는 style. 라벨 목록은 story_draft.STYLES다.
SINGLE_STYLES = ("calm", "excited")
# run_story는 실험의 모델과 seed만 쓴다. 다른 설정이 다른 실험은 설정이 무시된 채 생성되므로 받지 않는다.
STORY_EXPERIMENTS = ("real_quiet", "real_quiet_compose")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--body", type=Path)
    source.add_argument("--plan-from", type=Path)
    context = parser.add_mutually_exclusive_group()
    context.add_argument("--chain", action="store_true")
    context.add_argument("--context-from", type=Path)
    parser.add_argument("--experiment", choices=STORY_EXPERIMENTS, default=STORY_EXPERIMENTS[0])
    parser.add_argument("--speaker", required=True)
    add_condition_argument(parser)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--unit", choices=UNITS)
    parser.add_argument("--single-style", choices=SINGLE_STYLES)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--temperature", type=float)
    parser.add_argument("--repetition-penalty", type=float)
    parser.add_argument("--subtalker-greedy", action="store_true")
    parser.add_argument("--first-unit", type=int, default=0)
    parser.add_argument("--unit-count", type=int)
    # 주지 않으면 제품 렌더와 같은 data/render-tail.json을 따른다.
    parser.add_argument("--tail", choices=TAIL_MODES)
    return parser


def parse_story_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """저장된 계획은 묶음과 감정이 이미 정해져 있다. 함께 주면 무시되어 다른 조건으로 착각하므로 막는다."""
    parser = _parser()
    args = parser.parse_args(argv)
    if args.plan_from is not None and (args.unit or args.single_style):
        parser.error("--plan-from은 --unit, --single-style과 함께 쓸 수 없습니다")
    return args

"""진입점(run_clone, run_eval, run_preflight)이 같이 쓰는 인자와 클론 계획 조립. 모델을 import하지 않는다."""
import argparse
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import EvalSentence, load_eval_sentences, load_reference_scripts, load_speakers, select_speakers
from spike.clone.plan.clone_plan import CloneJob, PlanSettings, PrepareJob, plan_clones
from spike.clone.plan.experiment import Experiment, load_experiments, select
from spike.clone.layout import CONDITION_EXTENSION, OUTPUTS_DIR, RECORDINGS_DIR, Condition
from spike.clone.reference.ref_prep import PREP_VERSION

DEFAULT_CONDITION: Condition = "A"


@dataclass(frozen=True)
class PlannedRun:
    experiments: list[Experiment]
    speaker_ids: list[str]
    sentences: list[EvalSentence]
    jobs: list[PrepareJob | CloneJob]
    recordings: Path
    outputs: Path


def add_condition_argument(parser: argparse.ArgumentParser) -> None:
    """녹음 조건은 참조 파일 이름과 형식을 정한다. 폰 녹음은 B다."""
    parser.add_argument("--condition", choices=sorted(CONDITION_EXTENSION), default=DEFAULT_CONDITION)


def parse_plan_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiments", nargs="*")
    parser.add_argument("--speakers", nargs="*")
    parser.add_argument("--out", type=Path, default=OUTPUTS_DIR)
    return parser.parse_args()


def plan_from_args(args: argparse.Namespace) -> PlannedRun:
    experiments = select(load_experiments(), args.experiments)
    speakers = select_speakers(load_speakers(), args.speakers)
    speaker_ids = [s.id for s in speakers]
    sentences = load_eval_sentences()
    settings = PlanSettings(RECORDINGS_DIR, args.out, PREP_VERSION, {s.id: s.scripts for s in speakers})
    jobs = plan_clones(experiments, speaker_ids, sentences, load_reference_scripts(), settings)
    return PlannedRun(experiments, speaker_ids, sentences, jobs, RECORDINGS_DIR, args.out)

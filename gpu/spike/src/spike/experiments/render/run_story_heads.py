"""묶음 앞부분을 조건표대로 생성한다. GPU 전용. 조건 라벨은 폴더 이름이 아니라 run.json을 믿는다.

사용: uv run --extra gpu python -m spike.experiments.render.run_story_heads --dir outputs/story_passage --speaker s1b --out outputs/story_heads
"""
import argparse
import json
from functools import reduce
from pathlib import Path

from spike.clone.catalog import load_reference_scripts
from spike.clone.engine.clone_engine import QwenCloneEngine
from spike.clone.plan.experiment import load_experiments, select
from spike.render.trials.head_store import PLAN_NAME, load_head_plan
from spike.clone.reference.ref_prep import prepared_speaker_reference
from spike.render.trials.run_store import load_run, save_run
from spike.render.trials.story_heads import (
    HeadJob,
    HeadPlan,
    HeadSettings,
    context_units,
    head_file,
    head_jobs,
    head_record,
    pending_jobs,
    render_head,
)
from spike.render.story_render import Reference
from spike.render.story_store import load_chosen_units, load_unit_texts, save_story

CONDITION = "A"
STYLE = "calm"


def _settings(speaker: str, plan: HeadPlan) -> HeadSettings:
    experiment = select(load_experiments(), ["real_quiet"])[0]
    text = next(script.text for script in load_reference_scripts() if script.style == STYLE)
    reference = Reference(prepared_speaker_reference(speaker, CONDITION, STYLE), text)
    return HeadSettings(experiment.model, reference, plan.max_new_tokens)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--speaker", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--plan", default=PLAN_NAME)
    args = parser.parse_args()
    plan = load_head_plan(name=args.plan)
    texts = load_unit_texts(args.dir)
    previous = load_chosen_units(args.dir, context_units(plan))
    settings, engine = _settings(args.speaker, plan), QwenCloneEngine()

    def advance(done: list[dict], job: HeadJob) -> list[dict]:
        synthesis = render_head(job, engine, texts, previous, settings)
        file = head_file(job)
        save_story(args.out / file, synthesis.audio)
        record = head_record(job, synthesis, file)
        print(json.dumps(record, ensure_ascii=False), flush=True)
        records = [*done, record]
        save_run(args.out, records)
        return records

    finished = load_run(args.out)
    reduce(advance, pending_jobs(head_jobs(plan), finished), finished)


if __name__ == "__main__":
    main()

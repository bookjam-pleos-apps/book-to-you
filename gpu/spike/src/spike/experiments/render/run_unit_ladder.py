"""생성 단위 길이 사다리를 생성한다. GPU 전용. 중단되면 끝난 작업을 건너뛰고 이어 간다. 긴 단위가 있어 직접 호출만 쓴다.

사용: --with-editable ../../spike 환경에서 python -m spike.experiments.render.run_unit_ladder --plan-from outputs/q_base --speaker s1b --out outputs/q_ladder
excited와 soft는 --style을, 폰 녹음은 --condition B를 더한다. 결과가 섞이지 않게 --out을 나눈다.
"""
import argparse
from collections.abc import Sequence
from dataclasses import replace
from functools import reduce
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.compose.engine_backends import DIRECT_ENGINE_ID, Backend, load_backend
from spike.clone.plan.experiment import load_experiments, select
from spike.render.trials.run_store import load_run, save_run
from spike.render.speaker_references import speaker_references
from spike.story.story_draft import STYLES
from spike.story.story_plan import split_sentences
from spike.render.story_render import RenderSettings, render_sentence
from spike.render.story_store import load_plan, report_line, save_unit_audio
from spike.render.trials.unit_ladder import LadderJob, job_key, ladder_jobs, pending_jobs

EXPERIMENT = "real_quiet"


def _run_job(done: list[dict], job: LadderJob, backend: Backend, settings: RenderSettings, out: Path) -> list[dict]:
    rendered = render_sentence(job.sentence, backend.engine, backend.transcribe, replace(settings, seed=job.seed))
    file = f"{job_key(job)}.wav"
    save_unit_audio(out / file, rendered.audio)
    record = {"key": job_key(job), "target": job.target, "unit": job.unit, "file": file, **report_line(rendered)}
    print(f"{job_key(job)} {record['durationSec']}초 시도 {record['attempts']} CER {record['cer']}", flush=True)
    records = [*done, record]
    save_run(out, records)
    return records


def parse_ladder_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan-from", type=Path, required=True)
    parser.add_argument("--speaker", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--style", choices=STYLES, default=STYLES[0])
    add_condition_argument(parser)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_ladder_args()
    sentences = [sentence for unit in load_plan(args.plan_from) for sentence in split_sentences(unit.text)]
    experiment = select(load_experiments(), [EXPERIMENT])[0]
    backend = load_backend(DIRECT_ENGINE_ID)
    references = speaker_references(args.speaker, args.condition, {args.style}, backend.prepare_reference)
    settings = RenderSettings(experiment.model, experiment.seed, references)
    finished = load_run(args.out)
    jobs = pending_jobs(ladder_jobs(sentences, args.style), {record["key"] for record in finished})
    reduce(lambda done, job: _run_job(done, job, backend, settings, args.out), jobs, finished)


if __name__ == "__main__":
    main()

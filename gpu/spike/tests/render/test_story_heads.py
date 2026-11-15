from pathlib import Path

import numpy as np
import pytest
from fakes import rendered_passage

from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.render.trials.head_store import load_head_plan
from spike.render.trials.story_heads import (
    HeadCondition,
    HeadJob,
    HeadSettings,
    context_units,
    head_file,
    head_jobs,
    head_record,
    head_text,
    parse_head_plan,
    pending_jobs,
    render_head,
)
from spike.render.story_render import Reference

RATE = 1000
PLAN = load_head_plan()
CURRENT_CONDITION, CHAIN_CONDITION = PLAN.conditions
SETTINGS = HeadSettings("model", Reference(Path("/ref.wav"), "참조 대본"), 50)


class RecordingEngine:
    def __init__(self):
        self.requests: list[CloneRequest] = []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.requests.append(request)
        return Synthesis(Audio(np.zeros(10, dtype=np.float32), RATE), 1, 204)


def test_plan_covers_every_condition_unit_and_seed_once():
    jobs = head_jobs(PLAN)
    assert len(jobs) == 64
    assert len({head_file(job) for job in jobs}) == 64
    assert {job.condition.id for job in jobs} == {"current", "chain"}


def test_first_seed_of_the_past_render_stays_out_of_the_plan():
    assert 1234 not in PLAN.seeds


def test_only_previous_units_of_chosen_units_are_needed():
    assert context_units(PLAN) == [4, 5, 6, 7, 16, 19, 23, 24]


def test_unit_without_a_previous_unit_is_refused():
    raw = {"units": [0, 5], "seeds": [1], "conditions": [{"id": "chain", "chain": True}], "maxNewTokens": 50}
    with pytest.raises(ValueError, match="앞 묶음"):
        parse_head_plan(raw)


def test_finished_jobs_are_not_generated_again():
    jobs = head_jobs(PLAN)
    done = [{"file": str(head_file(job))} for job in jobs[:10]]
    assert pending_jobs(jobs, done) == jobs[10:]


def test_record_keeps_the_condition_label_and_junction():
    job = HeadJob(CHAIN_CONDITION, 5, 5000)
    record = head_record(job, Synthesis(Audio(np.zeros(1, dtype=np.float32), RATE), 12, 295), Path("chain/a.wav"))
    assert (record["condition"], record["chain"], record["unit"], record["seed"]) == ("chain", True, 5, 5000)
    assert record["file"] == "chain/a.wav"
    assert record["junctionSec"] == pytest.approx(0.4)


def test_chain_job_passes_previous_unit_and_token_limit():
    engine = RecordingEngine()
    job = HeadJob(CHAIN_CONDITION, 2, 5000)
    render_head(job, engine, ["영", "일", "이"], {1: rendered_passage("일")}, SETTINGS)
    [request] = engine.requests
    assert (request.text, request.seed, request.max_new_tokens, request.non_streaming) == ("이", 5000, 50, True)
    assert request.context is not None and request.context.text == "일"


def test_current_job_has_no_context_and_needs_no_previous_audio():
    engine = RecordingEngine()
    render_head(HeadJob(CURRENT_CONDITION, 2, 5000), engine, ["영", "일", "이"], {}, SETTINGS)
    assert engine.requests[0].context is None
    assert engine.requests[0].max_new_tokens == 50


def test_quote_plan_compares_only_the_opening_quote():
    plan = load_head_plan(name="story-heads-quote.json")
    plain, unquoted = plan.conditions
    assert not plain.strip_opening_quote and unquoted.strip_opening_quote
    assert context_units(plan) == []
    assert len(head_jobs(plan)) == 48


def test_opening_quote_is_removed_only_for_its_condition():
    condition = HeadCondition("unquoted", False, True)
    assert head_text(condition, "“오오, 말하였니?” 합니다.") == "오오, 말하였니?” 합니다."
    assert head_text(HeadCondition("current", False), "“오오") == "“오오"
    assert head_text(condition, "왕녀가 “오오") == "왕녀가 “오오"

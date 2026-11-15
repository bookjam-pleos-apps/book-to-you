import json
from pathlib import Path

import numpy as np
import pytest
from fake_compose_service import FakeService

from spike.sound.audio import Audio
from spike.compose.compose_client import DEFAULT_URL, ComposeCloneEngine, ComposeError, prepare_reference_via_compose
from spike.compose.engine_backends import (
    COMPOSE_ENGINE_ID,
    DIRECT_ENGINE_ID,
    ENGINE_FACTORIES,
    load_backend,
    load_engines,
    reference_preparer,
    story_option_problems,
)
from spike.clone.plan.experiment import load_experiments, select, unknown_engines
from spike.clone.reference.ref_prep import prepare_reference

SAMPLE_RATE = 24000


def test_compose_engine_loads_without_torch():
    assert isinstance(load_engines([COMPOSE_ENGINE_ID])[COMPOSE_ENGINE_ID], ComposeCloneEngine)


def test_compose_backend_uses_the_service_for_every_step():
    backend = load_backend(COMPOSE_ENGINE_ID)

    assert isinstance(backend.engine, ComposeCloneEngine)


def test_compose_backend_sends_every_step_to_the_given_url(compose_service: FakeService, tmp_path: Path):
    backend = load_backend(COMPOSE_ENGINE_ID, compose_service.url)
    compose_service.reply = json.dumps("안녕").encode()
    backend.transcribe(Audio(np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE))
    compose_service.reply = json.dumps({"stdout": "", "stderr": "fake", "exit_code": 1}).encode()
    with pytest.raises(ComposeError, match="fake"):
        backend.prepare_reference(tmp_path / "raw.wav", tmp_path / "prepared.wav")

    assert backend.engine == ComposeCloneEngine(compose_service.url)
    assert compose_service.workflow_ids() == ["transcribe", "prepare-reference"]


def test_compose_backend_defaults_to_the_repository_service_url():
    assert load_backend(COMPOSE_ENGINE_ID).engine == ComposeCloneEngine(DEFAULT_URL)


def test_every_experiment_names_a_registered_engine():
    assert unknown_engines(load_experiments(), ENGINE_FACTORIES) == []


def test_compose_experiment_differs_from_the_direct_one_only_by_engine():
    direct, composed = select(load_experiments(), ["real_quiet", "real_quiet_compose"])

    assert (direct.engine, composed.engine) == (DIRECT_ENGINE_ID, COMPOSE_ENGINE_ID)
    assert (direct.model, direct.seed, direct.non_streaming) == (composed.model, composed.seed, composed.non_streaming)


def test_reference_goes_through_the_service_only_when_every_engine_does():
    assert reference_preparer([COMPOSE_ENGINE_ID, COMPOSE_ENGINE_ID]) is prepare_reference_via_compose
    assert reference_preparer([COMPOSE_ENGINE_ID, DIRECT_ENGINE_ID]) is prepare_reference
    assert reference_preparer([DIRECT_ENGINE_ID]) is prepare_reference


def test_compose_story_accepts_sentence_units():
    assert story_option_problems(COMPOSE_ENGINE_ID, False, "sentence", False) == []


@pytest.mark.parametrize(
    ("chain", "unit", "from_plan"),
    [(True, "sentence", False), (False, "passage", False), (False, "whole", False), (False, "paragraph", False), (False, "sentence", True)],
)
def test_compose_story_refuses_options_that_would_fail_mid_render(chain: bool, unit: str, from_plan: bool):
    assert len(story_option_problems(COMPOSE_ENGINE_ID, chain, unit, from_plan)) == 1


def test_direct_story_keeps_every_option():
    assert story_option_problems(DIRECT_ENGINE_ID, True, "whole", True) == []

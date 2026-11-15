import json
from pathlib import Path

import pytest
from job_fixture import THREE_UNIT_LINES, example_job

from spike.render.batch.batch_spec import batch_spec
from spike.render.attempt.render_attempts import AttemptSpec
from spike.run_render_batch_step import parse_args, run_step



def _spec(text: str, unit_index: int, reference: str = "/ref/calm.wav", seed: int = 1234, budget: int = 100) -> AttemptSpec:
    return AttemptSpec(unit_index, 0, text, text, reference, "대본", seed, budget, f"/a/{unit_index}.wav")


def test_a_batch_sends_every_text_once_with_the_longest_budget():
    spec = batch_spec("/job", [_spec("가", 1, budget=40), _spec("나", 3, budget=90)])

    assert (spec.texts, spec.max_new_tokens, spec.batch_size) == (("가", "나"), 90, 2)
    assert [(unit.unit_index, unit.attempt) for unit in spec.units] == [(1, 0), (3, 0)]


@pytest.mark.parametrize("other", [_spec("나", 2, reference="/ref/child.wav"), _spec("나", 2, seed=2234)])
def test_a_batch_with_two_references_or_seeds_is_refused(other: AttemptSpec):
    with pytest.raises(ValueError):
        batch_spec("/job", [_spec("가", 1), other])


def test_the_cli_spec_follows_the_unit_specs_and_clears_a_first_attempt(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    job_dir = example_job(tmp_path, lines=THREE_UNIT_LINES)
    leftover = job_dir / "attempts" / "0002-a2.json"
    leftover.parent.mkdir()
    leftover.write_text("{}", encoding="utf-8")

    code = run_step(parse_args(["spec", f"--job={job_dir}", "--units=[0, 2]", "--attempt=0"]))

    spec = json.loads(capsys.readouterr().out)
    assert code == 0 and spec["batch_size"] == 2 and spec["cleared"] == ["0002-a2.json"]
    assert [unit["unit_index"] for unit in spec["units"]] == [0, 2]
    assert spec["seed"] == 1234 and not leftover.exists()

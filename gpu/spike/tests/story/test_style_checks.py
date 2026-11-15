import json
from pathlib import Path

import pytest

from spike.story.story_draft import STYLES
from spike.clone.reference.style_checks import Bound, StyleCheck, load_style_checks


def _file(tmp_path: Path, checks: list[dict]) -> Path:
    path = tmp_path / "recording-scripts.json"
    path.write_text(json.dumps({"styleChecks": checks}), encoding="utf-8")
    return path


def test_product_checks_keep_the_measured_criteria():
    assert load_style_checks() == [
        StyleCheck("soft", (Bound("speechRateChange", at_most=-0.05), Bound("pitchShiftSemitones", at_most=-0.5))),
        StyleCheck("deep", (Bound("pitchShiftSemitones", at_most=-2.0),)),
        StyleCheck("child", (Bound("pitchShiftSemitones", at_least=3.0),)),
    ]


def test_product_checks_name_known_styles():
    assert {check.style for check in load_style_checks()} <= set(STYLES)


def test_a_file_without_checks_checks_nothing(tmp_path: Path):
    path = tmp_path / "recording-scripts.json"
    path.write_text("{}", encoding="utf-8")

    assert load_style_checks(path) == []


@pytest.mark.parametrize("check", [
    {"style": "calm", "anyOf": [{"metric": "pitchShiftSemitones", "atLeast": 1.0}]},
    {"style": "deep", "anyOf": []},
    {"style": "deep", "anyOf": [{"metric": "pitchShift", "atMost": -2.0}]},
    {"style": "deep", "anyOf": [{"metric": "pitchShiftSemitones"}]},
    {"style": "deep", "anyOf": [{"metric": "pitchShiftSemitones", "atLeast": -3.0, "atMost": -2.0}]},
])
def test_a_check_that_could_silently_pass_or_block_everyone_is_refused(tmp_path: Path, check: dict):
    with pytest.raises(ValueError):
        load_style_checks(_file(tmp_path, [check]))


def test_two_checks_for_one_style_are_refused(tmp_path: Path):
    deep = {"style": "deep", "anyOf": [{"metric": "pitchShiftSemitones", "atMost": -2.0}]}

    with pytest.raises(ValueError):
        load_style_checks(_file(tmp_path, [deep, deep]))

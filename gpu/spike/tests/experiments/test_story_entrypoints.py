"""구간 쌍 듣기 파일 만들기와 판정을 실제 파일로 끝까지 돌린다. 임시 스크립트 없이 진입점으로 판정할 수 있어야 한다."""
import sys
from dataclasses import replace
from functools import reduce
from pathlib import Path

import numpy as np
import pytest
from fakes import rendered_passage

from spike.experiments.listening import run_story_pairs, run_story_verdict
from spike.listening.listening_store import load_key, pairs_folder
from spike.render.story_render import RenderedSentence, stitch
from spike.render.story_store import STORY_NAME, save_progress, save_story

UNIT_COUNT = 24
CHAIN_FRONT, CHAIN_BACK = "앞앞앞", "뒤뒤뒤"


def _advance(folder: Path, done: list[RenderedSentence], unit: RenderedSentence) -> list[RenderedSentence]:
    saved = [*done, unit]
    save_progress(folder, saved)
    return saved


def _saved_render(folder: Path, context_used: bool = True) -> Path:
    units = [replace(rendered_passage(f"묶음 {index}"), context_used=context_used and index > 0, prompt_codes=205) for index in range(UNIT_COUNT)]
    reduce(lambda done, unit: _advance(folder, done, unit), units, [])
    save_story(folder / STORY_NAME, stitch(units, "none"))
    return folder


def _run(monkeypatch: pytest.MonkeyPatch, entry, *argv: str) -> None:
    monkeypatch.setattr(sys, "argv", ["prog", *argv])
    entry.main()


@pytest.fixture
def built_pairs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> tuple[Path, str]:
    baseline, chain = _saved_render(tmp_path / "baseline"), _saved_render(tmp_path / "chain")
    monkeypatch.setattr(run_story_pairs, "reference_lead", lambda *_: np.ones(100, dtype=np.float32))
    _run(monkeypatch, run_story_pairs, "--baseline", str(baseline), "--dir", str(chain), "--speaker", "s1b")
    return chain, capsys.readouterr().out


def _chain_picks(render: Path) -> list[str]:
    key, _ = load_key(pairs_folder(render))
    return [CHAIN_FRONT if first["condition"] == "chain" else CHAIN_BACK for first in key["clips"][::2]]


def _verdict_args(render: Path, picks: list[str], *marks: str) -> list[str]:
    return ["--dir", str(render), "--picks", *picks, "--marks", *marks, "--repeats", "0", "--playable", "yes"]


def test_building_pairs_never_prints_a_condition(built_pairs):
    chain, printed = built_pairs
    assert "쌍 6:" in printed
    assert "chain" not in printed.replace(str(chain), "")
    assert "current" not in printed


def test_pairs_are_not_rebuilt_after_listening(built_pairs, tmp_path: Path, monkeypatch):
    chain, _ = built_pairs
    with pytest.raises(FileExistsError):
        _run(monkeypatch, run_story_pairs, "--baseline", str(tmp_path / "baseline"), "--dir", str(chain), "--speaker", "s1b")


def test_verdict_passes_when_every_answer_favours_chain(built_pairs, monkeypatch, capsys):
    chain, _ = built_pairs
    _run(monkeypatch, run_story_verdict, *_verdict_args(chain, _chain_picks(chain)))
    assert "passed=True" in capsys.readouterr().out


def test_verdict_reports_where_each_mark_landed(built_pairs, monkeypatch, capsys):
    chain, _ = built_pairs
    _run(monkeypatch, run_story_verdict, *_verdict_args(chain, _chain_picks(chain), "0:05", "0:06", "0:08", "0:10", "0:12"))
    printed = capsys.readouterr().out
    assert "0:05  경계 2번 (시작 후 +0.4초)" in printed
    assert "boundary_marks=4" in printed
    assert "passed=False" in printed


def test_verdict_refuses_a_wrong_number_of_answers(built_pairs, monkeypatch):
    chain, _ = built_pairs
    with pytest.raises(ValueError, match="앞/뒤"):
        _run(monkeypatch, run_story_verdict, *_verdict_args(chain, [*_chain_picks(chain), CHAIN_FRONT]))


def test_invalid_render_gets_no_verdict(tmp_path: Path, monkeypatch, capsys):
    render = _saved_render(tmp_path, context_used=False)
    _run(monkeypatch, run_story_verdict, *_verdict_args(render, [CHAIN_FRONT]))
    printed = capsys.readouterr().out
    assert "유효성 미달" in printed
    assert "passed" not in printed

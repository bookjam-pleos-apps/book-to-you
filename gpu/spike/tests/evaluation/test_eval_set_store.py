import json
from functools import reduce
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from spike.evaluation.eval_set.eval_items import Item
from spike.evaluation.eval_set.eval_set_diff import set_changes
from spike.evaluation.eval_set.eval_set_rows import item_row
from spike.evaluation.eval_set.eval_set_store import check_picks, latest_set, load_listenings, load_render, set_path, write_new_set

RATE = 24000


def write_silence(written: tuple[Path, ...], job: tuple[Path, int]) -> tuple[Path, ...]:
    path, frames = job
    sf.write(path, np.zeros(frames, dtype=np.float32), RATE)
    return written + (path,)


def write_render(folder: Path, lengths: list[int]) -> None:
    (folder / "units").mkdir(parents=True)
    rows = [{"text": f"문장{i}", "style": "calm", "durationSec": round(n / RATE, 2), "pauseAfterMs": 500} for i, n in enumerate(lengths)]
    (folder / "report.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    reduce(write_silence, [(folder / "units" / f"{i:04d}.wav", n) for i, n in enumerate(lengths)], ())


def test_unit_lengths_come_from_the_wav_not_the_rounded_report(tmp_path: Path):
    write_render(tmp_path / "outputs" / "exp" / "r", [RATE + 7, RATE])
    render = load_render(tmp_path, "exp/r", None)
    assert render.units[0].duration_sec == (RATE + 7) / RATE
    assert render.audio == ("outputs/exp/r/units/0000.wav", "outputs/exp/r/units/0001.wav")


def test_picked_render_takes_each_unit_from_its_chosen_candidate(tmp_path: Path):
    write_render(tmp_path / "outputs" / "exp" / "s1", [RATE, RATE])
    write_render(tmp_path / "outputs" / "exp" / "s2", [2 * RATE, 2 * RATE])
    picks = {"folders": ["outputs/exp/s1", "outputs/exp/s2"], "picks": [1, 0]}
    (tmp_path / "outputs" / "exp" / "picked.json").write_text(json.dumps(picks), encoding="utf-8")
    render = load_render(tmp_path, "exp/picked", "exp/picked.json")
    assert [u.duration_sec for u in render.units] == [2.0, 1.0]
    assert render.audio == ("outputs/exp/s2/units/0000.wav", "outputs/exp/s1/units/0001.wav")


def test_old_picks_files_with_only_renders_still_load(tmp_path: Path):
    write_render(tmp_path / "outputs" / "exp" / "s1", [RATE])
    (tmp_path / "outputs" / "exp" / "picked.json").write_text(json.dumps({"renders": ["outputs/exp/s1"], "picks": [0]}), encoding="utf-8")
    assert load_render(tmp_path, "exp/picked", "exp/picked.json").audio == ("outputs/exp/s1/units/0000.wav",)


def listenings_file(tmp_path: Path, kind: str) -> Path:
    data = {"kinds": {"tone_jump": "", "not_my_voice": ""}, "listenings": [
        {"id": "x", "render": "exp/r", "file": "x.wav", "marks": [{"at": "0:01", "kind": kind, "quote": "튐"}]},
        {"id": "y", "render": "exp/p", "file": "y.wav", "picks": "exp/p.json", "marks": []},
    ]}
    path = tmp_path / "eval-listenings.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_listenings_are_read_with_their_picks(tmp_path: Path):
    listenings, picks = load_listenings(listenings_file(tmp_path, "tone_jump"))
    assert [(li.id, li.marks[0].kind if li.marks else None) for li in listenings] == [("x", "tone_jump"), ("y", None)]
    assert picks == {"exp/p": "exp/p.json"}


@pytest.mark.parametrize("kind", ["tone-jump", "voice_or_tone"])
def test_an_unknown_or_undeclared_kind_stops_the_build(tmp_path: Path, kind: str):
    with pytest.raises(ValueError, match="모르는 지목 종류"):
        load_listenings(listenings_file(tmp_path, kind))


def test_a_set_version_is_written_once_and_never_overwritten(tmp_path: Path):
    assert latest_set(tmp_path) == (0, None)
    write_new_set(set_path(tmp_path, 1), 1, [{"id": "r#1"}], "note")
    with pytest.raises(FileExistsError):
        write_new_set(set_path(tmp_path, 1), 1, [], "note")
    write_new_set(set_path(tmp_path, 2), 2, [], "note")
    assert latest_set(tmp_path) == (2, tmp_path / "eval-set-v2.json")


def test_item_row_uses_camel_case_and_the_unit_text(tmp_path: Path):
    write_render(tmp_path / "outputs" / "exp" / "r", [RATE, RATE])
    render = load_render(tmp_path, "exp/r", None)
    row = item_row(Item(id="exp/r#1", label="normal", render="exp/r", unit=1, kind=None, sure=True, paired_with="exp/r#0"), render, {})
    assert (row["pairedWith"], row["text"], row["durationSec"], row["observations"]) == ("exp/r#0", "문장1", 1.0, [])


def test_set_changes_report_additions_removals_and_field_changes():
    old = [{"id": "a#1", "label": "flagged", "tier": "core"}, {"id": "a#2", "label": "normal"}]
    new = [{"id": "a#1", "label": "flagged", "tier": "reserve", "observations": [{"listening": "x", "mark": "0:01"}]}, {"id": "a#3", "label": "normal"}]
    assert set_changes(old, new) == ["+ a#3", "- a#2", "~ a#1: tier 'core'→'reserve', 관찰 []→['x@0:01']"]
    assert set_changes(new, new) == []


def test_set_changes_see_audio_and_length_when_the_label_stays():
    old = [{"id": "a#1", "label": "flagged", "audio": "s1/0001.wav", "durationSec": 2.0}]
    new = [{"id": "a#1", "label": "flagged", "audio": "s2/0001.wav", "durationSec": 2.4}]
    assert set_changes(old, new) == ["~ a#1: audio 's1/0001.wav'→'s2/0001.wav', durationSec 2.0→2.4"]


def test_set_changes_see_observation_details_behind_the_same_marks():
    old = [{"id": "a#1", "observations": [{"listening": "x", "mark": "0:01", "offsetSec": 0.5}]}]
    new = [{"id": "a#1", "observations": [{"listening": "x", "mark": "0:01", "offsetSec": 0.9}]}]
    assert set_changes(old, new) == ["~ a#1: 관찰 세부값(오프셋, 확실 여부, 파일)"]


@pytest.mark.parametrize(("picks", "lengths", "message"), [([0], [2, 2], "맞지 않는다"), ([0, 2], [2, 2], "밖을 가리키는"), ([0, 1], [2, 3], "맞지 않는다")])
def test_picks_must_cover_every_unit_of_every_candidate(picks: list[int], lengths: list[int], message: str):
    with pytest.raises(ValueError, match=message):
        check_picks(picks, lengths, "p.json")


def test_a_short_picks_file_stops_loading_the_render(tmp_path: Path):
    write_render(tmp_path / "outputs" / "exp" / "s1", [RATE, RATE])
    picks = {"folders": ["outputs/exp/s1"], "picks": [0]}
    (tmp_path / "outputs" / "exp" / "picked.json").write_text(json.dumps(picks), encoding="utf-8")
    with pytest.raises(ValueError, match="exp/picked.json"):
        load_render(tmp_path, "exp/picked", "exp/picked.json")

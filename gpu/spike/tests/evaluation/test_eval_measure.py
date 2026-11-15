import json

import numpy as np
import pytest
from fakes import SAMPLE_RATE, FixedPitchTracker, gliding_f0, silence, tone

from spike.sound.audio import Audio
from spike.evaluation.render_eval.eval_measure import HEAD_SEC, TAIL_SEC, Measured, edge, measure_unit, measurement_order, reference_paths, render_rows
from spike.evaluation.eval_set.eval_items import Render
from spike.evaluation.render_eval.eval_measure_sources import load_extra_renders, load_reference_templates, report_rows
from spike.evaluation.eval_set.eval_set import Unit

ROW_KEYS = {"style", "durationSec", "speechSec", "cer", "attempts", "rate", "f0", "f0Range", "f0Head", "f0Tail",
            "simWhole", "simHead", "quote"}


class LengthEmbedder:
    """길이(초)와 1로 된 2차원 임베딩. 어느 구간을 넣었는지 값으로 확인한다."""

    def embed(self, audio: Audio) -> np.ndarray:
        return np.array([len(audio.samples) / audio.sample_rate, 1.0])


def _padded_speech(sec: float) -> Audio:
    return Audio(np.concatenate([silence(0.5), tone(sec=sec), silence(0.5)]), SAMPLE_RATE)


def _measure(text: str = "“가나다”", sec: float = 5.0):
    unit = Unit(text=text, style="calm", duration_sec=sec + 1.0, pause_after_ms=0)
    refs = {"s4": np.array([1.0, 0.0])}
    tracker = FixedPitchTracker(gliding_f0(200, 400))
    return measure_unit(_padded_speech(sec), unit, {"cer": 0.0, "attempts": 1}, LengthEmbedder(), tracker, lambda style: refs)


def test_unit_row_keeps_the_metric_agreement_contract_and_measures_speech_only():
    measured = _measure()
    assert set(measured.row) == ROW_KEYS
    assert measured.row["speechSec"] == pytest.approx(5.0, abs=0.05)
    assert measured.head[0] == pytest.approx(HEAD_SEC) and measured.tail[0] == pytest.approx(TAIL_SEC)
    assert measured.row["rate"] == pytest.approx(3 / measured.row["speechSec"])
    assert measured.row["quote"] is True
    assert set(measured.row["simHead"]) == {"s4"}


def test_short_speech_head_is_the_whole_speech():
    measured = _measure(text="가나", sec=1.0)
    assert measured.head[0] == pytest.approx(measured.whole[0])
    assert measured.row["quote"] is False


def test_edge_takes_the_start_or_the_end():
    audio = Audio(np.arange(10, dtype=np.float32), 2)
    assert edge(audio, 1.5, at_end=False).samples.tolist() == [0, 1, 2]
    assert edge(audio, 1.5, at_end=True).samples.tolist() == [7, 8, 9]


def _fake(whole: list[float], head: list[float], tail: list[float]) -> Measured:
    return Measured(row={"style": "calm"}, whole=np.array(whole), head=np.array(head), tail=np.array(tail))


def test_render_rows_compare_to_the_render_centroid_and_the_previous_tail():
    rows = render_rows("r", [_fake([1, 0], [1, 0], [0, 1]), _fake([0, 1], [0, 1], [1, 0])])
    assert [(r["render"], r["unit"]) for r in rows] == [("r", 0), ("r", 1)]
    assert rows[0]["simPrev"] is None
    assert rows[1]["simPrev"] == pytest.approx(1.0)
    assert [r["simCentroid"] for r in rows] == pytest.approx([np.sqrt(0.5)] * 2)


def test_empty_render_has_no_rows():
    assert render_rows("r", []) == []


def test_measurement_order_keeps_listened_order_and_appends_only_new_extras():
    assert measurement_order(["a", "b", "a"], ["b", "c"]) == ["a", "b", "c"]


def test_reference_paths_fill_the_unit_style():
    assert reference_paths({"s4": "rec/B_{style}.m4a", "s1calm": "rec/A_calm.wav"}, "soft") == {
        "s4": "rec/B_soft.m4a", "s1calm": "rec/A_calm.wav"}


def test_reference_and_extra_render_files_are_validated(tmp_path):
    refs, extra = tmp_path / "refs.json", tmp_path / "extra.json"
    refs.write_text(json.dumps({"references": {"s4": {"path": "rec/B_{style}.m4a"}}}), encoding="utf-8")
    extra.write_text(json.dumps({"renders": {"a": None, "b": "b.json"}}), encoding="utf-8")
    assert load_reference_templates(refs, tmp_path) == {"s4": str(tmp_path / "rec/B_{style}.m4a")}
    assert load_extra_renders(extra) == {"a": None, "b": "b.json"}
    refs.write_text(json.dumps({"references": {"s4": {"note": "경로 없음"}}}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_reference_templates(refs, tmp_path)


def test_report_rows_follow_the_folder_of_each_picked_unit_wav(tmp_path):
    reports = {"s1": [{"cer": 0.1}, {"cer": 0.2}], "s2": [{"cer": 0.3}, {"cer": 0.4}]}
    [(tmp_path / "outputs" / name).mkdir(parents=True) for name in reports]
    [(tmp_path / "outputs" / name / "report.json").write_text(json.dumps(rows), encoding="utf-8") for name, rows in reports.items()]
    render = Render(units=(), audio=("outputs/s2/units/0000.wav", "outputs/s1/units/0001.wav"))
    assert report_rows(tmp_path, render) == [{"cer": 0.3}, {"cer": 0.2}]

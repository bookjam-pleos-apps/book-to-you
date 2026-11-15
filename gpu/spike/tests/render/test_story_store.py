import json
from dataclasses import replace
from functools import reduce
from pathlib import Path

import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.story.story_plan import SpokenTail, StorySentence
from spike.render.voice.voice_note import VoiceNote
from spike.render.story_render import RenderedSentence, stitch, unit_starts, with_pause
from spike.render.story_store import (
    REPORT_NAME,
    unit_path,
    load_chosen_units,
    load_plan,
    load_unit_texts,
    load_units,
    refuse_overwriting_plan,
    save_progress,
)

RATE = 24000
CHAIN_KEYS = {"contextUsed", "genMs", "promptCodes"}


def _rendered(level: float, pause_ms: int = 500) -> RenderedSentence:
    audio = Audio(np.full(RATE, level, dtype=np.float32), RATE)
    return RenderedSentence(StorySentence("가나다", "calm", pause_ms), audio, "가나다", 0.0, 2, True, 2234, 0.5)


def _saved(tmp_path: Path, items: list[RenderedSentence]) -> None:
    reduce(lambda done, item: _saved_one(tmp_path, [*done, item]), items, [])


def _saved_one(tmp_path: Path, done: list[RenderedSentence]) -> list[RenderedSentence]:
    save_progress(tmp_path, done)
    return done


def test_saved_units_load_back_unchanged(tmp_path: Path):
    items = [_rendered(0.05), _rendered(0.3)]
    _saved(tmp_path, items)
    [first, second] = load_units(tmp_path)
    assert first.sentence == items[0].sentence
    assert (first.seed, first.temperature, first.attempts) == (2234, 0.5, 2)
    assert np.array_equal(second.audio.samples, items[1].audio.samples)


def test_progress_survives_a_render_that_stops_midway(tmp_path: Path):
    save_progress(tmp_path, [_rendered(0.05)])
    assert len(load_units(tmp_path)) == 1


def test_report_records_gain_for_listening_notes(tmp_path: Path):
    save_progress(tmp_path, [_rendered(0.05)])
    [line] = json.loads((tmp_path / REPORT_NAME).read_text(encoding="utf-8"))
    assert line["gainDb"] == pytest.approx(6.02, abs=0.01)
    assert line["pauseAfterMs"] == 500


def test_reassembling_with_no_leveling_keeps_original_samples(tmp_path: Path):
    _saved(tmp_path, [_rendered(0.05), _rendered(0.3)])
    story = stitch(load_units(tmp_path), "none")
    assert (float(story.samples[0]), float(story.samples[RATE + RATE // 2])) == pytest.approx((0.05, 0.3))


def test_per_unit_leveling_brings_units_together(tmp_path: Path):
    _saved(tmp_path, [_rendered(0.05), _rendered(0.3)])
    story = stitch(load_units(tmp_path), "per_unit")
    assert float(story.samples[0]) == pytest.approx(float(story.samples[RATE + RATE // 2]), abs=1e-3)


def test_unit_starts_match_stitched_positions():
    items = [_rendered(0.1, 500), _rendered(0.1, 900), _rendered(0.1, 0)]
    assert unit_starts(items) == [0, RATE + RATE // 2, 2 * RATE + RATE // 2 + RATE * 900 // 1000]
    assert len(stitch(items, "none").samples) == 3 * RATE + RATE // 2 + RATE * 900 // 1000


def test_with_pause_overrides_every_unit():
    assert {item.sentence.pause_after_ms for item in with_pause([_rendered(0.1, 500), _rendered(0.1, 900)], 300)} == {300}


def test_chosen_units_load_without_the_other_audio_files(tmp_path: Path):
    _saved(tmp_path, [_rendered(0.05), _rendered(0.3), _rendered(0.1)])
    unit_path(tmp_path, 0).unlink()
    unit_path(tmp_path, 2).unlink()
    chosen = load_chosen_units(tmp_path, [1])
    assert list(chosen) == [1]
    assert float(chosen[1].audio.samples[0]) == pytest.approx(0.3)


def test_unit_texts_need_only_the_report(tmp_path: Path):
    _saved(tmp_path, [_rendered(0.05), _rendered(0.3)])
    unit_path(tmp_path, 0).unlink()
    unit_path(tmp_path, 1).unlink()
    assert load_unit_texts(tmp_path) == ["가나다", "가나다"]


def test_chain_fields_survive_saving(tmp_path: Path):
    save_progress(tmp_path, [replace(_rendered(0.05), context_used=True, gen_ms=120, prompt_codes=430)])
    [unit] = load_units(tmp_path)
    assert (unit.context_used, unit.gen_ms, unit.prompt_codes) == (True, 120, 430)


def test_repeated_unit_reports_its_head_share_and_a_suspect_flag(tmp_path: Path):
    title = replace(_rendered(0.05), sentence=StorySentence("개구리 왕자", "calm", 500, tail=SpokenTail("개구리 왕자.", "repeat")), head_share=0.8)
    _saved(tmp_path, [title, _rendered(0.05)])
    lines = json.loads((tmp_path / REPORT_NAME).read_text(encoding="utf-8"))
    assert [(line["headShare"], line["repeatSuspect"]) for line in lines] == [(0.8, True), (None, None)]
    assert load_units(tmp_path)[0].head_share == 0.8


def test_report_from_before_chaining_still_loads(tmp_path: Path):
    save_progress(tmp_path, [_rendered(0.05)])
    path = tmp_path / REPORT_NAME
    lines = json.loads(path.read_text(encoding="utf-8"))
    path.write_text(json.dumps([{k: v for k, v in line.items() if k not in CHAIN_KEYS} for line in lines]), encoding="utf-8")
    [unit] = load_units(tmp_path)
    assert (unit.context_used, unit.gen_ms, unit.prompt_codes) == (False, None, None)


def test_plan_reads_text_and_pauses_without_audio(tmp_path: Path):
    _saved(tmp_path, [_rendered(0.05, 500), _rendered(0.3, 900)])
    unit_path(tmp_path, 0).unlink()
    unit_path(tmp_path, 1).unlink()
    assert load_plan(tmp_path) == [StorySentence("가나다", "calm", 500), StorySentence("가나다", "calm", 900)]


def test_writing_over_the_plan_folder_is_refused_even_through_a_link(tmp_path: Path):
    source = tmp_path / "source"
    source.mkdir()
    link = tmp_path / "link"
    link.symlink_to(source)
    with pytest.raises(ValueError, match="다시 쓸 수 없습니다"):
        refuse_overwriting_plan(source, link)
    refuse_overwriting_plan(source, tmp_path / "other")


def test_a_voice_checked_unit_reports_its_scores_and_whether_it_was_replaced(tmp_path: Path):
    note = VoiceNote("child", 0.31234, 0.2, 2, True)
    _saved(tmp_path, [replace(_rendered(0.05), voice=note), _rendered(0.05)])

    lines = json.loads((tmp_path / REPORT_NAME).read_text(encoding="utf-8"))

    assert lines[0]["voice"] == {"judgedStyle": "child", "group": 0.3123, "reference": 0.2, "rerolls": 2, "fallback": True}
    assert lines[1]["voice"] is None

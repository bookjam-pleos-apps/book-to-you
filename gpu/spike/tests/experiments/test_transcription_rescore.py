from pathlib import Path

import pytest
from fakes import rendered_passage

from spike.sound.audio import Audio
from spike.experiments.measure.run_transcription_rescore import chosen_indices, rescored_rows, result_name, transcribed_units
from spike.render.story_store import save_progress
from spike.render.trials.transcription_rescore import (
    LONG,
    NEWLY_FAILED,
    NEWLY_PASSED,
    NO_SPEECH,
    NOT_TRANSCRIBED,
    SAME,
    SHORT,
    UnitTranscripts,
    rescore_row,
    rescore_unit,
    summarize_rows,
)

TEXT = "어부는 바다로 나갔어요 그리고 그물을 던졌어요"
MISSING_HALF = "어부는 바다로 나갔어요"


def unit(old: str, *segments: str, is_long: bool = True) -> UnitTranscripts:
    return UnitTranscripts("demo/fisherman", 0, TEXT, 35.0 if is_long else 10.0, is_long, old, segments)


@pytest.mark.parametrize(
    ("old", "segments", "category"),
    [
        (TEXT, ("어부는 바다로 나갔어요", "그리고 그물을 던졌어요"), SAME),
        (TEXT, (MISSING_HALF,), NEWLY_FAILED),
        (MISSING_HALF, (TEXT,), NEWLY_PASSED),
        (MISSING_HALF, (MISSING_HALF,), SAME),
        (TEXT, (), NO_SPEECH),
        ("", (TEXT,), NOT_TRANSCRIBED),
    ],
)
def test_each_unit_falls_into_one_category(old: str, segments: tuple[str, ...], category: str):
    assert rescore_unit(unit(old, *segments)).category == category


def test_segments_are_scored_as_one_transcript():
    rescore = rescore_unit(unit(TEXT, "어부는 바다로 나갔어요", "그리고 그물을 던졌어요"))

    assert rescore.new_cer == rescore.old_cer == 0


def test_summary_counts_every_unit_once_per_window():
    rows = [rescore_row(rescore_unit(item)) for item in (unit(TEXT, TEXT), unit(TEXT, MISSING_HALF), unit(TEXT, TEXT, is_long=False))]

    summary = summarize_rows(rows)

    assert summary == {LONG: {NEWLY_FAILED: 1, SAME: 1}, SHORT: {SAME: 1}}
    assert sum(count for window in summary.values() for count in window.values()) == len(rows)


def test_long_only_picks_units_at_or_past_the_rounded_window():
    assert chosen_indices([29.99, 30.0, 33.44], long_only=True) == [1, 2]
    assert chosen_indices([29.99, 30.0, 33.44], long_only=False) == [0, 1, 2]


def test_result_names_stay_inside_the_output_folder():
    assert result_name(Path("outputs/demo_s4/fisherman_calm")) == "outputs__demo_s4__fisherman_calm.json"
    assert not result_name(Path("/tmp/demo/redhood")).startswith("/")


class EchoSegments:
    def __init__(self) -> None:
        self.calls = 0

    def transcribe_segments(self, audio: Audio) -> list[str]:
        self.calls += 1
        return ["앞", "묶음"]


def _saved_render(root: Path) -> Path:
    render = root / "demo" / "redhood"
    save_progress(render, [rendered_passage("앞 묶음")])
    return render


def test_saved_render_is_read_back_with_its_old_transcript(tmp_path: Path):
    render = _saved_render(tmp_path)

    units = transcribed_units(render, long_only=False, transcriber=EchoSegments())

    assert [(item.render, item.index, item.old, item.new_segments, item.is_long) for item in units] == [
        (str(render), 0, "앞 묶음", ("앞", "묶음"), False)
    ]


def test_a_finished_render_is_not_transcribed_again(tmp_path: Path):
    render, transcriber = _saved_render(tmp_path), EchoSegments()

    first = rescored_rows(render, tmp_path / "out", long_only=False, transcriber=transcriber)
    again = rescored_rows(render, tmp_path / "out", long_only=False, transcriber=transcriber)

    assert again == first
    assert transcriber.calls == 1

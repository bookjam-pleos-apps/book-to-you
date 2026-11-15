"""저장된 렌더 단위를 compose로 다시 받아써 기존 받아쓰기와 같은 QC 기준으로 다시 채점한다. GPU 클론은 필요 없다.

클라이언트가 음성을 경로로 넘기므로 서비스와 같은 장비에서 실행한다.
렌더 폴더마다 결과를 저장하고, 다시 실행하면 결과가 있는 렌더는 건너뛴다. 모드(--long-only)마다 --out을 따로 쓴다.
사용: python -m spike.experiments.measure.run_transcription_rescore outputs/demo_s4/fisherman_calm --compose-url URL --out outputs/rescore/demo
      --long-only: 30초 창을 넘는 단위만 다시 받아쓴다. 원격 장비에는 그 단위 음성만 올리면 된다.
"""
import argparse
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from spike.sound.atomic import atomic_path
from spike.sound.audio import Audio
from spike.compose.compose_client import DEFAULT_URL, ComposeTranscriber
from spike.render.story_store import load_chosen_units, load_unit_durations
from spike.render.trials.transcription_rescore import UnitTranscripts, rescore_row, rescore_unit, summarize_rows
from spike.clone.scoring.whisper_window import WHISPER_WINDOW_SEC, exceeds_whisper_window

SUMMARY_NAME = "summary.json"


class SegmentTranscriber(Protocol):
    def transcribe_segments(self, audio: Audio) -> list[str]: ...


def chosen_indices(durations: Sequence[float], long_only: bool) -> list[int]:
    """report의 길이는 반올림 값이라 창 경계의 단위도 고른다. 창 안팎 구분은 음성 길이로 한다."""
    return [index for index, sec in enumerate(durations) if not long_only or sec >= WHISPER_WINDOW_SEC]


def result_name(render_dir: Path) -> str:
    """절대 경로의 루트("/")가 이름에 들어가면 out 밖을 가리키게 되므로 뺀다."""
    return "__".join(part for part in render_dir.parts if part != render_dir.anchor) + ".json"


def transcribed_units(render_dir: Path, long_only: bool, transcriber: SegmentTranscriber) -> list[UnitTranscripts]:
    units = load_chosen_units(render_dir, chosen_indices(load_unit_durations(render_dir), long_only))
    return [
        UnitTranscripts(
            str(render_dir), index, unit.sentence.text, unit.audio.duration_sec,
            exceeds_whisper_window(unit.audio), unit.transcript, tuple(transcriber.transcribe_segments(unit.audio)),
        )
        for index, unit in units.items()
    ]


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with atomic_path(path) as tmp:
        tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def rescored_rows(render_dir: Path, out: Path, long_only: bool, transcriber: SegmentTranscriber) -> list[dict]:
    """서비스가 중간에 죽어도 끝난 렌더의 결과는 남도록 렌더마다 저장한다."""
    target = out / result_name(render_dir)
    if target.exists():
        return json.loads(target.read_text(encoding="utf-8"))
    rows = [rescore_row(rescore_unit(unit)) for unit in transcribed_units(render_dir, long_only, transcriber)]
    _write_json(target, rows)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("renders", type=Path, nargs="+")
    parser.add_argument("--compose-url", default=DEFAULT_URL)
    parser.add_argument("--long-only", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    transcriber = ComposeTranscriber(args.compose_url)
    rows = [row for render_dir in args.renders for row in rescored_rows(render_dir, args.out, args.long_only, transcriber)]
    summary = summarize_rows(rows)
    _write_json(args.out / SUMMARY_NAME, summary)
    print(json.dumps(summary, ensure_ascii=False), f"→ {args.out}")


if __name__ == "__main__":
    main()

"""녹음 직후 참조를 calm과 비교한다. GPU 없이 맥에서 돈다. 기준(녹음 대본 파일의 styleChecks)만큼 calm과 구별되지 않는 style이 있으면 실패로 끝난다.

사용: uv run --group dev python -m spike.experiments.clone.run_reference_check --speaker s4_phone --condition B
대본 일치는 재지 않는다. 전사는 Whisper가 필요해 클론 환경에서 확인한다.
"""
import argparse
import tempfile
from pathlib import Path

from spike.sound.audio_io import read_audio
from spike.clone.budget import count_syllables
from spike.clone.catalog import ANCHOR_STYLE, load_reference_scripts, load_speakers, reference_text, select_speakers
from spike.clone.cli_output import abort_if
from spike.evaluation.clone_eval.cli_plan import add_condition_argument
from spike.sound.ffmpeg_runner import decode_mono_wav
from spike.clone.layout import RECORDINGS_DIR, Condition, reference_path
from spike.sound.pitch_tracker import PyinPitchTracker
from spike.clone.reference.reference_check import ReferenceMeasure, measure_reference, semitone_shift, style_problems
from spike.story.story_draft import STYLES
from spike.clone.reference.style_checks import load_style_checks


def _decoded(src: Path, folder: Path) -> Path:
    """녹음은 개인정보라 임시 폴더에만 풀고 끝나면 지운다."""
    return decode_mono_wav(src, folder / f"{src.stem}.wav")


def _measure_style(speaker: str, condition: Condition, style: str, folder: Path) -> ReferenceMeasure:
    own_scripts = select_speakers(load_speakers(), [speaker])[0].scripts
    text = reference_text(style, load_reference_scripts(), own_scripts)
    audio = read_audio(_decoded(reference_path(RECORDINGS_DIR, speaker, condition, style), folder))
    return measure_reference(style, audio, PyinPitchTracker().track(audio), count_syllables(text))


def _number(value: float | None, unit: str) -> str:
    return "잴 수 없음" if value is None else f"{value:.2f}{unit}"


def _line(measure: ReferenceMeasure, calm: ReferenceMeasure) -> str:
    return (
        f"{measure.style}: 말 속도 {_number(measure.speech_rate, '음절/초')}, calm 대비 음높이 {_number(semitone_shift(calm, measure), '반음')}, "
        f"음높이 폭 {_number(measure.range_semitones, '반음')}, 말과 잡음 차이 {_number(measure.noise_margin_db, 'dB')}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speaker", required=True)
    add_condition_argument(parser)
    args = parser.parse_args()
    present = [s for s in STYLES if reference_path(RECORDINGS_DIR, args.speaker, args.condition, s).exists()]
    abort_if([] if ANCHOR_STYLE in present else [f"{ANCHOR_STYLE} 녹음이 없습니다"], "비교할 수 없음:")
    with tempfile.TemporaryDirectory() as folder:
        measures = {style: _measure_style(args.speaker, args.condition, style, Path(folder)) for style in present}
    print(*[_line(measure, measures[ANCHOR_STYLE]) for measure in measures.values()], sep="\n")
    checked = [check for check in load_style_checks() if check.style in measures]
    problems = [f"{check.style}: {problem}" for check in checked for problem in style_problems(check, measures[ANCHOR_STYLE], measures[check.style])]
    abort_if(problems, "다시 녹음하세요:")


if __name__ == "__main__":
    main()

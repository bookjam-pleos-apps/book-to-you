"""참조 녹음의 발성 검사. whisper 참조가 실제로 무성인지, 나머지 참조가 목소리를 냈는지 본다. CPU에서 돈다.

녹음 직후 돌려서 어긋난 참조는 그 자리에서 다시 녹음한다.
사용: uv run --group dev python -m spike.experiments.clone.run_phonation_check [--speakers p_sohee d_mom30] [--root recordings]
"""
import argparse
from pathlib import Path

from spike.clone.catalog import load_reference_scripts, load_speakers, select_speakers
from spike.clone.cli_output import abort_if
from spike.clone.layout import RECORDINGS_DIR
from spike.clone.reference.phonation_check import PhonationResult, check_speaker
from spike.sound.pitch_tracker import PyinPitchTracker


def _describe(result: PhonationResult) -> str:
    ratio = "잴 수 없음" if result.voiced_ratio is None else f"{result.voiced_ratio:.2f}"
    return f"{result.path.parent.name}/{result.path.name}: 유성 비율 {ratio}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speakers", nargs="*")
    parser.add_argument("--root", type=Path, default=RECORDINGS_DIR)
    args = parser.parse_args()
    scripts = load_reference_scripts()
    tracker = PyinPitchTracker()
    speakers = select_speakers(load_speakers(), args.speakers)
    results = [result for s in speakers for result in check_speaker(s.id, scripts, args.root, tracker)]
    print(*(_describe(result) for result in results), sep="\n")
    abort_if([_describe(r) for r in results if r.mismatched], "지시한 발성과 다른 참조 (다시 녹음):")
    print("발성 검사 통과")


if __name__ == "__main__":
    main()

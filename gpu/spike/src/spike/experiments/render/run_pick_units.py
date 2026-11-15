"""같은 계획을 seed만 바꿔 렌더한 폴더들에서 단위마다 덜 튀는 후보를 골라 잇는다. 맥 CPU에서 돈다.

사용: uv run --group dev --with 'speechbrain>=1.0' --with torchaudio python -m spike.experiments.render.run_pick_units \\
        --out outputs/picked/fisherman.wav outputs/fisherman_1 outputs/fisherman_2
음량은 run_story의 story.wav처럼 단위마다 맞춘다(맞추지 않으면 seed가 다른 단위끼리 크기가 튄다).
옆에 같은 이름의 .json으로 고른 후보와 둘 다 이상치인 단위를 남긴다. 둘 다 이상치면 귀로 듣고 정한다.
json의 이상치(similarityOutliersPerRun, similarityFlaggedUnits)는 유사도 이상치와 받아쓰기 실패만 센다.
그 전 json의 outliersPerRun·flaggedUnits는 음높이 이상치를 OR한 값이라 이름을 바꿨다. pitchOutliersPerRun은 벌점 없는 정보다.
folders는 gpu/spike 기준 후보 경로(eval_set_store.load_render가 읽는다), renders는 실행 위치 기준 CLI 인자 그대로다.
story_trend.unit_trend도 단위마다 음높이와 유사도를 재지만 비교 대상이 참조 녹음이다. 여기서는 후보 전체의 평균 목소리와 견준다.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from spike.sound.audio import to_mono
from spike.clone.cli_output import abort_if
from spike.clone.identity import cosine
from spike.sound.pitch_tracker import PyinPitchTracker
from spike.sound.prosody import median_semitones
from spike.render.story_render import RenderedSentence, stitch
from spike.render.story_store import load_units, save_story
from spike.render.trials.unit_pick import UnitPicks, pick_by_similarity, unit_count_problems

ROOT = Path(__file__).resolve().parents[4]


def _pitch(runs: list[list[RenderedSentence]]) -> np.ndarray:
    """음높이가 잡히지 않은 단위(None)는 NaN으로 둔다. object 배열이 되면 중앙값 계산이 멈춘다. NaN은 음높이 이상치로 보지 않는다."""
    tracker = PyinPitchTracker()
    measured = [[median_semitones(tracker.track(to_mono(unit.audio))) for unit in run] for run in runs]
    return np.array([[np.nan if value is None else value for value in run] for run in measured], dtype=float)


def _similarity(runs: list[list[RenderedSentence]]) -> np.ndarray:
    from spike.clone.scoring.speaker_embedding import EcapaEmbedder

    embedder = EcapaEmbedder(device="cpu")
    embeds = [[embedder.embed(to_mono(unit.audio)) for unit in run] for run in runs]
    mean = np.mean([vector for run in embeds for vector in run], axis=0)
    return np.array([[cosine(vector, mean) for vector in run] for run in embeds])


def pick(runs: list[list[RenderedSentence]]) -> UnitPicks:
    similarity = _similarity(runs)
    styles = [unit.sentence.style for unit in runs[0]]
    passed = np.array([[unit.passed for unit in run] for run in runs])
    return pick_by_similarity(similarity, _pitch(runs), styles, passed)


def root_folders(renders: list[Path], root: Path = ROOT) -> list[str]:
    """실행 위치와 상관없이 같은 값이 되게 root 기준 상대 경로로 바꾼다. root 밖이면 ValueError다."""
    return [str(folder.resolve().relative_to(root.resolve())) for folder in renders]


def pick_report(renders: list[Path], folders: list[str], picks: UnitPicks) -> dict[str, object]:
    return {"folders": folders, "renders": [str(folder) for folder in renders], "picks": picks.picks,
            "similarityFlaggedUnits": picks.flagged, "similarityOutliersPerRun": picks.outliers_per_run,
            "failedPerRun": picks.failed_per_run, "pitchOutliersPerRun": picks.pitch_outliers_per_run}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("renders", type=Path, nargs="+")
    args = parser.parse_args()
    try:
        folders = root_folders(args.renders)
    except ValueError as error:
        raise SystemExit(f"후보 폴더는 {ROOT} 안에 있어야 한다: {error}") from error
    runs = [load_units(folder) for folder in args.renders]
    abort_if(unit_count_problems([len(run) for run in runs]), "고를 수 없음:")
    picks = pick(runs)
    chosen = [runs[candidate][unit] for unit, candidate in enumerate(picks.picks)]
    save_story(args.out, stitch(chosen, "per_unit"))
    report = pick_report(args.renders, folders, picks)
    args.out.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"후보별 유사도 이상치 {list(picks.outliers_per_run)}, 음높이 이상치(정보만) {list(picks.pitch_outliers_per_run)}, 받아쓰기 실패 {list(picks.failed_per_run)}, 모두 제외 대상 {list(picks.flagged)} → {args.out}")


if __name__ == "__main__":
    main()

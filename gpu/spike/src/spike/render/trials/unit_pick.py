"""같은 계획을 seed만 바꿔 렌더한 후보 중 단위마다 덜 튀는 것을 고른다. 외부 라이브러리 없는 순수 로직이다.

기준은 렌더 전에 정했다. 음높이는 같은 style 단위끼리 견준다. excited는 원래 calm보다 높아 이야기 전체와 견주면 감정까지 이상치가 된다.
벌점은 유사도 이상치에만 준다. 평가 루프에서 음높이 이탈은 청취 지목과 맞지 않았고(AUC 0.51, "톤 튐" 지목도 0.50),
화자 유사도만 맞았다(청취로 확인). 음높이 이상치는 사람이 볼 정보로만 남긴다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace

import numpy as np

PITCH_LIMIT_SEMITONES = 3.0
SIMILARITY_MAD_LIMIT = 3.0
# 코사인 유사도 척도에서 MAD가 0에 가까울 때 아주 작은 차이까지 이상치가 되지 않게 하는 바닥
SIMILARITY_MAD_FLOOR = 1e-3
OUTLIER_PENALTY = 10.0
FAILURE_PENALTY = 100.0


@dataclass(frozen=True)
class UnitPicks:
    picks: tuple[int, ...]
    flagged: tuple[int, ...]
    outliers_per_run: tuple[int, ...]
    failed_per_run: tuple[int, ...] = ()
    pitch_outliers_per_run: tuple[int, ...] = ()


def pitch_outliers(pitch: np.ndarray, styles: Sequence[str]) -> np.ndarray:
    """pitch는 (후보, 단위) 반음 값이다. 같은 style의 모든 후보 단위 중앙값에서 한계보다 벗어나면 이상치다."""
    centre = {style: np.nanmedian(pitch[:, [i for i, s in enumerate(styles) if s == style]]) for style in set(styles)}
    return np.abs(pitch - np.array([centre[style] for style in styles])) > PITCH_LIMIT_SEMITONES


def mad_low_outliers(values: np.ndarray, limit: float, floor: float) -> np.ndarray:
    """중앙값에서 MAD의 limit배보다 아래면 이상치다. MAD가 floor보다 작으면 floor를 쓴다. floor는 값의 척도에 맞춘다."""
    median = np.median(values)
    mad = max(float(np.median(np.abs(values - median))), floor)
    return values < median - limit * mad


def similarity_outliers(similarity: np.ndarray) -> np.ndarray:
    """이야기 전체 목소리와의 유사도가 중앙값에서 MAD의 몇 배 아래면 이상치다."""
    return mad_low_outliers(similarity, SIMILARITY_MAD_LIMIT, SIMILARITY_MAD_FLOOR)


def choose_units(outliers: np.ndarray, similarity: np.ndarray, passed: np.ndarray | None = None) -> UnitPicks:
    """이상치가 아닌 후보 중 유사도가 높은 것을 고른다. 모두 이상치면 그중 높은 것을 고르고 사람이 듣도록 표시한다.

    받아쓰기에 떨어진 후보는 대본과 다르게 읽은 것이라 다른 이상치보다도 뒤로 민다(모두 이상치인 단위에서 실패 후보가 골라짐).
    """
    failed = np.zeros_like(outliers) if passed is None else ~passed.astype(bool)
    rejected = outliers | failed
    score = np.where(rejected, similarity - OUTLIER_PENALTY, similarity) - FAILURE_PENALTY * failed
    return UnitPicks(
        picks=tuple(int(i) for i in np.argmax(score, axis=0)),
        flagged=tuple(int(i) for i in np.flatnonzero(rejected.all(axis=0))),
        outliers_per_run=tuple(int(n) for n in outliers.sum(axis=1)),
        failed_per_run=tuple(int(n) for n in failed.sum(axis=1)),
    )


def pick_by_similarity(similarity: np.ndarray, pitch: np.ndarray, styles: Sequence[str], passed: np.ndarray | None = None) -> UnitPicks:
    """유사도 이상치와 받아쓰기 실패만 벌점을 받는다. 음높이 이상치는 후보별 개수로만 남긴다."""
    picks = choose_units(similarity_outliers(similarity), similarity, passed)
    pitch_counts = tuple(int(n) for n in pitch_outliers(pitch, styles).sum(axis=1))
    return replace(picks, pitch_outliers_per_run=pitch_counts)


def unit_count_problems(counts: Sequence[int]) -> list[str]:
    """단위 수가 다르면 계획이 다른 렌더라 단위를 바꿔 끼울 수 없다."""
    return [] if len(set(counts)) == 1 else [f"후보마다 단위 수가 다릅니다(같은 계획이 아님): {list(counts)}"]


def picked_folders(picked: Mapping[str, object]) -> list[str]:
    """picks 파일의 후보 폴더. folders는 gpu/spike 기준 경로다. 옛 파일은 renders(실행 위치 기준 CLI 인자)만 있을 수 있다."""
    folders = picked.get("folders", picked.get("renders"))
    if not isinstance(folders, list) or not all(isinstance(f, str) for f in folders):
        raise ValueError("picks 파일에 후보 폴더 목록(folders 또는 renders)이 없다")
    return folders

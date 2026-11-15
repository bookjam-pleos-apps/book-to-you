"""평가 기준점이 그 화자를 가리키는지 본다. 남의 calm에 더 가까운 기준점으로 잰 simRatio는 믿을 수 없다. 순수 함수."""
from collections.abc import Sequence

import numpy as np

from spike.clone.identity import cosine

# 리포트 재계산: d_grandma60 기준점은 자기 calm 0.664, d_mom30 calm 0.707로 변별에 실패했고,
# 나머지 세 화자는 자기 calm과 가장 가까운 타인 calm 사이를 0.27 이상 벌렸다.
MIN_MARGIN = 0.1


def discrimination_margin(anchor: np.ndarray, own_calm: np.ndarray, other_calms: Sequence[np.ndarray]) -> float | None:
    """자기 calm과의 유사도에서 가장 비슷한 타인 calm과의 유사도를 뺀 값. 비교할 타인이 없으면 잴 수 없다."""
    if not other_calms:
        return None
    return cosine(anchor, own_calm) - max(cosine(anchor, other) for other in other_calms)


def discriminates(margin: float | None) -> bool:
    """잴 수 없는 경우(화자 한 명만 평가)는 막지 않는다. 막을 근거가 없다."""
    return margin is None or margin >= MIN_MARGIN

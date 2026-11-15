"""시험 세트 두 버전의 차이를 사람이 읽을 줄로 낸다. 외부 라이브러리 없는 순수 로직이다.

세트는 버전마다 따로 저장하고 덮어쓰지 않는다. 차이가 비면 새 버전을 쓰지 않으므로, 행의 모든 필드를 비교한다.
골라 쓰기를 다시 하면 label은 그대로여도 audio와 durationSec가 바뀐다. 그것도 새 버전이어야 한다.
"""
from collections.abc import Mapping, Sequence

# id는 행을 맞추는 열쇠이고, 관찰은 목록이라 따로 요약한다.
SEPARATE_FIELDS = frozenset({"id", "observations"})


def _by_id(rows: Sequence[Mapping[str, object]]) -> dict[str, Mapping[str, object]]:
    return {str(r["id"]): r for r in rows}


def _observed_marks(row: Mapping[str, object]) -> list[str]:
    observations = row.get("observations")
    if not isinstance(observations, list):
        return []
    return [f"{o.get('listening')}@{o.get('mark')}" for o in observations if isinstance(o, dict)]


def _observation_changes(old: Mapping[str, object], new: Mapping[str, object]) -> list[str]:
    if old.get("observations") == new.get("observations"):
        return []
    before, after = _observed_marks(old), _observed_marks(new)
    return [f"관찰 {before}→{after}" if before != after else "관찰 세부값(오프셋, 확실 여부, 파일)"]


def _changed_fields(old: Mapping[str, object], new: Mapping[str, object]) -> list[str]:
    names = sorted((old.keys() | new.keys()) - SEPARATE_FIELDS)
    fields = [f"{name} {old.get(name)!r}→{new.get(name)!r}" for name in names if old.get(name) != new.get(name)]
    return fields + _observation_changes(old, new)


def set_changes(old_rows: Sequence[Mapping[str, object]], new_rows: Sequence[Mapping[str, object]]) -> list[str]:
    """추가, 삭제, 필드 변경을 id 순서로 낸다. 빈 목록이면 두 버전의 항목이 필드까지 같다."""
    old, new = _by_id(old_rows), _by_id(new_rows)
    added = [f"+ {i}" for i in sorted(new.keys() - old.keys())]
    removed = [f"- {i}" for i in sorted(old.keys() - new.keys())]
    changed = [f"~ {i}: {', '.join(diff)}" for i in sorted(old.keys() & new.keys()) if (diff := _changed_fields(old[i], new[i]))]
    return added + removed + changed

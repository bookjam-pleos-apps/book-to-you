"""make_refs가 남긴 동일인 게이트 기록(recordings/{화자}/meta.json)을 평가에서 읽는다. 순수 함수.

make_refs는 게이트에서 떨어져도 가장 비슷했던 클립을 남긴다. 그런 클립으로 만든 기준점이나 클론은
그 화자를 잰 값이 아니므로 평가에서 걸러야 한다.
"""
import hashlib
import json
from collections.abc import Mapping
from pathlib import Path

from spike.clone.plan.clone_plan import CloneJob
from spike.clone.layout import reference_path

Gate = Mapping[str, dict]
Gates = Mapping[str, Gate]


def passed_identity_gate(gate: Gate, path: Path) -> bool:
    """기록이 없는 클립(실제 녹음, 게이트 도입 전 파일)은 통과로 본다. 게이트를 거친 적이 없어서 판정할 근거가 없다."""
    return gate.get(path.name, {}).get("identityOk", True)


def reference_passed_identity_gate(gate: Gate, job: CloneJob) -> bool:
    """열화본(B·C)에는 게이트 기록이 없다. 열화 전 원본(A) 참조의 판정을 따른다."""
    return passed_identity_gate(gate, reference_path(Path(), job.speaker_id, "A", job.reference_style))


def gate_fingerprint(gate: Gate) -> str:
    """판정이 하나라도 바뀌면 기준점과 참조 판정이 달라지므로 다시 평가해야 한다."""
    verdicts = sorted((name, entry.get("identityOk", True)) for name, entry in gate.items())
    return hashlib.sha256(json.dumps(verdicts).encode()).hexdigest()[:12]


def gate_fields(gates: Gates, job: CloneJob) -> dict:
    gate = gates.get(job.speaker_id, {})
    return {
        "referenceIdentityOk": reference_passed_identity_gate(gate, job),
        "gateFingerprint": gate_fingerprint(gate),
    }

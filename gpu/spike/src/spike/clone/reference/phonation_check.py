"""화자의 참조 녹음마다 유성 비율을 재고, 지시한 발성과 어긋난 참조를 찾는다."""
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.clone.catalog import ANCHOR_STYLE, Phonation, ReferenceScript
from spike.clone.layout import reference_path
from spike.sound.phonation import is_whisper, reference_pitch_hz, voiced_ratio
from spike.sound.prosody import PitchTracker

@dataclass(frozen=True)
class PhonationResult:
    path: Path
    expected: Phonation | None
    voiced_ratio: float | None
    whisper: bool | None

    @property
    def mismatched(self) -> bool:
        """기대 발성이 없는 스타일(excited 등)이나 잴 수 없는 녹음은 판정하지 않는다."""
        if self.expected is None or self.whisper is None:
            return False
        return self.whisper != (self.expected == "unvoiced")


def check_speaker(
    speaker_id: str,
    scripts: list[ReferenceScript],
    root: Path,
    tracker: PitchTracker,
    load: Callable[[Path], Audio] = read_audio,
    exists: Callable[[Path], bool] = Path.exists,
) -> list[PhonationResult]:
    """유성 대역은 본인 calm 참조의 F0로 정한다. calm이 없거나 피치를 못 재면 검사하지 않는다."""
    located = [(script, reference_path(root, speaker_id, "A", script.style)) for script in scripts]
    clips = [_measure(script, path, load(path), tracker) for script, path in located if exists(path)]
    calm = next((clip for clip in clips if clip.style == ANCHOR_STYLE), None)
    reference_hz = reference_pitch_hz(calm.f0) if calm is not None else None
    if reference_hz is None:
        return []
    return [_judge(clip, reference_hz) for clip in clips]


@dataclass(frozen=True)
class _MeasuredClip:
    path: Path
    style: str
    expected: Phonation | None
    audio: Audio
    f0: np.ndarray


def _measure(script: ReferenceScript, path: Path, audio: Audio, tracker: PitchTracker) -> _MeasuredClip:
    """pYIN은 클립마다 수 초가 걸린다. calm도 기준 F0와 판정에 한 번 잰 값을 같이 쓴다."""
    return _MeasuredClip(path, script.style, script.phonation, audio, tracker.track(audio))


def _judge(clip: _MeasuredClip, reference_hz: float) -> PhonationResult:
    ratio = voiced_ratio(clip.f0, clip.audio, reference_hz)
    return PhonationResult(clip.path, clip.expected, ratio, is_whisper(ratio))

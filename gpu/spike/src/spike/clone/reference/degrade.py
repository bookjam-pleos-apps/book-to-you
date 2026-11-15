"""깨끗한 참조(A)를 폰 브라우저 녹음(B·C)처럼 열화시킨다. 실제 녹음의 근사일 뿐이다."""
from dataclasses import dataclass
from pathlib import Path

from spike.sound.ffmpeg_runner import run_ffmpeg
from spike.clone.layout import Condition

ROOM_NOISE = "anoisesrc=color=pink:amplitude=0.004"


@dataclass(frozen=True)
class DegradeProfile:
    condition: Condition
    voice_processing: str
    codec_args: tuple[str, ...]


# B: iOS Safari — 소음 억제·자동 음량을 끌 수 없음 → 디노이즈 + 컴프레서 후 AAC
IOS_SAFARI = DegradeProfile(
    condition="B",
    voice_processing="highpass=f=90,afftdn=nf=-30,acompressor=threshold=-24dB:ratio=3:attack=5:release=200",
    codec_args=("-c:a", "aac", "-b:a", "64k"),
)

# C: Android Chrome — 처리 끄기를 요청했다고 가정, 잡음은 남고 Opus 압축만
ANDROID_CHROME = DegradeProfile(
    condition="C",
    voice_processing="highpass=f=60",
    codec_args=("-c:a", "libopus", "-b:a", "32k"),
)

PROFILES = (IOS_SAFARI, ANDROID_CHROME)


def build_args(src: Path, profile: DegradeProfile) -> list[str]:
    graph = f"[0:a][1:a]amix=inputs=2:duration=first:normalize=0,{profile.voice_processing}"
    return [
        "-i", str(src),
        "-f", "lavfi", "-i", ROOM_NOISE,
        "-filter_complex", graph,
        "-ac", "1", "-ar", "48000",
        *profile.codec_args,
    ]


def degrade(src: Path, dst: Path, profile: DegradeProfile) -> None:
    run_ffmpeg(build_args(src, profile), dst)

"""작업 폴더 안의 시도 파일 이름 규칙. 워크플로우 단계 CLI와 Python 호출자가 같은 규칙으로 읽고 쓴다. 순수 로직.

attempts/NNNN-aK.wav   시도 K의 클론 음성(32비트 부동소수)
attempts/NNNN-aK.json  시도 K의 기록
attempts/NNNN-aK-sJ.wav  30초를 넘는 시도의 J번째 VAD 구간
attempts/NNNN-aK.raw.wav  꼬리를 자르기 전 시도 K의 생성음
attempts/NNNN-aK-tJ.wav  낱말 꼬리 J번째 후보 조각(받아써서 자를 쉼을 고른다)
attempts/NNNN-aK.take.json  자르기 전 생성음의 판정(길이 예산 초과, 꼬리 자르기 실패)
out/ 밖에 두어 게시 단계가 읽는 out/ 형식을 바꾸지 않는다.
"""
from pathlib import Path

ATTEMPTS_DIR = "attempts"
AUDIO_SUFFIX = ".wav"
RECORD_SUFFIX = ".json"
TAKE_SUFFIX = ".take.json"
RAW_SUFFIX = ".raw.wav"


def attempt_stem(unit_index: int, attempt: int) -> str:
    return f"{unit_index:04d}-a{attempt}"


def attempts_dir(job_dir: Path) -> Path:
    return job_dir / ATTEMPTS_DIR


def attempt_audio(job_dir: Path, unit_index: int, attempt: int) -> Path:
    return attempts_dir(job_dir) / f"{attempt_stem(unit_index, attempt)}{AUDIO_SUFFIX}"


def attempt_raw_audio(job_dir: Path, unit_index: int, attempt: int) -> Path:
    return attempts_dir(job_dir) / f"{attempt_stem(unit_index, attempt)}{RAW_SUFFIX}"


def tail_clip_audio(job_dir: Path, unit_index: int, attempt: int, clip_index: int) -> Path:
    return attempts_dir(job_dir) / f"{attempt_stem(unit_index, attempt)}-t{clip_index}{AUDIO_SUFFIX}"


def attempt_record_file(job_dir: Path, unit_index: int, attempt: int) -> Path:
    return attempts_dir(job_dir) / f"{attempt_stem(unit_index, attempt)}{RECORD_SUFFIX}"


def attempt_take_file(job_dir: Path, unit_index: int, attempt: int) -> Path:
    return attempts_dir(job_dir) / f"{attempt_stem(unit_index, attempt)}{TAKE_SUFFIX}"


def clip_audio(job_dir: Path, unit_index: int, attempt: int, clip_index: int) -> Path:
    return attempts_dir(job_dir) / f"{attempt_stem(unit_index, attempt)}-s{clip_index}{AUDIO_SUFFIX}"


def tail_clips_pattern(unit_index: int, attempt: int) -> str:
    """시도 하나의 낱말 꼬리 조각(tail_clip_audio)에 맞는 glob 패턴."""
    return f"{attempt_stem(unit_index, attempt)}-t*{AUDIO_SUFFIX}"


def unit_files_pattern(unit_index: int) -> str:
    """한 단위의 모든 시도 파일(음성, 기록, 구간)에 맞는 glob 패턴."""
    return f"{unit_index:04d}-a*"

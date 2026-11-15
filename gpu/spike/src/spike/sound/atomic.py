"""파일을 임시 경로에 다 쓴 뒤에만 최종 경로로 옮긴다.

재실행은 '파일이 있으면 완료'로 판단하므로, 중단으로 반쯤 쓰인 파일이 최종 경로에 남으면 안 된다.
"""
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


def partial_path(dst: Path) -> Path:
    """확장자를 유지해야 ffmpeg·soundfile이 포맷을 추론한다."""
    return dst.with_name(f".{dst.stem}.partial{dst.suffix}")


@contextmanager
def atomic_path(dst: Path) -> Iterator[Path]:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = partial_path(dst)
    try:
        yield tmp
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(dst)

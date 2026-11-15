"""렌더 서비스(render-story·render-result·render-cleanup)가 다루는 작업 폴더 묶음.

서비스에는 인증이 없다. 요청으로 받는 것은 잡 id와 묶음뿐이고, 작업 폴더의 루트는 서비스 환경변수로만 정한다.
잡 id는 UUID만 받아 루트 밖 경로(`..`, `/`)가 만들어지지 않게 한다. 묶음은 맨 위의 일반 파일만 푼다.
"""
import re
import shutil
import tarfile
from functools import partial, reduce
from pathlib import Path, PurePosixPath
from typing import BinaryIO

from spike.sound.atomic import atomic_path
from spike.render.job.render_job import JOB_NAME, OUT_DIR
from spike.render.story_store import REPORT_NAME, STORY_NAME

JOB_ID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
RESULT_NAME = "out.tar"
RESULT_MEMBERS = (f"{OUT_DIR}/{REPORT_NAME}", f"{OUT_DIR}/{STORY_NAME}")


class BundleError(ValueError):
    pass


def job_dir_of(root: Path, job_id: str) -> Path:
    """루트가 상대 경로면 서비스 환경변수가 빠진 것이다(기본값 render-jobs-dir-not-set). 작업 폴더에 조용히 풀지 않는다."""
    if not root.is_absolute():
        raise BundleError(f"작업 폴더 루트는 절대 경로여야 합니다(RENDER_JOBS_DIR): {root}")
    if JOB_ID_PATTERN.fullmatch(job_id) is None:
        raise BundleError(f"잡 id는 소문자 UUID여야 합니다: {job_id!r}")
    return root / job_id


def member_problem(member: tarfile.TarInfo) -> str | None:
    path = PurePosixPath(member.name)
    if path.is_absolute():
        return "절대 경로"
    if ".." in path.parts:
        return "상위 경로"
    if not member.isfile():
        return "일반 파일이 아님"
    if len(path.parts) != 1:
        return "폴더 안 항목"
    return None


def _strict_filter(member: tarfile.TarInfo, destination: str) -> tarfile.TarInfo:
    problem = member_problem(member)
    if problem is not None:
        raise BundleError(f"묶음 항목을 거부합니다({problem}): {member.name!r}")
    return tarfile.data_filter(member, destination)


def unpack_bundle(stream: BinaryIO, job_dir: Path) -> None:
    """같은 잡 폴더가 있으면 풀지 않는다. 다시 제출할 때는 정리부터 한다. 풀다 실패하면 반쯤 푼 폴더를 지운다."""
    job_dir.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    job_dir.mkdir(mode=0o700)
    try:
        with tarfile.open(fileobj=stream, mode="r|") as bundle:
            bundle.extractall(job_dir, filter=_strict_filter)
        if not (job_dir / JOB_NAME).is_file():
            raise BundleError(f"묶음에 {JOB_NAME}이 없습니다")
    except BaseException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise


def _added(job_dir: Path, packed: tarfile.TarFile, name: str) -> tarfile.TarFile:
    packed.add(job_dir / name, arcname=name)
    return packed


def pack_result(job_dir: Path) -> Path:
    missing = [name for name in RESULT_MEMBERS if not (job_dir / name).is_file()]
    if missing:
        raise BundleError(f"렌더 결과가 없습니다: {', '.join(missing)}")
    result = job_dir / RESULT_NAME
    # 기본 PAX 형식은 실수 mtime 때문에 확장 헤더를 앞에 붙인다. 맥 워커의 판독기는 일반 파일 헤더만 읽는다.
    with atomic_path(result) as unfinished, tarfile.open(unfinished, "w", format=tarfile.USTAR_FORMAT) as packed:
        reduce(partial(_added, job_dir), RESULT_MEMBERS, packed)
    return result


def remove_job_dir(job_dir: Path) -> bool:
    """잡 id를 검사한 경로만 받는다. 풀다 죽어 job.json이 없는 폴더도 지운다. 링크는 rmtree가 거부한다."""
    if not job_dir.exists():
        return False
    shutil.rmtree(job_dir)
    return True

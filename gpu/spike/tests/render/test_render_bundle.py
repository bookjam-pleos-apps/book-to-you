import io
import tarfile
from pathlib import Path

import pytest
from job_fixture import SHARED_FIXTURES

from spike.render.job.render_bundle import RESULT_MEMBERS, BundleError, job_dir_of, member_problem, pack_result, remove_job_dir, unpack_bundle

JOB_ID = "0b6f3c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f"


def tar_of(*members: tarfile.TarInfo, data: bytes = b"{}") -> io.BytesIO:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as bundle:
        [bundle.addfile(member, io.BytesIO(data) if member.isfile() else None) for member in members]
    buffer.seek(0)
    return buffer


def file_member(name: str, size: int = 2) -> tarfile.TarInfo:
    member = tarfile.TarInfo(name)
    member.size = size
    return member


def link_member(name: str, target: str) -> tarfile.TarInfo:
    member = tarfile.TarInfo(name)
    member.type = tarfile.SYMTYPE
    member.linkname = target
    return member


@pytest.mark.parametrize("job_id", ["../etc", "/tmp/x", JOB_ID.upper(), "", f"{JOB_ID}/..", f"{JOB_ID}\n"])
def test_a_job_id_that_is_not_a_lowercase_uuid_never_becomes_a_path(tmp_path: Path, job_id: str):
    with pytest.raises(BundleError):
        job_dir_of(tmp_path, job_id)


def test_a_relative_root_means_the_service_env_is_missing():
    with pytest.raises(BundleError, match="RENDER_JOBS_DIR"):
        job_dir_of(Path("render-jobs-dir-not-set"), JOB_ID)


def test_a_uuid_job_id_is_a_folder_right_under_the_root(tmp_path: Path):
    assert job_dir_of(tmp_path, JOB_ID) == tmp_path / JOB_ID


@pytest.mark.parametrize(
    ("member", "problem"),
    [
        (file_member("/etc/passwd"), "절대 경로"),
        (file_member("../job.json"), "상위 경로"),
        (link_member("job.json", "/etc/passwd"), "일반 파일이 아님"),
        (file_member("sub/job.json"), "폴더 안 항목"),
        (file_member("job.json"), None),
    ],
)
def test_only_top_level_regular_files_are_unpacked(member: tarfile.TarInfo, problem: str | None):
    assert member_problem(member) == problem


def test_a_bundle_unpacks_into_a_new_private_job_folder(tmp_path: Path):
    job_dir = tmp_path / "jobs" / JOB_ID
    unpack_bundle(tar_of(file_member("job.json"), file_member("reference-calm.wav")), job_dir)

    assert sorted(path.name for path in job_dir.iterdir()) == ["job.json", "reference-calm.wav"]
    assert job_dir.stat().st_mode & 0o777 == 0o700


@pytest.mark.parametrize("bad", [file_member("../escape.txt"), link_member("reference-calm.wav", "/etc/passwd")])
def test_a_bad_member_removes_the_half_unpacked_folder(tmp_path: Path, bad: tarfile.TarInfo):
    job_dir = tmp_path / JOB_ID
    with pytest.raises(BundleError):
        unpack_bundle(tar_of(file_member("job.json"), bad), job_dir)

    assert not job_dir.exists()
    assert not (tmp_path / "escape.txt").exists()


def test_a_bundle_without_the_job_file_is_refused(tmp_path: Path):
    job_dir = tmp_path / JOB_ID
    with pytest.raises(BundleError):
        unpack_bundle(tar_of(file_member("reference-calm.wav")), job_dir)

    assert not job_dir.exists()


def test_an_existing_job_folder_is_left_alone(tmp_path: Path):
    job_dir = tmp_path / JOB_ID
    job_dir.mkdir()
    (job_dir / "keep").write_text("x")
    with pytest.raises(FileExistsError):
        unpack_bundle(tar_of(file_member("job.json")), job_dir)

    assert (job_dir / "keep").exists()


def test_the_result_holds_only_the_report_and_the_story(tmp_path: Path):
    (tmp_path / "out").mkdir()
    [(tmp_path / name).write_bytes(b"x") for name in [*RESULT_MEMBERS, "out/progress.json"]]
    result = pack_result(tmp_path)
    with tarfile.open(result) as packed:
        assert packed.getnames() == list(RESULT_MEMBERS)
    assert result.read_bytes()[156:157] == tarfile.REGTYPE


def test_no_result_until_the_story_is_assembled(tmp_path: Path):
    (tmp_path / "out").mkdir()
    (tmp_path / RESULT_MEMBERS[0]).write_bytes(b"x")
    with pytest.raises(BundleError):
        pack_result(tmp_path)


def test_cleanup_reports_whether_anything_was_removed(tmp_path: Path):
    job_dir = tmp_path / JOB_ID
    job_dir.mkdir()

    assert remove_job_dir(job_dir) is True
    assert remove_job_dir(job_dir) is False


def test_the_bundle_the_api_packs_unpacks_here(tmp_path: Path):
    job_dir = tmp_path / JOB_ID
    with (SHARED_FIXTURES / "bundle.example.tar").open("rb") as bundle:
        unpack_bundle(bundle, job_dir)

    assert (job_dir / "job.json").read_bytes() == (SHARED_FIXTURES / "job.example.json").read_bytes()
    assert (job_dir / "reference-calm.wav").read_bytes() == b"RIFF"

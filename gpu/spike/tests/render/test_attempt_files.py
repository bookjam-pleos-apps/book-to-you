from pathlib import Path

from spike.render.attempt.attempt_files import attempt_audio, attempt_record_file, clip_audio, unit_files_pattern

JOB = Path("/job")


def test_every_file_of_a_unit_matches_its_cleanup_pattern():
    files = [attempt_audio(JOB, 3, 0), attempt_record_file(JOB, 3, 1), clip_audio(JOB, 3, 2, 4)]

    assert [path.name for path in files] == ["0003-a0.wav", "0003-a1.json", "0003-a2-s4.wav"]
    assert all(path.match(unit_files_pattern(3)) for path in files)
    assert not attempt_audio(JOB, 13, 0).match(unit_files_pattern(3))

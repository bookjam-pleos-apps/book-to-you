import pytest

from spike.clone.cli_output import abort_if


def test_abort_if_stops_only_when_there_are_problems(capsys: pytest.CaptureFixture[str]):
    abort_if([], "문제:")
    with pytest.raises(SystemExit) as stopped:
        abort_if(["참조 녹음 1개 누락"], "문제:")
    assert stopped.value.code == 1
    assert capsys.readouterr().out == "문제:\n  참조 녹음 1개 누락\n"

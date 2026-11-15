"""skip 정책을 pytest 종료 코드에 연결하고, 여러 테스트가 쓰는 가짜 compose 서비스를 fixture로 둔다."""
from collections.abc import Iterator

import pytest

from fake_compose_service import FakeService, running_fake_service
from skip_policy import unexpected_skips


@pytest.fixture
def compose_service() -> Iterator[FakeService]:
    with running_fake_service() as fake:
        yield fake


def pytest_sessionfinish(session: pytest.Session) -> None:
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    unexpected = unexpected_skips(report.longrepr[2] for report in reporter.stats.get("skipped", []))
    if not unexpected:
        return
    reporter.line(f"\n허용되지 않은 skip {len(unexpected)}개: {sorted(set(unexpected))}", red=True)
    session.exitstatus = pytest.ExitCode.TESTS_FAILED


@pytest.fixture
def repeat_tail(monkeypatch: pytest.MonkeyPatch) -> None:
    """반복 꼬리(마지막 문장 두 번)의 자르기를 시험하는 테스트용. 제품 기본값(data/render-tail.json)은 word다."""
    from spike.render.tail.tail_plan import TailSetting

    monkeypatch.setattr("spike.render.job.render_job.load_tail_setting", lambda: TailSetting("repeat", "그래"))

"""길이 사다리 결과를 길이별 표로 낸다. GPU와 음성 없이 돈다. 판정하지 않는다.

사용: uv run --group dev python -m spike.experiments.render.run_unit_ladder_summary --dir outputs/q_ladder
"""
import argparse
from pathlib import Path

from spike.render.trials.run_store import load_run
from spike.render.trials.unit_ladder import LadderRow, ladder_rows


def _line(row: LadderRow) -> str:
    return (
        f"{row.target:4d} {row.clips:4d} {row.mean_sec:6.1f} {row.retried:4d} {row.failed:4d} "
        f"{row.tails_lost:4d} {row.omissions:4d} {row.median_cer:6.3f} {row.rate:5.2f}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    args = parser.parse_args()
    print("음절 클립 평균초 재시도 실패 끝잘림 누락 CER중앙 음절/초")
    print(*[_line(row) for row in ladder_rows(load_run(args.dir))], sep="\n")


if __name__ == "__main__":
    main()

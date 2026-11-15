"""data/eval-listenings.json으로 고정 시험 세트 data/eval-set-v<N>.json을 만든다. GPU 없이 report.json과 wav 헤더만 읽는다.

이전 버전과 같으면 아무것도 쓰지 않는다. 다르면 다음 버전 파일을 새로 쓰고 차이를 출력한다. 기존 버전은 덮어쓰지 않는다.
사용: uv run python -m spike.experiments.measure.run_build_eval_set   (어느 디렉터리에서 실행해도 같다)
"""
from collections.abc import Sequence
from pathlib import Path

from spike.evaluation.eval_set.eval_checks import ClipCheck, apply_checks, check_flags
from spike.evaluation.eval_set.eval_items import Item, Listening, Render, flagged_items, normal_items, with_core_tier
from spike.evaluation.eval_set.eval_set_diff import set_changes
from spike.evaluation.eval_set.eval_set_rows import item_row
from spike.evaluation.eval_set.eval_set_store import latest_set, listen_counts, load_clip_checks, load_listenings, load_render, read_set_rows, set_path, write_new_set

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data"
NOTE = "청취 지목(flagged)과 같은 렌더의 짝 정상(normal) 단위. id는 렌더#단위. 오디오는 경로만 가리키고 복사하지 않는다. 생성: spike.experiments.measure.run_build_eval_set"


def build_items(renders: dict[str, Render], listenings: Sequence[Listening], checks: Sequence[ClipCheck] = ()) -> list[Item]:
    """확인 청취의 재현 지목은 지목 항목에 더하고, 확인 결과는 짝을 고른 뒤에 반영한다."""
    texts = {(r, i): u.text for r, render in renders.items() for i, u in enumerate(render.units)}
    extra = [row for check in checks for row in check_flags(check)]
    flagged = with_core_tier(flagged_items(listenings, renders, extra, frozenset(c.id for c in checks)), texts)
    return apply_checks(flagged + normal_items(flagged, renders, listen_counts(listenings)), checks)


def summary(items: list[Item]) -> str:
    count = lambda label: [i for i in items if i.label == label]
    flagged, normals = count("flagged"), count("normal")
    core = sum(i.tier == "core" for i in items)
    return f"지목 {len(flagged)}개(확실 {sum(i.sure for i in flagged)}), 정상 {len(normals)}개(확실 {sum(i.sure for i in normals)}), core {core}개"


def main() -> None:
    listenings, picks = load_listenings(DATA / "eval-listenings.json")
    checks = load_clip_checks(DATA / "eval-listenings.json")
    rendered = [li.render for li in listenings] + [a.render for c in checks for a in c.answers]
    renders = {r: load_render(ROOT, r, picks.get(r)) for r in dict.fromkeys(rendered)}
    items = build_items(renders, listenings, checks)
    files = {li.id: li.file for li in listenings} | {c.id: c.file for c in checks}
    rows = [item_row(i, renders[i.render], files) for i in items]
    version, previous = latest_set(DATA)
    changes = set_changes(read_set_rows(previous) if previous else [], rows)
    if previous and not changes:
        print(f"변경 없음: {previous.name}을 그대로 쓴다")
        return
    path = set_path(DATA, version + 1)
    write_new_set(path, version + 1, rows, NOTE)
    print(f"{path.name}: {summary(items)}", *changes, sep="\n")


if __name__ == "__main__":
    main()

"""차량 앱 표지마다 주인공 영역을 찾아 초점 표를 쓰고, 화면 칸별 전후 미리보기를 남긴다.

model-compose cover-focus 서비스(gpu/compose/cover-focus, 맥)를 먼저 띄운다. 표지를 바꿀 때만 돌린다.
주인공 표시는 data/cover-protagonists.json에서 온다. 주인공만 바꿨으면 --mark-only로 VLM 없이 표만 다시 쓴다.
사용: uv run --group dev python -m spike.run_cover_focus [--mark-only]
"""
import argparse
import json
from functools import reduce
from pathlib import Path

from PIL import Image

from spike.sound.atomic import atomic_path
from spike.compose.compose_http import run_workflow
from spike.cover.cover_focus_file import CoverAnalysis, analyses_of, focus_document, with_picks
from spike.cover.cover_preview_plan import CoverImage, Render, find_images, render_plan
from spike.cover.cover_protagonists import ProtagonistPick, parse_picks
from spike.cover.cover_subjects import grid_size, parse_subjects

REPO = Path(__file__).resolve().parents[4]
APP_MAIN = REPO / "apps/vehicle/app/src/main"
PROTAGONISTS = REPO / "gpu/spike/data/cover-protagonists.json"
DEFAULT_URL = "http://127.0.0.1:18097/api/workflows/runs"
# gpu/compose/cover-focus/model-compose.yml의 subject-locator와 같아야 한다(test_compose_cover_focus가 확인).
VLM_MODEL = "Qwen/Qwen2.5-VL-3B-Instruct"
VLM_REVISION = "66285546d2b821cf421d4f5eb2576359d3770cd3"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--covers", type=Path, default=APP_MAIN / "res/drawable-nodpi")
    parser.add_argument("--out", type=Path, default=APP_MAIN / "assets/cover_focus.json")
    parser.add_argument("--previews", type=Path, default=REPO / "reports/vehicle-ui/cover-focus/previews")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--protagonists", type=Path, default=PROTAGONISTS)
    parser.add_argument("--mark-only", action="store_true", help="이미 쓴 표에 주인공 표시만 다시 한다")
    return parser


def _image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def _text(body: bytes) -> str:
    text = body.decode("utf-8")
    return json.loads(text) if text.startswith('"') else text


def _analyze(url: str, image: CoverImage) -> CoverAnalysis:
    grid = grid_size(*image.size)
    answer = _text(run_workflow(url, "locate-subjects", {
        "image_path": str(image.path), "grid_width": grid[0], "grid_height": grid[1],
    }))
    subjects = tuple(parse_subjects(answer, grid))
    print(f"{image.name}: 주인공 {len(subjects)}개 {[s.label for s in subjects]}")
    return CoverAnalysis(image.name, subjects)


def _write_text(path: Path, text: str) -> None:
    with atomic_path(path) as tmp:
        tmp.write_text(text, encoding="utf-8")


def _render(url: str, out: Path, done: tuple[str, ...], render: Render) -> tuple[str, ...]:
    body = run_workflow(url, render.workflow, render.input)
    with atomic_path(out / render.name) as tmp:
        tmp.write_bytes(body)
    return (*done, render.name)


def _index(names: tuple[str, ...]) -> str:
    rows = [f"| {n.split('/')[0]} | ![]({n}) | ![]({n.replace('-before', '-after')}) |" for n in names if "-before" in n]
    keeps = [f"![]({n})" for n in names if n.startswith("keep/")]
    return "\n".join(["# 표지 초점 미리보기", "", "| 칸 | 지금(가운데) | 초점 |", "|---|---|---|", *rows, "",
                      "## 꼭 보여야 할 박스", "", *keeps, ""])


def _protagonist_line(analysis: CoverAnalysis, picks: dict[str, ProtagonistPick]) -> str:
    pick, lead = picks.get(analysis.image_name), analysis.protagonist
    if pick is None:
        return f"{analysis.image_name}: 주인공 표시 없음(인물 수 규칙만)"
    found = "점을 품은 박스 없음, 표시 안 함" if lead is None else f"{lead}번 박스 {analysis.subjects[lead].label}"
    return f"{analysis.image_name}: 주인공 {pick.who} → {found}"


def _write_document(out: Path, model: str, revision: str, analyses: list[CoverAnalysis], picks: dict[str, ProtagonistPick]) -> None:
    print("\n".join(_protagonist_line(analysis, picks) for analysis in analyses))
    _write_text(out, json.dumps(focus_document(model, revision, analyses), ensure_ascii=False, indent=2) + "\n")


def _mark_only(out: Path, picks: dict[str, ProtagonistPick]) -> None:
    document = json.loads(out.read_text(encoding="utf-8"))
    _write_document(out, document["model"], document["revision"], with_picks(analyses_of(document), picks), picks)
    print(f"초점 표: {out}")


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    picks = parse_picks(json.loads(args.protagonists.read_text(encoding="utf-8")))
    if args.mark_only:
        return _mark_only(args.out, picks)
    images = find_images(list(args.covers.glob("cover_*")), _image_size)
    analyses = with_picks([_analyze(args.url, image) for image in images], picks)
    _write_document(args.out, VLM_MODEL, VLM_REVISION, analyses, picks)
    renders = render_plan(images, {analysis.image_name: analysis.focus for analysis in analyses})
    names = reduce(lambda done, render: _render(args.url, args.previews, done, render), renders, ())
    _write_text(args.previews / "index.md", _index(names))
    print(f"초점 표: {args.out}\n미리보기: {args.previews / 'index.md'}")


if __name__ == "__main__":
    main()

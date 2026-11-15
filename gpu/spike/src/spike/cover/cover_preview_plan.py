"""표지 미리보기 계획: 어떤 그림을 어느 화면 칸에 그리는지와 그 compose 호출 목록. 앱의 CoverArt.pick과 같은 규칙으로 고른다."""
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from spike.cover.cover_crop import CENTER_FOCUS, CoverFocus, crop_region, keep_box, pixel_crop

IMAGE_NAME = re.compile(r"^cover_(?P<story>[a-z0-9]+)_(?P<shape>portrait|landscape)$")


@dataclass(frozen=True)
class Slot:
    """화면의 표지 칸(dp). 값은 apps/vehicle res/values*/dimens.xml에서 옮겼다. 카운트다운은 재생 칸을 그대로 쓴다."""
    name: str
    width: int
    height: int
    shape: str


SLOTS = (
    Slot("wide-resume", 415, 556, "portrait"),
    Slot("wide-player", 609, 816, "portrait"),
    Slot("wide-shelf", 435, 239, "landscape"),
    Slot("split-resume", 180, 240, "portrait"),
    Slot("split-player", 520, 260, "landscape"),
    Slot("split-shelf", 381, 209, "landscape"),
)


@dataclass(frozen=True)
class CoverImage:
    """표지 그림 한 장(drawable 하나). 앱의 CoverArt는 이야기 하나의 세로·가로 그림 묶음이다."""
    name: str
    story: str
    shape: str
    path: Path
    size: tuple[int, int]


@dataclass(frozen=True)
class PreviewItem:
    story: str
    slot: Slot
    image: CoverImage


@dataclass(frozen=True)
class Render:
    """compose 워크플로 한 번 호출과 그 결과를 쓸 미리보기 파일 이름."""
    name: str
    workflow: str
    input: dict


def find_images(paths: list[Path], size_of: Callable[[Path], tuple[int, int]]) -> list[CoverImage]:
    """표지 이름(cover_<이야기>_<모양>)인 파일만 이름순으로 고른다. 크기는 표지인 파일만 읽는다."""
    matches = [(path, IMAGE_NAME.match(path.stem)) for path in sorted(paths, key=lambda path: path.stem)]
    return [CoverImage(path.stem, m["story"], m["shape"], path, size_of(path)) for path, m in matches if m is not None]


def pick_image(images: list[CoverImage], story: str, shape: str) -> CoverImage:
    """원하는 모양이 없으면 다른 모양을 잘라 쓴다(앱과 같다)."""
    own = [image for image in images if image.story == story]
    return next((image for image in own if image.shape == shape), own[0])


def preview_plan(images: list[CoverImage]) -> list[PreviewItem]:
    stories = sorted({image.story for image in images})
    return [PreviewItem(story, slot, pick_image(images, story, slot.shape)) for story in stories for slot in SLOTS]


def _crop_render(item: PreviewItem, label: str, focus: CoverFocus) -> Render:
    crop = crop_region(item.image.size, (item.slot.width, item.slot.height), focus)
    x, y, width, height = pixel_crop(crop, item.image.size)
    return Render(f"{item.slot.name}/{item.story}-{label}.png", "preview-crop", {
        "image_path": str(item.image.path), "x": x, "y": y, "width": width, "height": height,
        "slot_width": item.slot.width, "slot_height": item.slot.height,
    })


def _mark_render(image: CoverImage, focus: CoverFocus | None) -> Render | None:
    keep = keep_box(list(focus.subjects)) if focus else None
    if keep is None:
        return None
    (w, h) = image.size
    left, top = round(keep.left * w), round(keep.top * h)
    box = {"x": left, "y": top, "width": round(keep.right * w) - left, "height": round(keep.bottom * h) - top}
    return Render(f"keep/{image.name}.png", "mark-subjects", {"image_path": str(image.path), **box})


def render_plan(images: list[CoverImage], focus: Mapping[str, CoverFocus | None]) -> list[Render]:
    """그림마다 주인공 박스 표시, 칸마다 지금(가운데)과 초점 자르기 한 쌍. 주인공을 못 찾은 그림은 박스 표시가 없다."""
    marks = [mark for mark in (_mark_render(image, focus[image.name]) for image in images) if mark is not None]
    crops = [
        _crop_render(item, label, item_focus)
        for item in preview_plan(images)
        for label, item_focus in (("before", CENTER_FOCUS), ("after", focus[item.image.name] or CENTER_FOCUS))
    ]
    return marks + crops

"""표지 초점과 자를 영역. 앱의 core `shelf/CoverCrop.kt`와 같은 계산이고, 공유 사례(cover-crop-cases.json)로 둘을 맞춘다."""
from dataclasses import dataclass


@dataclass(frozen=True)
class NormRect:
    """0..1로 정규화한 그림 안 영역. 그림 왼쪽 위가 원점이다."""
    left: float
    top: float
    right: float
    bottom: float


@dataclass(frozen=True)
class CoverFocus:
    """subjects는 보여 주고 싶은 인물 박스들이고, protagonist는 그중 반드시 온전히 넣을 주인공이다(옛 표는 None).
    (x, y)는 위치가 여럿일 때 고르는 기준점이다."""
    x: float
    y: float
    subjects: tuple[NormRect, ...] = ()
    protagonist: NormRect | None = None


@dataclass(frozen=True)
class CropRect:
    left: float
    top: float
    width: float
    height: float


CENTER_FOCUS = CoverFocus(0.5, 0.5)


# 경계에 딱 붙인 위치도 부동소수 오차 없이 '온전히 들어감'으로 센다.
EDGE_SLACK = 1e-6


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


Span = tuple[float, float]


def _place_window(window: float, length: float, center: float, spans: list[Span], protagonist: Span | None) -> float:
    pixels = [(start * length, end * length) for start, end in spans]
    centered = center * length - window / 2
    anywhere = (0.0, length - window)
    if protagonist is None:
        return _show_most_spans(window, centered, pixels, anywhere)
    lead = (protagonist[0] * length, protagonist[1] * length)
    if lead[1] - lead[0] > window:
        return _clamp((lead[0] + lead[1]) / 2 - window / 2, *anywhere)
    return _show_most_spans(window, centered, pixels, _keeping_whole(lead, window, anywhere))


def _keeping_whole(lead: Span, window: float, anywhere: Span) -> Span:
    """lead가 창 안에 온전히 들어가는 창 시작 위치 범위. lead는 그림 안에 있고 창보다 작다."""
    earliest = _clamp(lead[1] - window, *anywhere)
    return earliest, _clamp(lead[0], earliest, anywhere[1])


def _show_most_spans(window: float, centered: float, spans: list[Span], allowed: Span) -> float:
    """allowed는 창 시작 위치가 놓일 수 있는 범위다."""
    raw = [centered, *(edge for start, end in spans for edge in (start, end - window))]
    candidates = [_clamp(position, *allowed) for position in raw]

    def fully_shown(position: float) -> int:
        return sum(start >= position - EDGE_SLACK and end <= position + window + EDGE_SLACK for start, end in spans)

    most = max(map(fully_shown, candidates))
    return min((p for p in candidates if fully_shown(p) == most), key=lambda p: abs(p - centered))


def crop_region(image: tuple[float, float], slot: tuple[float, float], focus: CoverFocus) -> CropRect:
    """배율은 centerCrop과 같아 움직일 수 있는 축은 하나다. 그 축에서 주인공을 반드시 온전히 넣고(칸보다 크면 주인공 가운데),
    그 안에서 온전히 보이는 인물이 가장 많은 위치를 고른다. 같으면 초점을 가운데에 둔 위치에 가까운 쪽이다.
    앱의 core cropRegion과 같은 계산이다."""
    if min(*image, *slot) <= 0:
        raise ValueError(f"크기는 0보다 커야 한다: {image}, {slot}")
    scale = max(slot[0] / image[0], slot[1] / image[1])
    width, height = min(image[0], slot[0] / scale), min(image[1], slot[1] / scale)
    lead = focus.protagonist
    return CropRect(
        left=_place_window(width, image[0], focus.x, [(b.left, b.right) for b in focus.subjects], lead and (lead.left, lead.right)),
        top=_place_window(height, image[1], focus.y, [(b.top, b.bottom) for b in focus.subjects], lead and (lead.top, lead.bottom)),
        width=width,
        height=height,
    )


def keep_box(boxes: list[NormRect]) -> NormRect | None:
    """주인공 박스를 모두 덮는 박스. 초점은 이 박스의 가운데다."""
    if not boxes:
        return None
    return NormRect(
        left=min(box.left for box in boxes),
        top=min(box.top for box in boxes),
        right=max(box.right for box in boxes),
        bottom=max(box.bottom for box in boxes),
    )


def focus_of(boxes: list[NormRect], protagonist: NormRect | None = None) -> CoverFocus | None:
    """인물을 못 찾으면 초점을 잡지 않는다(앱은 가운데로 자른다). 초점은 모든 인물을 덮는 박스의 가운데다."""
    keep = keep_box(boxes)
    if keep is None:
        return None
    center = round((keep.left + keep.right) / 2, 4), round((keep.top + keep.bottom) / 2, 4)
    return CoverFocus(*center, tuple(boxes), protagonist)


def pixel_crop(crop: CropRect, image: tuple[int, int]) -> tuple[int, int, int, int]:
    """정수 픽셀 (x, y, width, height). 위치와 크기를 따로 반올림하면 그림 밖으로 1px 나갈 수 있어 위치를 안쪽으로 당긴다."""
    width, height = min(round(crop.width), image[0]), min(round(crop.height), image[1])
    return min(round(crop.left), image[0] - width), min(round(crop.top), image[1] - height), width, height

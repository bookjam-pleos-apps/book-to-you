package com.voicestorybook.vehicle.core.shelf

// 그림 안의 영역. 0..1로 정규화했고 그림 왼쪽 위가 원점이다.
data class NormRect(val left: Double, val top: Double, val right: Double, val bottom: Double)

// 표지 한 장을 어디에 맞춰 자를지. subjects는 보여 주고 싶은 인물 박스들이고, protagonist는 그중 반드시 온전히 넣을
// 주인공이다(표시가 없는 옛 표는 null). (x, y)는 위치가 여럿일 때 고르는 기준점이다.
data class CoverFocus(
    val x: Double,
    val y: Double,
    val subjects: List<NormRect> = emptyList(),
    val protagonist: NormRect? = null,
)

val CENTER_FOCUS = CoverFocus(0.5, 0.5)

data class PixelSize(val width: Double, val height: Double)

// 그림 픽셀 좌표의 자를 영역.
data class CropRect(val left: Double, val top: Double, val width: Double, val height: Double)

// 배율은 centerCrop과 같다(칸을 빈틈없이 채우는 가장 작은 배율). 그래서 움직일 수 있는 축은 하나뿐이다. 그 축에서
// 주인공을 반드시 온전히 넣고(칸보다 크면 주인공 가운데), 그 안에서 온전히 들어가는 인물이 가장 많은 위치를 고른다.
// 같으면 초점을 가운데에 둔 위치에 가까운 쪽이다. 그림 밖으로 나가지 않는다.
fun cropRegion(image: PixelSize, slot: PixelSize, focus: CoverFocus): CropRect {
    require(image.width > 0 && image.height > 0 && slot.width > 0 && slot.height > 0) { "크기는 0보다 커야 한다: $image, $slot" }
    val scale = maxOf(slot.width / image.width, slot.height / image.height)
    val width = minOf(image.width, slot.width / scale)
    val height = minOf(image.height, slot.height / scale)
    return CropRect(
        left = placeWindow(width, image.width, focus.x, focus.subjects.map(::horizontal), focus.protagonist?.let(::horizontal)),
        top = placeWindow(height, image.height, focus.y, focus.subjects.map(::vertical), focus.protagonist?.let(::vertical)),
        width = width,
        height = height,
    )
}

private data class Span(val start: Double, val end: Double) {
    val length get() = end - start
    val middle get() = (start + end) / 2
    fun scaled(size: Double) = Span(start * size, end * size)
}

private fun horizontal(rect: NormRect) = Span(rect.left, rect.right)

private fun vertical(rect: NormRect) = Span(rect.top, rect.bottom)

// 경계에 딱 붙인 위치도 부동소수 오차 없이 '온전히 들어감'으로 센다.
private const val EDGE_SLACK = 1e-6

private fun placeWindow(window: Double, length: Double, center: Double, spans: List<Span>, protagonist: Span?): Double {
    val inPixels = spans.map { it.scaled(length) }
    val centered = center * length - window / 2
    val anywhere = Span(0.0, length - window)
    val lead = protagonist?.scaled(length) ?: return showMostSpans(window, centered, inPixels, anywhere)
    if (lead.length > window) return (lead.middle - window / 2).coerceIn(anywhere.start, anywhere.end)
    return showMostSpans(window, centered, inPixels, keepingWhole(lead, window, anywhere))
}

// lead가 창 안에 온전히 들어가는 창 시작 위치 범위. lead는 그림 안에 있고 창보다 작다.
private fun keepingWhole(lead: Span, window: Double, anywhere: Span): Span {
    val earliest = (lead.end - window).coerceIn(anywhere.start, anywhere.end)
    return Span(earliest, lead.start.coerceIn(earliest, anywhere.end))
}

// allowed는 창 시작 위치가 놓일 수 있는 범위다.
private fun showMostSpans(window: Double, centered: Double, spans: List<Span>, allowed: Span): Double {
    val candidates = (listOf(centered) + spans.flatMap { listOf(it.start, it.end - window) })
        .map { it.coerceIn(allowed.start, allowed.end) }
    val fullyShown = { position: Double -> spans.count { it.start >= position - EDGE_SLACK && it.end <= position + window + EDGE_SLACK } }
    val most = candidates.maxOf(fullyShown)
    return candidates.filter { fullyShown(it) == most }.minBy { kotlin.math.abs(it - centered) }
}

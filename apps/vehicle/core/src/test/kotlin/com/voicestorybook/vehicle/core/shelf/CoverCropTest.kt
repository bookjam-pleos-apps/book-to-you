package com.voicestorybook.vehicle.core.shelf

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@Serializable
private data class CropCasesDto(val cases: List<CropCaseDto>)

@Serializable
private data class CropCaseDto(
    val name: String,
    val image: List<Double>,
    val slot: List<Double>,
    val focus: FocusDto,
    val expected: List<Double>,
)

@Serializable
private data class FocusDto(val x: Double, val y: Double, val subjects: List<BoxDto> = emptyList())

@Serializable
private data class BoxDto(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
    val protagonist: Boolean = false,
)

private fun loadCases(): List<CropCaseDto> {
    val text = checkNotNull(CoverCropTest::class.java.getResource("/cover-crop-cases.json")).readText()
    return Json { ignoreUnknownKeys = true }.decodeFromString<CropCasesDto>(text).cases
}

private fun BoxDto.rect() = NormRect(left, top, right, bottom)

private fun CropCaseDto.focusValue() =
    CoverFocus(focus.x, focus.y, focus.subjects.map { it.rect() }, focus.subjects.firstOrNull { it.protagonist }?.rect())

private fun CropRect.asList() = listOf(left, top, width, height)

private fun CropRect.showsWhole(box: NormRect, image: PixelSize) =
    box.left * image.width >= left && box.right * image.width <= left + width &&
        box.top * image.height >= top && box.bottom * image.height <= top + height

class CoverCropTest {
    @Test
    fun `shared cases match the preview tool`() {
        val failures = loadCases().mapNotNull { case ->
            val actual = cropRegion(PixelSize(case.image[0], case.image[1]), PixelSize(case.slot[0], case.slot[1]), case.focusValue())
            val matches = actual.asList().zip(case.expected).all { (a, e) -> kotlin.math.abs(a - e) < 1e-6 }
            if (matches) null else "${case.name}: ${actual.asList()} != ${case.expected}"
        }
        assertEquals(emptyList(), failures)
    }

    @Test
    fun `window never leaves the image for any focus`() {
        val image = PixelSize(900.0, 494.0)
        val points = listOf(0.0, 0.01, 0.3, 0.5, 0.99, 1.0)
        val slots = listOf(PixelSize(3.0, 4.0), PixelSize(2.0, 1.0), PixelSize(16.0, 9.0), PixelSize(1.0, 1.0))
        val crops = slots.flatMap { slot -> points.flatMap { x -> points.map { y -> cropRegion(image, slot, CoverFocus(x, y)) } } }
        assertTrue(crops.all { it.left >= 0 && it.top >= 0 && it.left + it.width <= image.width + 1e-9 && it.top + it.height <= image.height + 1e-9 })
    }

    @Test
    fun `crop keeps the slot aspect`() {
        val crop = cropRegion(PixelSize(900.0, 494.0), PixelSize(415.0, 556.0), CENTER_FOCUS)
        assertEquals(415.0 / 556.0, crop.width / crop.height, 1e-9)
    }

    @Test
    fun `red hood stays whole in a square slot only when marked as the protagonist`() {
        val girl = NormRect(0.1529, 0.3631, 0.3326, 0.877)
        val others = listOf(NormRect(0.3984, 0.2639, 0.798, 0.619), NormRect(0.6562, 0.248, 0.7411, 0.4028), NormRect(0.8951, 0.1349, 0.9431, 0.2004))
        val image = PixelSize(900.0, 494.0)
        val square = PixelSize(1.0, 1.0)
        val unmarked = cropRegion(image, square, CoverFocus(0.548, 0.506, listOf(girl) + others))
        val marked = cropRegion(image, square, CoverFocus(0.548, 0.506, listOf(girl) + others, protagonist = girl))
        assertTrue(!unmarked.showsWhole(girl, image))
        assertTrue(marked.showsWhole(girl, image))
    }

    @Test
    fun `empty sizes are rejected`() {
        assertFailsWith<IllegalArgumentException> { cropRegion(PixelSize(0.0, 1.0), PixelSize(1.0, 1.0), CENTER_FOCUS) }
    }
}

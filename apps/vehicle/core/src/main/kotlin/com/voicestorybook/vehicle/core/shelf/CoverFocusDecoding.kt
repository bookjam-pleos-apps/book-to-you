package com.voicestorybook.vehicle.core.shelf

import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// 표지 초점 표(app/src/main/assets/cover_focus.json). gpu/compose/cover-focus 워크플로로 만들고 spike.run_cover_focus가 쓴다.
// 키는 그림 이름(drawable 이름)이다. 주인공은 subjects 중 protagonist: true인 박스 하나다(표시가 없으면 주인공 없이 자른다).
// 읽을 수 없는 표나 값(주인공이 둘 이상인 표지 포함)은 버리고, 빠진 그림은 가운데로 자른다.
@Serializable
private data class CoverFocusFileDto(val schemaVersion: Int, val covers: Map<String, CoverFocusDto>)

@Serializable
private data class CoverFocusDto(val x: Double, val y: Double, val subjects: List<NormRectDto> = emptyList())

@Serializable
private data class NormRectDto(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
    val protagonist: Boolean = false,
)

const val COVER_FOCUS_SCHEMA_VERSION = 1

private val json = Json { ignoreUnknownKeys = true }

fun decodeCoverFocus(body: String): Map<String, CoverFocus> {
    val dto = try {
        json.decodeFromString<CoverFocusFileDto>(body)
    } catch (e: SerializationException) {
        return emptyMap()
    } catch (e: IllegalArgumentException) {
        return emptyMap()
    }
    if (dto.schemaVersion != COVER_FOCUS_SCHEMA_VERSION) return emptyMap()
    return dto.covers.mapNotNull { (name, focus) -> focus.toFocus()?.let { name to it } }.toMap()
}

private fun CoverFocusDto.toFocus(): CoverFocus? {
    if (!isUnit(x) || !isUnit(y)) return null
    val boxes = subjects.map { NormRect(it.left, it.top, it.right, it.bottom) }
    if (!boxes.all(::isValidRect)) return null
    val leads = subjects.indices.filter { subjects[it].protagonist }
    if (leads.size > 1) return null
    return CoverFocus(x, y, boxes, leads.singleOrNull()?.let(boxes::get))
}

private fun isUnit(value: Double): Boolean = value in 0.0..1.0

private fun isValidRect(rect: NormRect): Boolean =
    listOf(rect.left, rect.top, rect.right, rect.bottom).all(::isUnit) && rect.left < rect.right && rect.top < rect.bottom

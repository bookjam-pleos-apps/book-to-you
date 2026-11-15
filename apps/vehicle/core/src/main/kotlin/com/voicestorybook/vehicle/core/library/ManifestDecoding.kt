package com.voicestorybook.vehicle.core.library

import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// 계약 v1(packages/shared/src/contracts/v1/library.ts)의 차량 쪽 사본. 필드 추가만 허용되므로 모르는 키는 무시한다.
// voiceId·kind는 계약상 필수지만, 빠진 서버에서도 목록은 쓸 수 있게 없으면 null로 받는다.
@Serializable
private data class ManifestDto(
    val schemaVersion: Int,
    val maxOfflineSeconds: Long,
    val stories: List<StoryDto>,
    val prompts: List<PromptDto>,
    val defaultVoiceId: String? = null,
)

@Serializable
private data class StoryDto(
    val renderId: String,
    val storyId: String,
    val title: String,
    val voiceLabel: String,
    val chapters: List<ChapterDto>,
    val voiceId: String? = null,
)

@Serializable
private data class ChapterDto(
    val index: Int,
    val role: String,
    // 장 제목이 생기기 전 서버는 이 필드를 보내지 않는다.
    val title: String? = null,
    val durationMs: Long,
    val bytes: Long,
    val sha256: String,
    val audioUrl: String,
)

@Serializable
private data class PromptDto(
    val id: String,
    val kind: String? = null,
    val voiceId: String? = null,
    val durationMs: Long,
    val bytes: Long,
    val sha256: String,
    val audioUrl: String,
)

sealed interface ManifestDecoding {
    data class Decoded(val library: Library) : ManifestDecoding
    data class Rejected(val reason: String) : ManifestDecoding
}

const val SUPPORTED_SCHEMA_VERSION = 1

private val json = Json { ignoreUnknownKeys = true }
private val AUDIO_URL = Regex("^/v1/audio/([^/]+)$")
private val SHA256 = Regex("^[a-f0-9]{64}$")

fun decodeManifest(body: String): ManifestDecoding {
    val dto = try {
        json.decodeFromString<ManifestDto>(body)
    } catch (e: SerializationException) {
        return ManifestDecoding.Rejected("malformed: ${e.message}")
    } catch (e: IllegalArgumentException) {
        return ManifestDecoding.Rejected("malformed: ${e.message}")
    }
    if (dto.schemaVersion != SUPPORTED_SCHEMA_VERSION) return ManifestDecoding.Rejected("schemaVersion ${dto.schemaVersion}")
    val invalid = invalidAssetUrl(dto)
    if (invalid != null) return ManifestDecoding.Rejected("invalid asset: $invalid")
    return ManifestDecoding.Decoded(toLibrary(dto))
}

private fun invalidAssetUrl(dto: ManifestDto): String? {
    val assets = dto.prompts.map { it.audioUrl to it.sha256 } +
        dto.stories.flatMap { story -> story.chapters.map { it.audioUrl to it.sha256 } }
    return assets.firstOrNull { (url, sha) -> !AUDIO_URL.matches(url) || !SHA256.matches(sha) }?.first
}

private fun asset(audioUrl: String, durationMs: Long, bytes: Long, sha256: String) = AudioAsset(
    audioId = requireNotNull(AUDIO_URL.find(audioUrl)).groupValues[1],
    audioUrl = audioUrl,
    durationMs = durationMs,
    bytes = bytes,
    sha256 = sha256,
)

private fun toLibrary(dto: ManifestDto) = Library(
    maxOfflineSeconds = dto.maxOfflineSeconds,
    stories = dto.stories.map { s ->
        Story(s.renderId, s.storyId, s.title, s.voiceLabel, s.chapters.map { c ->
            Chapter(c.index, c.role, asset(c.audioUrl, c.durationMs, c.bytes, c.sha256), c.title)
        }, s.voiceId)
    },
    prompts = dto.prompts.map { p -> Prompt(p.id, asset(p.audioUrl, p.durationMs, p.bytes, p.sha256), p.kind, p.voiceId) },
    defaultVoiceId = dto.defaultVoiceId,
)

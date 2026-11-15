package com.voicestorybook.vehicle.core.library

data class AudioAsset(
    val audioId: String,
    val audioUrl: String,
    val durationMs: Long,
    val bytes: Long,
    val sha256: String,
)

data class Chapter(val index: Int, val role: String, val asset: AudioAsset, val title: String? = null)

data class Story(
    val renderId: String,
    val storyId: String,
    val title: String,
    val voiceLabel: String,
    val chapters: List<Chapter>,
    val voiceId: String? = null,
) {
    val durationMs: Long get() = chapters.sumOf { it.asset.durationMs }
}

data class Prompt(val id: String, val asset: AudioAsset, val kind: String? = null, val voiceId: String? = null)

const val BELT_UNFASTENED = "belt_unfastened"

// 이야기와 같은 목소리의 안내를 먼저 고른다. 없으면 다른 목소리라도 튼다(안전 안내라 침묵보다 낫다).
fun promptFor(library: Library, kind: String, voiceId: String?): Prompt? {
    val ofKind = library.prompts.filter { it.kind == null || it.kind == kind }
    return ofKind.firstOrNull { voiceId != null && it.voiceId == voiceId } ?: ofKind.firstOrNull()
}

data class Library(
    val maxOfflineSeconds: Long,
    val stories: List<Story>,
    val prompts: List<Prompt>,
    // 부모가 웹에서 정한 대표 목소리. 정하지 않았거나 그 목소리를 쓸 수 없으면 null이다.
    val defaultVoiceId: String? = null,
) {
    fun story(renderId: String): Story? = stories.firstOrNull { it.renderId == renderId }
}

// 안내 음성을 먼저 받는다. 작고, 벨트 안내는 이야기보다 먼저 준비돼야 한다.
fun wantedAssets(library: Library): List<AudioAsset> =
    library.prompts.map { it.asset } +
        library.stories.flatMap { story -> story.chapters.sortedBy { it.index }.map { it.asset } }

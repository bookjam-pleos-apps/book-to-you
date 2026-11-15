package com.voicestorybook.vehicle.core.library

data class CachedAudio(val audioId: String, val sha256: String)

data class CachePlan(val toDownload: List<AudioAsset>, val toDelete: List<String>)

// manifest에 없는 항목은 지운다(계약 규칙). 같은 id라도 sha256이 바뀌면 지우고 다시 받는다.
fun planCache(wanted: List<AudioAsset>, cached: List<CachedAudio>): CachePlan {
    val wantedById = wanted.associateBy { it.audioId }
    val fresh = cached.filter { wantedById[it.audioId]?.sha256 == it.sha256 }.map { it.audioId }.toSet()
    return CachePlan(
        toDownload = wanted.distinctBy { it.audioId }.filterNot { it.audioId in fresh },
        toDelete = cached.map { it.audioId }.filterNot { it in fresh }.distinct(),
    )
}

sealed interface OfflineAccess {
    data class Allowed(val remainingMs: Long) : OfflineAccess
    data object Expired : OfflineAccess
}

// 마지막 동기화 뒤 maxOfflineSeconds가 지나면 재생을 막는다. 동의 철회가 오프라인 차량에도 닿게 하는 기한이다.
// 시계가 마지막 동기화보다 앞이면 기한을 증명할 수 없으므로 만료로 본다.
fun offlineAccess(lastSyncedAtMs: Long?, maxOfflineSeconds: Long, nowMs: Long): OfflineAccess {
    if (lastSyncedAtMs == null) return OfflineAccess.Expired
    val elapsed = nowMs - lastSyncedAtMs
    if (elapsed < 0) return OfflineAccess.Expired
    val remaining = maxOfflineSeconds * 1000 - elapsed
    return if (remaining > 0) OfflineAccess.Allowed(remaining) else OfflineAccess.Expired
}

fun isPlayable(story: Story, cachedIds: Set<String>): Boolean =
    story.chapters.isNotEmpty() && story.chapters.all { it.asset.audioId in cachedIds }

// 지금 틀 수 있는 이야기. 목록을 아직 못 읽었으면 비어 있다.
fun playableStories(library: Library?, cachedIds: Set<String>): List<Story> =
    library?.stories.orEmpty().filter { isPlayable(it, cachedIds) }

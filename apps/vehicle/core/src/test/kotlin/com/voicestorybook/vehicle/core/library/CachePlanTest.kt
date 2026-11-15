package com.voicestorybook.vehicle.core.library

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

internal fun asset(id: String, sha: Char = 'a', durationMs: Long = 1_000) =
    AudioAsset(id, "/v1/audio/$id", durationMs, 10, sha.toString().repeat(64))

internal fun story(renderId: String, vararg chapterIds: String) =
    Story(renderId, "s-$renderId", "title $renderId", "엄마", chapterIds.mapIndexed { i, id -> Chapter(i, "body", asset(id)) })

class CachePlanTest {
    @Test
    fun `wanted assets put prompts first and chapters in index order`() {
        val shuffled = story("r1", "c0", "c1").let { it.copy(chapters = it.chapters.reversed()) }
        val library = Library(60, listOf(shuffled), listOf(Prompt("p", asset("p"))))
        assertEquals(listOf("p", "c0", "c1"), wantedAssets(library).map { it.audioId })
    }

    @Test
    fun `downloads what is missing in manifest order and deletes what the manifest dropped`() {
        val plan = planCache(
            wanted = listOf(asset("p"), asset("c0"), asset("c1")),
            cached = listOf(CachedAudio("c0", "a".repeat(64)), CachedAudio("old", "a".repeat(64))),
        )
        assertEquals(listOf("p", "c1"), plan.toDownload.map { it.audioId })
        assertEquals(listOf("old"), plan.toDelete)
    }

    @Test
    fun `a changed hash is deleted and downloaded again`() {
        val plan = planCache(listOf(asset("c0", sha = 'b')), listOf(CachedAudio("c0", "a".repeat(64))))
        assertEquals(listOf("c0"), plan.toDownload.map { it.audioId })
        assertEquals(listOf("c0"), plan.toDelete)
    }

    @Test
    fun `plan never downloads the same asset twice and keeps nothing extra`() {
        val wanted = listOf(asset("c0"), asset("c0"), asset("c1"))
        val plan = planCache(wanted, emptyList())
        assertEquals(listOf("c0", "c1"), plan.toDownload.map { it.audioId })
        assertTrue(planCache(wanted, plan.toDownload.map { CachedAudio(it.audioId, it.sha256) }).let {
            it.toDownload.isEmpty() && it.toDelete.isEmpty()
        })
    }

    @Test
    fun `offline access lasts maxOfflineSeconds from the last sync`() {
        assertEquals(OfflineAccess.Allowed(1_000), offlineAccess(lastSyncedAtMs = 0, maxOfflineSeconds = 60, nowMs = 59_000))
        assertIs<OfflineAccess.Expired>(offlineAccess(0, 60, 60_000))
        assertIs<OfflineAccess.Expired>(offlineAccess(null, 60, 0))
    }

    @Test
    fun `a clock behind the last sync cannot prove freshness`() {
        assertIs<OfflineAccess.Expired>(offlineAccess(lastSyncedAtMs = 10_000, maxOfflineSeconds = 60, nowMs = 9_999))
    }

    @Test
    fun `a story is playable only when every chapter is cached`() {
        val s = story("r1", "c0", "c1")
        assertTrue(isPlayable(s, setOf("c0", "c1")))
        assertEquals(false, isPlayable(s, setOf("c0")))
        assertEquals(false, isPlayable(story("empty"), emptySet()))
    }

    @Test
    fun `belt prompt follows the story voice and falls back to any belt prompt`() {
        val mom = Prompt("p-mom", asset("p-mom"), BELT_UNFASTENED, "mom")
        val dad = Prompt("p-dad", asset("p-dad"), BELT_UNFASTENED, "dad")
        val library = Library(60, emptyList(), listOf(mom, dad))
        assertEquals("p-dad", promptFor(library, BELT_UNFASTENED, "dad")?.id)
        assertEquals("p-mom", promptFor(library, BELT_UNFASTENED, "grandma")?.id)
        assertEquals("p-mom", promptFor(library, BELT_UNFASTENED, null)?.id)
        assertEquals(null, promptFor(library, "door_opened", "mom"))
        assertEquals(null, promptFor(library.copy(prompts = emptyList()), BELT_UNFASTENED, "mom"))
    }
}

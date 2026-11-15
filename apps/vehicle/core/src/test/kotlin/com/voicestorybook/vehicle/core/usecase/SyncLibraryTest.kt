package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.library.CachedAudio
import com.voicestorybook.vehicle.core.port.AudioStore
import com.voicestorybook.vehicle.core.port.Fetched
import com.voicestorybook.vehicle.core.port.LibraryGateway
import com.voicestorybook.vehicle.core.port.LibrarySnapshot
import com.voicestorybook.vehicle.core.port.SnapshotStore
import com.voicestorybook.vehicle.core.port.StagedAudio
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

private val SHA_A = "a".repeat(64)

internal fun manifest(maxOfflineSeconds: Long, vararg chapterIds: String) = """
    {"schemaVersion":1,"maxOfflineSeconds":$maxOfflineSeconds,"prompts":[],
     "stories":[{"renderId":"r1","storyId":"s","title":"t","voiceLabel":"엄마","chapters":[
       ${chapterIds.mapIndexed { i, id -> """{"index":$i,"role":"body","durationMs":1,"bytes":1,"sha256":"$SHA_A","audioUrl":"/v1/audio/$id"}""" }.joinToString(",")}
     ]}]}
""".trimIndent()

internal class FakeGateway(var manifest: Fetched<String>, val badHash: Set<String> = emptySet()) : LibraryGateway {
    val downloads = mutableListOf<String>()
    override suspend fun fetchManifest() = manifest
    override suspend fun download(asset: AudioAsset): Fetched<StagedAudio> {
        downloads += asset.audioId
        return Fetched.Ok(StagedAudio("tmp-${asset.audioId}", if (asset.audioId in badHash) "b".repeat(64) else asset.sha256))
    }
}

internal class FakeAudio(initial: List<String> = emptyList(), private val failCommit: Set<String> = emptySet()) : AudioStore {
    val files = initial.associateWith { SHA_A }.toMutableMap()
    val discarded = mutableListOf<String>()
    override fun cached() = files.map { (id, sha) -> CachedAudio(id, sha) }
    override fun commit(staged: StagedAudio, asset: AudioAsset): Boolean {
        if (asset.audioId in failCommit) return false
        files[asset.audioId] = staged.sha256
        return true
    }
    override fun discard(staged: StagedAudio) { discarded += staged.handle }
    override fun delete(audioId: String) { files.remove(audioId) }
    override fun deleteAll() = files.clear()
}

internal class FakeSnapshots : SnapshotStore {
    var saved: LibrarySnapshot? = null
    override fun load() = saved
    override fun save(snapshot: LibrarySnapshot) { saved = snapshot }
    override fun clear() { saved = null }
}

class SyncLibraryTest {
    private var now = 1_000L
    private val snapshots = FakeSnapshots()

    private fun sync(gateway: FakeGateway, audio: FakeAudio) = SyncLibrary(gateway, audio, snapshots) { now }

    @Test
    fun `downloads missing chapters, deletes dropped ones, and verifies hashes`() = runTest {
        val gateway = FakeGateway(Fetched.Ok(manifest(60, "c0", "c1", "c2")), badHash = setOf("c2"))
        val audio = FakeAudio(listOf("c0", "old"))
        val result = assertIs<SyncResult.Synced>(sync(gateway, audio).sync())
        assertEquals(listOf("c1", "c2"), gateway.downloads)
        assertEquals(setOf("c0", "c1"), audio.files.keys)
        assertEquals(listOf("tmp-c2"), audio.discarded)
        assertEquals(DownloadTally(downloaded = 1, corrupted = 1), result.tally)
        assertEquals(1, result.deleted)
        assertEquals(1_000L, snapshots.saved?.syncedAtMs)
    }

    @Test
    fun `a rejected token forgets everything`() = runTest {
        val audio = FakeAudio(listOf("c0"))
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        assertEquals(SyncResult.Unpaired, sync(FakeGateway(Fetched.Unauthorized), audio).sync())
        assertEquals(emptySet(), audio.files.keys)
        assertNull(snapshots.saved)
    }

    @Test
    fun `offline keeps the last library until maxOfflineSeconds then forgets it`() = runTest {
        val gateway = FakeGateway(Fetched.Ok(manifest(60, "c0")))
        val audio = FakeAudio()
        val sync = sync(gateway, audio)
        assertEquals(OfflineLibrary.Missing, sync.loadOffline())
        sync.sync()
        gateway.manifest = Fetched.Failed("timeout")
        assertIs<SyncResult.Offline>(sync.sync())
        now += 59_000
        assertIs<OfflineLibrary.Available>(sync.loadOffline())
        now += 1_000
        assertEquals(OfflineLibrary.Expired, sync.loadOffline())
        assertEquals(emptySet(), audio.files.keys)
    }

    @Test
    fun `an unreadable saved list is discarded as missing, not expired`() {
        val audio = FakeAudio(initial = listOf("c0"))
        snapshots.save(LibrarySnapshot("not a manifest", 0))
        assertEquals(OfflineLibrary.Missing, sync(FakeGateway(Fetched.Failed("x")), audio).loadOffline())
        assertEquals(emptySet(), audio.files.keys)
        assertNull(snapshots.saved)
    }

    @Test
    fun `a file that cannot be moved into the cache counts as failed`() = runTest {
        val audio = FakeAudio(failCommit = setOf("c1"))
        val result = assertIs<SyncResult.Synced>(sync(FakeGateway(Fetched.Ok(manifest(60, "c0", "c1"))), audio).sync())
        assertEquals(DownloadTally(downloaded = 1, failed = 1), result.tally)
        assertEquals(setOf("c0"), audio.files.keys)
    }
}

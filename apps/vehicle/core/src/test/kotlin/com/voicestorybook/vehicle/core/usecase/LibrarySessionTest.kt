package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.port.Fetched
import com.voicestorybook.vehicle.core.port.LibraryGateway
import com.voicestorybook.vehicle.core.port.LibrarySnapshot
import com.voicestorybook.vehicle.core.port.StagedAudio
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

// 첫 manifest 요청을 열어 둔 채 멈춰, 동기화가 겹치는 상황을 만든다.
private class GatedGateway(private val body: String) : LibraryGateway {
    val gate = CompletableDeferred<Unit>()
    var fetches = 0
    override suspend fun fetchManifest(): Fetched<String> {
        fetches += 1
        gate.await()
        return Fetched.Ok(body)
    }
    override suspend fun download(asset: AudioAsset): Fetched<StagedAudio> = Fetched.Ok(StagedAudio("tmp", asset.sha256))
}

class LibrarySessionTest {
    private var now = 0L
    private val snapshots = FakeSnapshots()

    private fun session(gateway: LibraryGateway) = LibrarySession(SyncLibrary(gateway, FakeAudio(), snapshots) { now })

    @Test
    fun `restore shows the cached library, not expired, when nothing was ever synced`() {
        val session = session(FakeGateway(Fetched.Failed("x")))
        session.restore()
        assertEquals(LibraryStatus.NotSynced(SyncNote.Cached), session.status.value)
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        session.restore()
        assertEquals(SyncNote.Cached, assertIs<LibraryStatus.Showing>(session.status.value).note)
    }

    @Test
    fun `restore after the offline limit shows expired`() {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        now = 60_000
        val session = session(FakeGateway(Fetched.Failed("x")))
        session.restore()
        assertEquals(LibraryStatus.Expired, session.status.value)
    }

    @Test
    fun `the first sync shows syncing instead of expired`() = runTest {
        val gateway = GatedGateway(manifest(60, "c0"))
        val session = session(gateway)
        session.restore()
        val first = async { session.refresh() }
        testScheduler.runCurrent()
        assertEquals(LibraryStatus.NotSynced(SyncNote.Syncing), session.status.value)
        gateway.gate.complete(Unit)
        first.await()
        assertIs<LibraryStatus.Showing>(session.status.value)
    }

    @Test
    fun `restoreIfNotLoaded reads the saved library only when nothing was loaded yet`() = runTest {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        val session = session(FakeGateway(Fetched.Ok(manifest(60, "c1"))))
        session.restoreIfNotLoaded()
        assertEquals(SyncNote.Cached, assertIs<LibraryStatus.Showing>(session.status.value).note)
        session.refresh()
        session.restoreIfNotLoaded()
        assertIs<SyncNote.Synced>(assertIs<LibraryStatus.Showing>(session.status.value).note)
    }

    @Test
    fun `a quiet refresh keeps the shown library without a syncing notice`() = runTest {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        val gateway = GatedGateway(manifest(60, "c1"))
        val session = session(gateway)
        session.restore()
        val quiet = async { session.refresh(announce = false) }
        testScheduler.runCurrent()
        assertEquals(SyncNote.Cached, assertIs<LibraryStatus.Showing>(session.status.value).note)
        gateway.gate.complete(Unit)
        quiet.await()
        assertIs<SyncNote.Synced>(assertIs<LibraryStatus.Showing>(session.status.value).note)
    }

    @Test
    fun `a failed first sync shows offline instead of expired`() = runTest {
        val session = session(FakeGateway(Fetched.Failed("timeout")))
        session.restore()
        session.refresh()
        assertEquals(LibraryStatus.NotSynced(SyncNote.Offline), session.status.value)
    }

    @Test
    fun `expireIfDue keeps a valid library as it is and expires an old one`() = runTest {
        val session = session(FakeGateway(Fetched.Ok(manifest(60, "c0"))))
        session.refresh()
        val synced = session.status.value
        now += 59_000
        assertEquals(false, session.expireIfDue())
        assertEquals(synced, session.status.value)
        now += 1_000
        assertEquals(true, session.expireIfDue())
        assertEquals(LibraryStatus.Expired, session.status.value)
        assertNull(snapshots.saved)
    }

    @Test
    fun `expireIfDue waits while a refresh is running`() = runTest {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        val gateway = GatedGateway(manifest(60, "c0"))
        val session = session(gateway)
        session.restore()
        now = 60_000
        val running = async { session.refresh() }
        testScheduler.runCurrent()
        assertEquals(false, session.expireIfDue())
        assertEquals(0L, snapshots.saved?.syncedAtMs)
        gateway.gate.complete(Unit)
        running.await()
        assertIs<LibraryStatus.Showing>(session.status.value)
    }

    @Test
    fun `expireIfDue drops a library whose saved list became unreadable`() {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        val session = session(FakeGateway(Fetched.Failed("x")))
        session.restore()
        snapshots.save(LibrarySnapshot("not a manifest", 0))
        assertEquals(false, session.expireIfDue())
        assertEquals(LibraryStatus.NotSynced(SyncNote.Cached), session.status.value)
    }

    @Test
    fun `expireIfDue does not turn a first sync into expired`() {
        val session = session(FakeGateway(Fetched.Failed("x")))
        session.restore()
        assertEquals(false, session.expireIfDue())
        assertEquals(LibraryStatus.NotSynced(SyncNote.Cached), session.status.value)
    }

    @Test
    fun `a refresh while another is running is skipped`() = runTest {
        val gateway = GatedGateway(manifest(60, "c0"))
        val session = session(gateway)
        val first = async { session.refresh() }
        testScheduler.runCurrent()
        assertNull(session.refresh())
        gateway.gate.complete(Unit)
        assertIs<SyncResult.Synced>(first.await())
        assertEquals(1, gateway.fetches)
    }

    @Test
    fun `offline keeps the cached library with an offline note`() = runTest {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        val session = session(FakeGateway(Fetched.Failed("timeout")))
        session.refresh()
        assertEquals(SyncNote.Offline, assertIs<LibraryStatus.Showing>(session.status.value).note)
        assertEquals("r1", session.library?.stories?.single()?.renderId)
    }

    @Test
    fun `unpaired empties the session`() = runTest {
        snapshots.save(LibrarySnapshot(manifest(60, "c0"), 0))
        val session = session(FakeGateway(Fetched.Unauthorized))
        session.restore()
        assertEquals(SyncResult.Unpaired, session.refresh())
        assertEquals(LibraryStatus.NotSynced(SyncNote.Cached), session.status.value)
        assertNull(session.library)
    }
}

package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.Library
import kotlin.test.Test
import kotlin.test.assertEquals

class SyncWhenOnlineTest {
    private val library = Library(60, emptyList(), emptyList())

    @Test
    fun `offline and expired states sync again when the network returns`() {
        assertEquals(true, needsSyncWhenOnline(LibraryStatus.NotSynced(SyncNote.Offline)))
        assertEquals(true, needsSyncWhenOnline(LibraryStatus.Showing(library, SyncNote.Offline)))
        assertEquals(true, needsSyncWhenOnline(LibraryStatus.Expired))
    }

    @Test
    fun `synced, syncing and rejected states are left alone`() {
        assertEquals(false, needsSyncWhenOnline(LibraryStatus.Showing(library, SyncNote.Synced(DownloadTally()))))
        assertEquals(false, needsSyncWhenOnline(LibraryStatus.Showing(library, SyncNote.Syncing)))
        assertEquals(false, needsSyncWhenOnline(LibraryStatus.NotSynced(SyncNote.Rejected)))
        assertEquals(false, needsSyncWhenOnline(LibraryStatus.NotSynced(SyncNote.Cached)))
    }
}

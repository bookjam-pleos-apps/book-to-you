package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.story
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LibraryNoticeTest {
    private val library = Library(60, listOf(story("r1", "c0")), emptyList())

    @Test
    fun `a healthy library shows no notice`() {
        assertNull(libraryNoticeOf(LibraryStatus.Showing(library, SyncNote.Synced(DownloadTally(downloaded = 1)))))
        assertNull(libraryNoticeOf(LibraryStatus.Showing(library, SyncNote.Cached)))
    }

    @Test
    fun `trouble and waiting states each get their own notice`() {
        assertEquals(LibraryNotice.FirstOffline, libraryNoticeOf(LibraryStatus.NotSynced(SyncNote.Offline)))
        assertEquals(LibraryNotice.Offline, libraryNoticeOf(LibraryStatus.Showing(library, SyncNote.Offline)))
        assertEquals(LibraryNotice.Expired, libraryNoticeOf(LibraryStatus.Expired))
        assertEquals(LibraryNotice.Syncing, libraryNoticeOf(LibraryStatus.Showing(library, SyncNote.Syncing)))
        assertEquals(LibraryNotice.PartlyDownloaded, libraryNoticeOf(LibraryStatus.Showing(library, SyncNote.Synced(DownloadTally(failed = 1)))))
        assertEquals(LibraryNotice.Empty, libraryNoticeOf(LibraryStatus.Showing(library.copy(stories = emptyList()), SyncNote.Synced(DownloadTally()))))
    }
}

package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.Library

enum class LibraryNotice { Syncing, FirstOffline, Offline, Expired, Rejected, Empty, PartlyDownloaded }

// 홈 위 한 줄. 정상일 때는 null이라 아무것도 보이지 않는다(UI 원칙: 이상할 때만 알린다).
fun libraryNoticeOf(status: LibraryStatus): LibraryNotice? = when (status) {
    is LibraryStatus.NotSynced -> firstSyncNotice(status.note)
    LibraryStatus.Expired -> LibraryNotice.Expired
    is LibraryStatus.Showing -> showingNotice(status.library, status.note)
}

private fun firstSyncNotice(note: SyncNote): LibraryNotice = when (note) {
    SyncNote.Offline -> LibraryNotice.FirstOffline
    SyncNote.Rejected -> LibraryNotice.Rejected
    SyncNote.Cached, SyncNote.Syncing, is SyncNote.Synced -> LibraryNotice.Syncing
}

private fun showingNotice(library: Library, note: SyncNote): LibraryNotice? = when (note) {
    is SyncNote.Synced -> syncedNotice(library, note.tally)
    SyncNote.Cached -> null
    SyncNote.Syncing -> LibraryNotice.Syncing
    SyncNote.Offline -> LibraryNotice.Offline
    SyncNote.Rejected -> LibraryNotice.Rejected
}

private fun syncedNotice(library: Library, tally: DownloadTally): LibraryNotice? = when {
    library.stories.isEmpty() -> LibraryNotice.Empty
    tally.failed + tally.corrupted > 0 -> LibraryNotice.PartlyDownloaded
    else -> null
}

package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.Library
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex

sealed interface SyncNote {
    data object Cached : SyncNote
    data object Syncing : SyncNote
    data class Synced(val tally: DownloadTally) : SyncNote
    data object Offline : SyncNote
    data object Rejected : SyncNote
}

sealed interface LibraryStatus {
    // 보여 줄 목록이 없다(첫 연결 직후, 연결 해제 뒤, 읽을 수 없는 목록을 지운 뒤). 기한이 지나 지운 Expired와 다르다.
    data class NotSynced(val note: SyncNote) : LibraryStatus
    data object Expired : LibraryStatus
    data class Showing(val library: Library, val note: SyncNote) : LibraryStatus
}

// 앱이 아는 라이브러리의 단일 주인. 화면과 재생은 이 상태만 읽고, 디스크를 다시 해석하지 않는다.
// 만료 판정과 삭제는 restore, refresh, expireIfDue에서만 일어난다.
class LibrarySession(private val syncLibrary: SyncLibrary) {
    private val state = MutableStateFlow<LibraryStatus>(LibraryStatus.NotSynced(SyncNote.Cached))
    private val refreshing = Mutex()
    val status: StateFlow<LibraryStatus> = state

    val library: Library? get() = (state.value as? LibraryStatus.Showing)?.library

    fun restore() {
        state.value = fromOffline(syncLibrary.loadOffline(), SyncNote.Cached)
    }

    // 화면 없이 재생 서비스만 다시 뜬 프로세스(핸들 키 재개, 차 미디어 화면, 음성 검색)도 저장된 책장을 보게 한다.
    // 이미 읽었거나 받는 중이면 그 상태를 덮지 않는다.
    fun restoreIfNotLoaded() {
        if (state.value == LibraryStatus.NotSynced(SyncNote.Cached)) restore()
    }

    // 이미 동기화 중이면 하나 더 돌리지 않고 null을 돌려준다.
    // announce가 false면 받는 동안 안내를 띄우지 않는다. 앱을 켜 둔 채 주기적으로 받을 때 홈이 깜빡이지 않게 한다.
    suspend fun refresh(announce: Boolean = true): SyncResult? {
        if (!refreshing.tryLock()) return null
        try {
            if (announce) state.value = withNote(state.value, SyncNote.Syncing)
            return syncLibrary.sync().also { state.value = afterSync(it) }
        } finally {
            refreshing.unlock()
        }
    }

    // 앱을 켜 둔 채 기한이 지날 수 있다. 화면으로 돌아올 때와 재생 직전에 부른다.
    // 기한 안이면 상태(동기화 메모 포함)를 건드리지 않는다. 만료됐으면 true.
    // 동기화 중에는 판정하지 않는다. 내려받는 파일을 지울 수 있고, 동기화가 끝나면 기한도 새로 정해진다.
    fun expireIfDue(): Boolean {
        if (state.value !is LibraryStatus.Showing) return state.value == LibraryStatus.Expired
        if (refreshing.isLocked) return false
        val offline = syncLibrary.loadOffline()
        if (offline is OfflineLibrary.Available) return false
        state.value = fromOffline(offline, SyncNote.Cached)
        return offline == OfflineLibrary.Expired
    }

    fun clear() {
        syncLibrary.forget()
        state.value = LibraryStatus.NotSynced(SyncNote.Cached)
    }

    private fun afterSync(result: SyncResult): LibraryStatus = when (result) {
        is SyncResult.Synced -> LibraryStatus.Showing(result.library, SyncNote.Synced(result.tally))
        SyncResult.Unpaired -> LibraryStatus.NotSynced(SyncNote.Cached)
        is SyncResult.Offline -> fromOffline(syncLibrary.loadOffline(), SyncNote.Offline)
        is SyncResult.Rejected -> fromOffline(syncLibrary.loadOffline(), SyncNote.Rejected)
    }
}

private fun fromOffline(offline: OfflineLibrary, note: SyncNote): LibraryStatus = when (offline) {
    is OfflineLibrary.Available -> LibraryStatus.Showing(offline.library, note)
    OfflineLibrary.Missing -> LibraryStatus.NotSynced(note)
    OfflineLibrary.Expired -> LibraryStatus.Expired
}

private fun withNote(status: LibraryStatus, note: SyncNote): LibraryStatus = when (status) {
    is LibraryStatus.Showing -> status.copy(note = note)
    is LibraryStatus.NotSynced -> status.copy(note = note)
    LibraryStatus.Expired -> status
}

// 네트워크가 돌아왔을 때 다시 받을지. 인터넷이 없어서 생긴 상태(오프라인, 기한 만료)만 다시 받는다.
// 목록 형식 거부(Rejected)는 네트워크와 상관없어 다시 받아도 같다.
fun needsSyncWhenOnline(status: LibraryStatus): Boolean = when (status) {
    LibraryStatus.Expired -> true
    is LibraryStatus.NotSynced -> status.note == SyncNote.Offline
    is LibraryStatus.Showing -> status.note == SyncNote.Offline
}

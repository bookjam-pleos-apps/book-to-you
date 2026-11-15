package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.ManifestDecoding
import com.voicestorybook.vehicle.core.library.OfflineAccess
import com.voicestorybook.vehicle.core.library.decodeManifest
import com.voicestorybook.vehicle.core.library.offlineAccess
import com.voicestorybook.vehicle.core.library.planCache
import com.voicestorybook.vehicle.core.library.wantedAssets
import com.voicestorybook.vehicle.core.port.AudioStore
import com.voicestorybook.vehicle.core.port.Fetched
import com.voicestorybook.vehicle.core.port.LibraryGateway
import com.voicestorybook.vehicle.core.port.LibrarySnapshot
import com.voicestorybook.vehicle.core.port.SnapshotStore

data class DownloadTally(val downloaded: Int = 0, val corrupted: Int = 0, val failed: Int = 0, val unauthorized: Boolean = false)

sealed interface SyncResult {
    data class Synced(val library: Library, val deleted: Int, val tally: DownloadTally) : SyncResult
    data object Unpaired : SyncResult
    data class Offline(val reason: String) : SyncResult
    data class Rejected(val reason: String) : SyncResult
}

sealed interface OfflineLibrary {
    data class Available(val library: Library, val remainingMs: Long) : OfflineLibrary
    // 보여 줄 목록이 없다. 받은 적이 없거나, 남은 목록을 읽을 수 없어 지웠다. 기한이 지난 Expired와 다르다.
    data object Missing : OfflineLibrary
    data object Expired : OfflineLibrary
}

class SyncLibrary(
    private val gateway: LibraryGateway,
    private val audio: AudioStore,
    private val snapshots: SnapshotStore,
    private val clock: () -> Long,
) {
    suspend fun sync(): SyncResult {
        val body = when (val fetched = gateway.fetchManifest()) {
            is Fetched.Ok -> fetched.value
            Fetched.Unauthorized -> return unpair()
            is Fetched.Failed -> return SyncResult.Offline(fetched.reason)
        }
        val library = when (val decoded = decodeManifest(body)) {
            is ManifestDecoding.Decoded -> decoded.library
            is ManifestDecoding.Rejected -> return SyncResult.Rejected(decoded.reason)
        }
        snapshots.save(LibrarySnapshot(body, clock()))
        val plan = planCache(wantedAssets(library), audio.cached())
        plan.toDelete.forEach(audio::delete)
        val tally = plan.toDownload.fold(DownloadTally()) { tally, asset -> downloadInto(tally, asset) }
        if (tally.unauthorized) return unpair()
        return SyncResult.Synced(library, plan.toDelete.size, tally)
    }

    // 기한이 지났으면 받아 둔 오디오와 목록을 지운다. 목록을 받은 적이 없으면 지울 것도 없다.
    fun loadOffline(): OfflineLibrary {
        val snapshot = snapshots.load() ?: return OfflineLibrary.Missing
        val decoded = decodeManifest(snapshot.manifestBody)
        if (decoded !is ManifestDecoding.Decoded) return discardUnreadable()
        val access = offlineAccess(snapshot.syncedAtMs, decoded.library.maxOfflineSeconds, clock())
        if (access !is OfflineAccess.Allowed) return expire()
        return OfflineLibrary.Available(decoded.library, access.remainingMs)
    }

    fun forget() {
        audio.deleteAll()
        snapshots.clear()
    }

    // 부모가 기기 연결을 끊으면 토큰이 거부된다. 받아 둔 목소리도 남기지 않는다.
    private fun unpair(): SyncResult {
        forget()
        return SyncResult.Unpaired
    }

    // 앱 업데이트로 스키마가 바뀌는 등 남은 목록을 읽을 수 없다. 어떤 파일이 쓰이는지 모르니 지우고 다시 받게 한다.
    private fun discardUnreadable(): OfflineLibrary {
        forget()
        return OfflineLibrary.Missing
    }

    private fun expire(): OfflineLibrary {
        forget()
        return OfflineLibrary.Expired
    }

    // 토큰이 거부되면 나머지는 받지 않는다.
    private suspend fun downloadInto(tally: DownloadTally, asset: AudioAsset): DownloadTally {
        if (tally.unauthorized) return tally
        val staged = when (val fetched = gateway.download(asset)) {
            is Fetched.Ok -> fetched.value
            Fetched.Unauthorized -> return tally.copy(unauthorized = true)
            is Fetched.Failed -> return tally.copy(failed = tally.failed + 1)
        }
        if (staged.sha256 != asset.sha256) {
            audio.discard(staged)
            return tally.copy(corrupted = tally.corrupted + 1)
        }
        if (!audio.commit(staged, asset)) return tally.copy(failed = tally.failed + 1)
        return tally.copy(downloaded = tally.downloaded + 1)
    }
}

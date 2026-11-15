package com.voicestorybook.vehicle.core.port

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.library.CachedAudio
import com.voicestorybook.vehicle.core.pairing.PollOutcome
import com.voicestorybook.vehicle.core.report.ReportOutcome
import com.voicestorybook.vehicle.core.report.ReportReason

data class PairingStart(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val expiresInSec: Long,
    val intervalSec: Long,
)

sealed interface StartResult {
    data class Started(val start: PairingStart) : StartResult
    data class Failed(val reason: String) : StartResult
}

interface PairingGateway {
    suspend fun start(deviceName: String): StartResult
    suspend fun poll(deviceCode: String): PollOutcome
}

// POST /v1/devices/pair/demo의 결과. 심사자가 안내문의 데모 코드로 데모 계정에 붙는다.
sealed interface DemoPairing {
    data class Paired(val accessToken: String) : DemoPairing
    data object InvalidCode : DemoPairing // 400: 코드가 틀렸거나 시연 기간이 끝남
    data object NotReady : DemoPairing // 503 demo_not_ready: 서버에 데모 데이터가 없음
    data object Unsupported : DemoPairing // 404: 데모 코드를 설정하지 않은 서버
    data object TooManyAttempts : DemoPairing // 429
    data class Failed(val reason: String) : DemoPairing
}

interface DemoPairingGateway {
    suspend fun redeem(deviceName: String, demoCode: String): DemoPairing
}

sealed interface Fetched<out T> {
    data class Ok<T>(val value: T) : Fetched<T>
    data object Unauthorized : Fetched<Nothing>
    data class Failed(val reason: String) : Fetched<Nothing>
}

// 내려받은 파일은 확인 전까지 임시 위치에 둔다. sha256은 받으면서 계산한 값이다.
data class StagedAudio(val handle: String, val sha256: String)

interface LibraryGateway {
    suspend fun fetchManifest(): Fetched<String>
    suspend fun download(asset: AudioAsset): Fetched<StagedAudio>
}

interface AudioStore {
    fun cached(): List<CachedAudio>
    // 확인된 파일을 캐시로 옮긴다. 옮기지 못하면 false.
    fun commit(staged: StagedAudio, asset: AudioAsset): Boolean
    fun discard(staged: StagedAudio)
    fun delete(audioId: String)
    fun deleteAll()
}

// 받아 둔 오디오 id 묶음. 책·이야기를 들을 수 있는지 판단할 때 쓴다.
fun AudioStore.cachedIds(): Set<String> = cached().map { it.audioId }.toSet()

data class LibrarySnapshot(val manifestBody: String, val syncedAtMs: Long)

interface SnapshotStore {
    fun load(): LibrarySnapshot?
    fun save(snapshot: LibrarySnapshot)
    fun clear()
}

interface ReportGateway {
    suspend fun send(renderId: String, reason: ReportReason): ReportOutcome
}

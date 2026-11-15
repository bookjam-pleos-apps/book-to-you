package com.voicestorybook.vehicle

import android.util.Log
import com.voicestorybook.vehicle.adapter.net.NetworkWatcher
import com.voicestorybook.vehicle.adapter.store.HistoryStore
import com.voicestorybook.vehicle.adapter.store.TokenStore
import com.voicestorybook.vehicle.core.listening.forgetMissing
import com.voicestorybook.vehicle.core.pairing.PairedAccount
import com.voicestorybook.vehicle.core.usecase.LibrarySession
import com.voicestorybook.vehicle.core.usecase.SyncResult
import com.voicestorybook.vehicle.core.usecase.needsSyncWhenOnline
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

private const val TAG = "VehicleSession"

// 차 한 대의 연결과 책장 갱신. 연결 상태의 단일 주인이고, 화면과 재생 서비스는 이 상태만 읽는다.
// 무엇으로 만들지(저장소, 책장)는 AppGraph가 정해 넣는다.
class VehicleSession(
    private val tokens: TokenStore,
    private val history: HistoryStore,
    private val library: LibrarySession,
) {
    private val pairedState = MutableStateFlow(tokens.load() != null)

    // 화면이 다시 만들어져도(창 크기 변경 등) 동기화가 끊기지 않게 앱 수명 동안 산다(모듈 점검 6번).
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // 재생 서비스가 구독한다. false가 되면 화면 연결 여부와 상관없이 재생을 멈춘다.
    val paired: StateFlow<Boolean> = pairedState

    fun isPaired(): Boolean = pairedState.value

    fun completePairing(account: PairedAccount, token: String) {
        tokens.save(token, account)
        pairedState.value = true
    }

    fun account(): PairedAccount = tokens.account()

    // 시연 계정에서 본인 계정으로 옮긴다. paired가 true로 이어져 재생 서비스가 스스로 멈추지 않으므로 재생 중지는 부르는 쪽이 한다.
    fun switchToOwnAccount(token: String) {
        forgetAccount()
        completePairing(PairedAccount.Own, token)
    }

    // 이미 받는 중이면 LibrarySession이 건너뛴다. 토큰이 거부되면 연결을 해제하고, 화면은 paired를 보고 연결 화면으로 간다.
    // announce가 false면(주기 갱신) 받는 동안 안내를 띄우지 않는다.
    fun refreshInBackground(announce: Boolean = true) {
        if (!announce) Log.i(TAG, "refreshing the library on schedule")
        appScope.launch { refreshOrUnpair(announce) }
    }

    // 오프라인이던 차가 다시 인터넷에 붙으면 받는다. Pleos는 홈으로 가도 앱 창이 보인 채 남아 onStart가 거의 오지 않는다.
    fun syncWhenOnline(network: NetworkWatcher) = network.onAvailable {
        appScope.launch {
            if (!isPaired() || !needsSyncWhenOnline(library.status.value)) return@launch
            Log.i(TAG, "network is back, syncing the library")
            refreshOrUnpair()
        }
    }

    private suspend fun refreshOrUnpair(announce: Boolean = true) {
        if (refreshLibrary(announce) == SyncResult.Unpaired) unpair()
    }

    // 동기화가 끝나면 manifest에서 빠진 이야기의 이어 듣기 기록도 지운다.
    private suspend fun refreshLibrary(announce: Boolean): SyncResult? {
        val result = library.refresh(announce)
        if (result is SyncResult.Synced) history.save(forgetMissing(history.load(), result.library))
        return result
    }

    // 상태를 먼저 내려 재생 기록이 다시 남지 않게 하고, 받아 둔 목소리와 기록을 지운다.
    // 도는 동기화를 먼저 멈춘다. 그대로 두면 지운 뒤에 받은 목록을 다시 저장할 수 있다.
    fun unpair() {
        pairedState.value = false
        tokens.clear()
        forgetAccount()
    }

    private fun forgetAccount() {
        appScope.coroutineContext.cancelChildren()
        history.clear()
        library.clear()
    }
}

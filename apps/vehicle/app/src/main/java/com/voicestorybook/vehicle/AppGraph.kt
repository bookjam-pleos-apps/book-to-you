package com.voicestorybook.vehicle

import android.app.Application
import android.content.Context
import com.voicestorybook.vehicle.adapter.http.ApiClients
import com.voicestorybook.vehicle.adapter.http.HttpLibraryGateway
import com.voicestorybook.vehicle.adapter.http.HttpPairingGateway
import com.voicestorybook.vehicle.adapter.http.HttpReportGateway
import com.voicestorybook.vehicle.adapter.net.NetworkWatcher
import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.adapter.store.HistoryStore
import com.voicestorybook.vehicle.adapter.store.PrefsSnapshotStore
import com.voicestorybook.vehicle.adapter.store.TokenStore
import com.voicestorybook.vehicle.cabin.CabinGuard
import com.voicestorybook.vehicle.core.pairing.autoPairCodeOf
import com.voicestorybook.vehicle.core.usecase.AutoPairDemo
import com.voicestorybook.vehicle.core.usecase.LibrarySession
import com.voicestorybook.vehicle.core.usecase.PairDevice
import com.voicestorybook.vehicle.core.usecase.PairWithDemoCode
import com.voicestorybook.vehicle.core.usecase.SyncLibrary
import com.voicestorybook.vehicle.driving.DrivingMonitor
import com.voicestorybook.vehicle.navi.ArrivalWatch
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

// 조립 지점. 어댑터를 만들어 core 유스케이스에 넣는다.
class AppGraph(private val context: Context) {
    private val prefs = context.getSharedPreferences("vehicle", Context.MODE_PRIVATE)
    private val clock: () -> Long = System::currentTimeMillis

    val tokens = TokenStore(prefs)
    val history = HistoryStore(prefs)
    val audio = FileAudioStore(context.filesDir)

    private val api = ApiClients(
        baseUrl = BuildConfig.API_BASE_URL,
        client = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build(),
        token = tokens::load,
    )

    private val pairing = HttpPairingGateway(api.pairing)
    val reports = HttpReportGateway(api.device)
    val pairDevice = PairDevice(pairing, clock) { delay(it) }
    val pairWithDemoCode = PairWithDemoCode(pairing)
    val autoPairDemo = AutoPairDemo(pairWithDemoCode) { delay(it) }

    // 시연 빌드(vehicle.demoAutoPair)에서만 값이 있다. null이면 연결이 없을 때 QR만 보인다.
    val autoPairCode: String? = autoPairCodeOf(BuildConfig.DEMO_AUTO_PAIR, BuildConfig.DEMO_AUTO_PAIR_CODE)
    val library = LibrarySession(SyncLibrary(HttpLibraryGateway(api.device, audio), audio, PrefsSnapshotStore(prefs), clock))
    val cabinGuard = CabinGuard()
    val driving = DrivingMonitor(context)
    val arrival = ArrivalWatch(context)
    // 연결 상태와 책장 갱신은 세션이 맡는다. 여기서는 만들어 넣기만 한다.
    val session = VehicleSession(tokens, history, library)
}

class VehicleApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this).also { it.session.syncWhenOnline(NetworkWatcher(this)) }
    }
}

val Context.graph: AppGraph get() = (applicationContext as VehicleApp).graph

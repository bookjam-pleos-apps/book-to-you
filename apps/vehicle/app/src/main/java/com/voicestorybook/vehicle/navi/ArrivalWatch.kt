package com.voicestorybook.vehicle.navi

import android.content.Context
import android.util.Log
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RouteStartInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import com.voicestorybook.vehicle.core.shelf.remainingMsOf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

private const val TAG = "ArrivalWatch"

// Pleos 내비(NaviHelper)와의 경계. 도착까지 남은 시간만 꺼낸다. 내비 미탑재·안내 없음이면 null로 남는다.
// 값은 요청(getDestinationInfo) → 콜백이라 홈이 보이는 동안 refresh를 주기적으로 부른다.
class ArrivalWatch(context: Context) {
    private val state = MutableStateFlow<Long?>(null)
    val remainingMs: StateFlow<Long?> = state
    private val navi = NaviHelper(context)
    @Volatile private var ready = false
    @Volatile private var started = false

    private val listener = object : NaviHelperEventListener {
        // remainTime 단위는 초로 본다(Pleos Check 로그 기준, 실차·경로 안내로 확인 전).
        override fun onDestinationInfo(destinationInfo: DestinationInfo) {
            state.value = remainingMsOf(destinationInfo.remainTime, destinationInfo.remainDistance)
        }

        override fun onRouteStarted(routeStartInfo: RouteStartInfo) = refresh()
        override fun onDestinationArrived(destinationArrivedInfo: DestinationArrivedInfo) = clear()
        override fun onRouteEnded() = clear()
        override fun onRouteCancelled() = clear()
    }

    // 내비 연결은 홈이 처음 남은 시간을 물을 때 연다(연결 전·연결 화면에서는 열지 않는다).
    private fun start() {
        started = true
        runCatching { navi.initialize({ onReady() }, { Log.i(TAG, "navi not available: $it") }) }
            .onFailure { Log.i(TAG, "navi not available: $it") }
    }

    fun refresh() {
        if (!started) return start()
        if (ready) runCatching { navi.getDestinationInfo() }
    }

    private fun onReady() {
        ready = true
        navi.addListener(listener)
        refresh()
    }

    private fun clear() {
        state.value = null
    }
}

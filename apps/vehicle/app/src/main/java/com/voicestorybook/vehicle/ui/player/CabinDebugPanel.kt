package com.voicestorybook.vehicle.ui.player

import android.view.View
import android.widget.TextView
import com.voicestorybook.vehicle.BuildConfig
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.cabin.CabinGuard
import com.voicestorybook.vehicle.cabin.CabinSupport
import com.voicestorybook.vehicle.core.cabin.RearSeat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// 에뮬레이터는 벨트 값을 바꿀 수 없어 시연용 토글을 둔다. 실제 리스너와 같은 CabinGuard.onBelt를 부른다.
// release에도 남기되(심사자 시연용) 구석에 눈에 안 띄게 두고, 정차 중에만 보인다(Pleos: 주행 중 최소 조작).
class CabinDebugPanel(private val root: View, private val cabinGuard: CabinGuard, private val scope: CoroutineScope) {
    private var watchingSupport: Job? = null

    fun bind() {
        if (!BuildConfig.CABIN_DEBUG_TOGGLE) return
        root.findViewById<View>(R.id.playerDebugBelt).setOnClickListener {
            cabinGuard.onBelt(RearSeat.LEFT, true)
            cabinGuard.onBelt(RearSeat.LEFT, false)
        }
        val supportText = root.findViewById<TextView>(R.id.playerCabinSupport)
        // 감지 줄은 앱 하나 창에서만 보인다. 분할 창은 높이가 모자라 시험 버튼만 둔다.
        if (!root.resources.getBoolean(R.bool.showCabinSupport)) {
            supportText.visibility = View.GONE
            return
        }
        watchingSupport = scope.launch { cabinGuard.support.collect { supportText.text = describe(it) } }
    }

    fun setParked(parked: Boolean) {
        if (!BuildConfig.CABIN_DEBUG_TOGGLE) return
        root.findViewById<View>(R.id.playerDebug).visibility = if (parked) View.VISIBLE else View.GONE
    }

    fun release() {
        watchingSupport?.cancel()
    }

    private fun describe(support: CabinSupport): String {
        val context = root.context
        val none = context.getString(R.string.cabin_none)
        val seats = support.belts.sorted().joinToString(", ") { context.getString(seatName(it)) }.ifEmpty { none }
        val doors = if (support.doors.isEmpty()) none else context.getString(R.string.cabin_rear_doors, support.doors.size)
        return context.getString(R.string.cabin_support, seats, doors)
    }

    private fun seatName(seat: RearSeat): Int = when (seat) {
        RearSeat.LEFT -> R.string.seat_left
        RearSeat.CENTER -> R.string.seat_center
        RearSeat.RIGHT -> R.string.seat_right
    }
}

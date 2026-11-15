package com.voicestorybook.vehicle.cabin

import android.os.Handler
import android.os.Looper
import com.voicestorybook.vehicle.core.cabin.CabinEvent
import com.voicestorybook.vehicle.core.cabin.CabinWatch
import com.voicestorybook.vehicle.core.cabin.Observed
import com.voicestorybook.vehicle.core.cabin.RearDoor
import com.voicestorybook.vehicle.core.cabin.RearSeat
import com.voicestorybook.vehicle.core.cabin.observeBelt
import com.voicestorybook.vehicle.core.cabin.observeDoor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class CabinSupport(val belts: Set<RearSeat> = emptySet(), val doors: Set<RearDoor> = emptySet())

// 실제 차량 리스너와 디버그 토글이 같이 부르는 진입점. 판정은 core가 하고, 여기서는 상태를 메인 스레드에서만 바꾼다.
class CabinGuard {
    private val main = Handler(Looper.getMainLooper())
    private var watch = CabinWatch()
    private val listeners = mutableListOf<(CabinEvent) -> Unit>()
    private val supportState = MutableStateFlow(CabinSupport())
    val support: StateFlow<CabinSupport> = supportState

    fun addListener(listener: (CabinEvent) -> Unit) {
        main.post { listeners += listener }
    }

    fun removeListener(listener: (CabinEvent) -> Unit) {
        main.post { listeners -= listener }
    }

    fun onBelt(seat: RearSeat, buckled: Boolean?) {
        main.post { apply(observeBelt(watch, seat, buckled)) }
    }

    fun onDoor(door: RearDoor, position: Int?) {
        main.post { apply(observeDoor(watch, door, position)) }
    }

    fun onSupport(update: (CabinSupport) -> CabinSupport) {
        main.post { supportState.value = update(supportState.value) }
    }

    private fun apply(observed: Observed) {
        watch = observed.watch
        val event = observed.event ?: return
        listeners.toList().forEach { it(event) }
    }
}

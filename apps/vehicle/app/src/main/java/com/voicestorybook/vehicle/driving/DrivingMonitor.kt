package com.voicestorybook.vehicle.driving

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import com.voicestorybook.vehicle.core.driving.DrivingLimit
import com.voicestorybook.vehicle.core.driving.DrivingRestriction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// CarUxRestrictions 경계. 연결 전이나 실패하면 Unknown(주행 중으로 취급)이다.
class DrivingMonitor(private val context: Context) {
    private val state = MutableStateFlow<DrivingRestriction>(DrivingRestriction.Unknown)
    val restriction: StateFlow<DrivingRestriction> = state
    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null
    private var active = false

    // 기다리지 않고 돌아온다. 한 인자 createCar는 차량 서비스가 늦으면 메인 스레드에서 기다려 첫 화면을 늦춘다(Pleos: 콜드 스타트 최소 초기화).
    // API 30 이상에서 서비스가 이미 떠 있으면 콜백이 이 호출 안에서 바로 불려, 첫 화면부터 실제 상태로 그린다.
    fun start() {
        if (active) return
        active = true
        car = connectCar(context, ::watch, ::forget)
    }

    fun stop() {
        active = false
        manager?.unregisterListener()
        car?.disconnect()
        car = null
        forget()
    }

    private fun watch(connected: Car) {
        if (!active) return
        val uxr = connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager ?: return
        manager = uxr
        state.value = toRestriction(uxr.currentCarUxRestrictions)
        uxr.registerListener { state.value = toRestriction(it) }
    }

    // 차량 서비스가 죽으면 다시 붙을 때까지 주행 중으로 본다.
    private fun forget() {
        manager = null
        state.value = DrivingRestriction.Unknown
    }

    private fun toRestriction(r: CarUxRestrictions?): DrivingRestriction {
        if (r == null) return DrivingRestriction.Unknown
        return DrivingRestriction.Known(
            requiresDistractionOptimization = r.isRequiresDistractionOptimization,
            limits = limitsOf(r.activeRestrictions),
            maxContentItems = r.maxCumulativeContentItems,
            maxStringLength = r.maxRestrictedStringLength,
            maxContentDepth = r.maxContentDepth,
        )
    }
}

private val LIMIT_FLAGS = mapOf(
    CarUxRestrictions.UX_RESTRICTIONS_LIMIT_CONTENT to DrivingLimit.Content,
    CarUxRestrictions.UX_RESTRICTIONS_LIMIT_STRING_LENGTH to DrivingLimit.StringLength,
)

private fun limitsOf(activeRestrictions: Int): Set<DrivingLimit> =
    LIMIT_FLAGS.filterKeys { activeRestrictions and it != 0 }.values.toSet()

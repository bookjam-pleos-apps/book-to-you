package com.voicestorybook.vehicle.cabin

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.DoorArea
import ai.pleos.playground.vehicle.api.model.area.SeatArea
import ai.pleos.playground.vehicle.constant.area.DoorValue
import ai.pleos.playground.vehicle.constant.area.SeatValue
import ai.pleos.playground.vehicle.listener.DoorPositionListener
import ai.pleos.playground.vehicle.listener.SeatBeltBuckledStateListener
import com.voicestorybook.vehicle.core.cabin.RearDoor
import com.voicestorybook.vehicle.core.cabin.RearSeat

private const val TAG = "CabinMonitor"

private val SEATS = mapOf(SeatValue.ROW_2_LEFT to RearSeat.LEFT, SeatValue.ROW_2_CENTER to RearSeat.CENTER, SeatValue.ROW_2_RIGHT to RearSeat.RIGHT)
private val DOORS = mapOf(DoorValue.ROW_2_LEFT to RearDoor.LEFT, DoorValue.ROW_2_RIGHT to RearDoor.RIGHT)

// Pleos Vehicle SDK 경계. 차량이 지원한다고 답한 뒷좌석·뒷문만 감시하고, 나머지 기능은 꺼진 채로 둔다.
// SDK 콜백은 메인이 아닌 스레드에서 오므로, 등록 상태는 메인 스레드에서만 바꾼다.
class CabinMonitor(context: Context, private val guard: CabinGuard) {
    private val vehicle = Vehicle(context)
    private val main = Handler(Looper.getMainLooper())
    private val belts = mutableMapOf<SeatArea, SeatBeltBuckledStateListener>()
    private val doors = mutableMapOf<DoorArea, DoorPositionListener>()
    private var stopped = false

    fun start() {
        vehicle.initialize()
        vehicle.getSeat().checkSeatBeltBuckledCapabilities(
            { areas -> onMain { watchBelts(areas.mapNotNull(::rearSeatOf)) } },
            { e -> Log.w(TAG, "belt capability failed: ${e.message}") },
        )
        vehicle.getDoor().checkDoorPositionCapabilities(
            { bounds -> onMain { watchDoors(bounds.keys.mapNotNull(::rearDoorOf)) } },
            { e -> Log.w(TAG, "door capability failed: ${e.message}") },
        )
    }

    fun stop() {
        stopped = true
        belts.forEach { (area, listener) -> vehicle.getSeat().unregisterSeatBeltBuckledState(area, listener) }
        doors.forEach { (area, listener) -> vehicle.getDoor().unregisterDoorPosition(area, listener) }
        belts.clear()
        doors.clear()
        vehicle.release()
    }

    // 정지한 뒤에 도착한 지원 여부 응답은 해제된 Vehicle에 등록하지 않도록 버린다.
    private fun onMain(action: () -> Unit) {
        main.post { if (!stopped) action() }
    }

    private fun watchBelts(found: List<Pair<SeatArea, RearSeat>>) {
        found.filterNot { (area, _) -> area in belts }.forEach { (area, seat) ->
            val listener = beltListener(seat)
            vehicle.getSeat().registerSeatBeltBuckledState(area, listener)
            belts[area] = listener
        }
        guard.onSupport { it.copy(belts = found.map { (_, seat) -> seat }.toSet()) }
    }

    private fun watchDoors(found: List<Pair<DoorArea, RearDoor>>) {
        found.filterNot { (area, _) -> area in doors }.forEach { (area, door) ->
            val listener = doorListener(door)
            vehicle.getDoor().registerDoorPosition(area, listener)
            doors[area] = listener
        }
        guard.onSupport { it.copy(doors = found.map { (_, door) -> door }.toSet()) }
    }

    private fun beltListener(seat: RearSeat) = object : SeatBeltBuckledStateListener {
        override fun onSeatBeltBuckledStateUpdated(buckled: Boolean?) = guard.onBelt(seat, buckled)
        override fun onFailed(e: Exception) = logFailure("belt $seat", e)
    }

    private fun doorListener(door: RearDoor) = object : DoorPositionListener {
        override fun onPositionUpdated(position: Int?) = guard.onDoor(door, position)
        override fun onFailed(e: Exception) = logFailure("door $door", e)
    }
}

private fun logFailure(what: String, e: Exception) {
    Log.w(TAG, "$what failed: ${e.message}")
}

private fun rearSeatOf(area: SeatArea): Pair<SeatArea, RearSeat>? =
    area.values.singleOrNull()?.let(SEATS::get)?.let { area to it }

private fun rearDoorOf(area: DoorArea): Pair<DoorArea, RearDoor>? =
    area.values.singleOrNull()?.let(DOORS::get)?.let { area to it }

package com.voicestorybook.vehicle.core.cabin

enum class RearSeat { LEFT, CENTER, RIGHT }

enum class RearDoor { LEFT, RIGHT }

sealed interface CabinEvent {
    data class BeltUnfastened(val seat: RearSeat) : CabinEvent
    data class DoorOpened(val door: RearDoor) : CabinEvent
}

// 좌석·문마다 마지막으로 확인한 값을 기억한다. null 판독(신호 없음)은 기억을 바꾸지 않는다.
// 처음 받은 값은 기준점일 뿐이라 반응하지 않는다. 앱을 켰을 때 이미 풀려 있거나 열려 있어도 멈추지 않는다.
data class CabinWatch(
    val belts: Map<RearSeat, Boolean> = emptyMap(),
    val doors: Map<RearDoor, Boolean> = emptyMap(),
)

data class Observed(val watch: CabinWatch, val event: CabinEvent?)

fun observeBelt(watch: CabinWatch, seat: RearSeat, buckled: Boolean?): Observed {
    if (buckled == null) return Observed(watch, null)
    val unfastened = watch.belts[seat] == true && !buckled
    return Observed(
        watch.copy(belts = watch.belts + (seat to buckled)),
        if (unfastened) CabinEvent.BeltUnfastened(seat) else null,
    )
}

// Vehicle SDK의 문 위치는 0이 닫힘, 0보다 크면 열림이다.
fun observeDoor(watch: CabinWatch, door: RearDoor, position: Int?): Observed {
    if (position == null) return Observed(watch, null)
    val open = position > 0
    val opened = watch.doors[door] == false && open
    return Observed(
        watch.copy(doors = watch.doors + (door to open)),
        if (opened) CabinEvent.DoorOpened(door) else null,
    )
}

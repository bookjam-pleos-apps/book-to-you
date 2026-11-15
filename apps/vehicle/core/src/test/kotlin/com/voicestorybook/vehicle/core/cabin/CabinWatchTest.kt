package com.voicestorybook.vehicle.core.cabin

import kotlin.test.Test
import kotlin.test.assertEquals

class CabinWatchTest {
    private fun beltEvents(vararg readings: Boolean?): List<CabinEvent?> =
        readings.toList().runningFold(Observed(CabinWatch(), null)) { acc, reading ->
            observeBelt(acc.watch, RearSeat.LEFT, reading)
        }.drop(1).map { it.event }

    private fun doorEvents(vararg positions: Int?): List<CabinEvent?> =
        positions.toList().runningFold(Observed(CabinWatch(), null)) { acc, position ->
            observeDoor(acc.watch, RearDoor.RIGHT, position)
        }.drop(1).map { it.event }

    private val unfastened = CabinEvent.BeltUnfastened(RearSeat.LEFT)
    private val opened = CabinEvent.DoorOpened(RearDoor.RIGHT)

    @Test
    fun `belt pauses only on buckled to unbuckled`() {
        assertEquals(listOf(null, unfastened, null, null, unfastened), beltEvents(true, false, false, true, false))
    }

    @Test
    fun `the first reading is a baseline even when unbuckled`() {
        assertEquals(listOf(null, null), beltEvents(false, false))
    }

    @Test
    fun `null is not unbuckled and does not erase the last known state`() {
        assertEquals(listOf(null, null, unfastened), beltEvents(true, null, false))
        assertEquals(listOf(null, null), beltEvents(null, false))
    }

    @Test
    fun `seats are tracked separately`() {
        val left = observeBelt(CabinWatch(), RearSeat.LEFT, true).watch
        assertEquals(null, observeBelt(left, RearSeat.RIGHT, false).event)
    }

    @Test
    fun `door pauses only on closed to open`() {
        assertEquals(listOf(null, opened, null, null, opened), doorEvents(0, 1, 1, 0, 1))
    }

    @Test
    fun `a door open at start or unknown does not pause`() {
        assertEquals(listOf(null, null, null), doorEvents(1, null, 1))
    }
}

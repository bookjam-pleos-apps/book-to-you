package com.voicestorybook.vehicle.core.driving

import kotlin.test.Test
import kotlin.test.assertEquals

class DrivingGateTest {
    @Test
    fun `parked only when the restriction is known and needs no distraction optimization`() {
        assertEquals(true, isParked(restrictionOf(requiresDistractionOptimization = false)))
        assertEquals(false, isParked(restrictionOf(requiresDistractionOptimization = true)))
        assertEquals(false, isParked(DrivingRestriction.Unknown))
    }
}

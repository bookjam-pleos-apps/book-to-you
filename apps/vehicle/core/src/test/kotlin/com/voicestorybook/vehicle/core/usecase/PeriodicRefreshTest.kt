package com.voicestorybook.vehicle.core.usecase

import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.seconds

class PeriodicRefreshTest {
    @Test
    fun `refreshes once per interval while allowed and stops when cancelled`() = runTest {
        var allowed = true
        var refreshes = 0
        val job = launch { refreshEvery(LIBRARY_REFRESH_INTERVAL, { allowed }) { refreshes += 1 } }

        advanceTimeBy(59.seconds)
        runCurrent()
        assertEquals(0, refreshes)
        advanceTimeBy(1.seconds)
        runCurrent()
        assertEquals(1, refreshes)
        advanceTimeBy(120.seconds)
        runCurrent()
        assertEquals(3, refreshes)

        allowed = false
        advanceTimeBy(120.seconds)
        runCurrent()
        assertEquals(3, refreshes)

        job.cancel()
        allowed = true
        advanceTimeBy(120.seconds)
        runCurrent()
        assertEquals(3, refreshes)
    }
}

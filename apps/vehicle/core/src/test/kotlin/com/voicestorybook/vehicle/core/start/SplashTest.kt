package com.voicestorybook.vehicle.core.start

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

class SplashTest {
    @Test
    fun `a fresh launch shows the splash`() {
        assertTrue(showsSplash(isRecreated = false))
    }

    @Test
    fun `a screen recreated by a window resize skips the splash`() {
        assertFalse(showsSplash(isRecreated = true))
    }

    @Test
    fun `the splash stays long enough to read and short enough not to delay listening`() {
        assertTrue(SPLASH_DURATION in 1.seconds..2.seconds)
    }
}

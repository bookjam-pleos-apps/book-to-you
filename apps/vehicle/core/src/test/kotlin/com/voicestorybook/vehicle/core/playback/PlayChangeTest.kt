package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class PlayChangeTest {
    @Test
    fun `stops only when playback was paused by a permanent focus loss`() {
        val stopping = PlayChangeCause.entries.filter { shouldStopAfterPause(playWhenReady = false, cause = it) }
        assertEquals(listOf(PlayChangeCause.AudioFocusLoss), stopping)
    }

    @Test
    fun `never stops when playback is starting`() {
        assertEquals(false, PlayChangeCause.entries.any { shouldStopAfterPause(playWhenReady = true, cause = it) })
    }
}

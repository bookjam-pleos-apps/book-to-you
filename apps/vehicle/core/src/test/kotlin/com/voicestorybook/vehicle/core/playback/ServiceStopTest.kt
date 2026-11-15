package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class ServiceStopTest {
    private val paused = StoryPlayback(playWhenReady = false, PlaybackPhase.Ready)
    private val playing = StoryPlayback(playWhenReady = true, PlaybackPhase.Ready)

    @Test
    fun `stops when the last screen closes with nothing playing`() {
        assertEquals(true, shouldStopServiceOnClose(changingConfigurations = false, screensStillOpen = 0, playback = paused))
        assertEquals(true, shouldStopServiceOnClose(changingConfigurations = false, screensStillOpen = 0, playback = null))
    }

    @Test
    fun `keeps the service while a story plays, on recreation, or when a newer screen is open`() {
        assertEquals(false, shouldStopServiceOnClose(changingConfigurations = false, screensStillOpen = 0, playback = playing))
        assertEquals(false, shouldStopServiceOnClose(changingConfigurations = true, screensStillOpen = 0, playback = paused))
        assertEquals(false, shouldStopServiceOnClose(changingConfigurations = false, screensStillOpen = 1, playback = paused))
    }
}

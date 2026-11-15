package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class PlaybackLogTest {
    @Test
    fun `names why playback paused or started`() {
        assertEquals("pause cause=AudioFocusLoss", playChangeLogOf(false, PlayChangeCause.AudioFocusLoss))
        assertEquals("play cause=UserRequest", playChangeLogOf(true, PlayChangeCause.UserRequest))
    }

    @Test
    fun `names why playback is held back and when the hold ends`() {
        assertEquals("suppressed cause=TransientAudioFocusLoss", suppressionLogOf(SuppressionCause.TransientAudioFocusLoss))
        assertEquals("suppression cleared", suppressionLogOf(SuppressionCause.None))
    }
}

package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class StoryPlaybackTest {
    // isPlaying은 버퍼링 중 false라, 재생을 누른 직후의 이벤트를 놓친다. 재생 의도로 판단한다.
    @Test
    fun `a story that is about to play is interrupted while buffering`() {
        assertEquals(true, shouldInterruptStory(StoryPlayback(playWhenReady = true, PlaybackPhase.Buffering)))
        assertEquals(false, shouldInterruptStory(StoryPlayback(playWhenReady = false, PlaybackPhase.Ready)))
    }

    @Test
    fun `an ended or failed story is not interrupted even if it still wants to play`() {
        assertEquals(false, shouldInterruptStory(StoryPlayback(playWhenReady = true, PlaybackPhase.Ended)))
        assertEquals(false, shouldInterruptStory(StoryPlayback(playWhenReady = true, PlaybackPhase.Idle)))
        assertEquals(true, shouldInterruptStory(StoryPlayback(playWhenReady = true, PlaybackPhase.Ready)))
    }
}

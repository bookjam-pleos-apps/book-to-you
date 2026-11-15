package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class ToggleActionTest {
    @Test
    fun `a paused story offers play`() {
        assertEquals(ToggleAction.Play, toggleActionOf(StoryPlayback(playWhenReady = false, PlaybackPhase.Ready)))
    }

    // 통화 중: 소리는 멈췄지만 재생 의도는 남아 있다. 누르면 통화 뒤에 다시 나오지 않게 멈춰야 한다.
    @Test
    fun `a story held by a call offers pause`() {
        assertEquals(ToggleAction.Pause, toggleActionOf(StoryPlayback(playWhenReady = true, PlaybackPhase.Ready)))
        assertEquals(ToggleAction.Pause, toggleActionOf(StoryPlayback(playWhenReady = true, PlaybackPhase.Buffering)))
    }

    // 오류나 끝난 상태에서는 소리가 나지 않는다. 일시정지를 보이면 눌러도 아무것도 바뀌지 않는다.
    @Test
    fun `a failed or ended story offers play even if it still wants to play`() {
        assertEquals(ToggleAction.Play, toggleActionOf(StoryPlayback(playWhenReady = true, PlaybackPhase.Idle)))
        assertEquals(ToggleAction.Play, toggleActionOf(StoryPlayback(playWhenReady = true, PlaybackPhase.Ended)))
    }
}

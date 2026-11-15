package com.voicestorybook.vehicle.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class StoryStartIndexTest {
    private val ids = listOf("a#0", "a#1", "b#0", "b#1", "b#2")

    @Test
    fun `rewinds to the first chapter of the story that is playing`() {
        assertEquals(2, storyStartIndex(ids, 4))
        assertEquals(2, storyStartIndex(ids, 2))
        assertEquals(0, storyStartIndex(ids, 1))
    }

    @Test
    fun `unknown items fall back to the start of the list`() {
        assertEquals(0, storyStartIndex(listOf(null, "x"), 0))
    }
}

package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChapterCountTest {
    @Test
    fun `a single chapter story hides the chapter count`() {
        assertFalse(showsChapterCount(1))
        assertFalse(showsChapterCount(0))
    }

    @Test
    fun `a story with several chapters shows which one is playing`() {
        assertTrue(showsChapterCount(2))
    }

    @Test
    fun `the chapter line shows for a titled chapter or several chapters`() {
        assertTrue(showsChapterLine("숲속에서 만난 늑대", 1))
        assertTrue(showsChapterLine(null, 3))
        assertFalse(showsChapterLine(null, 1))
    }
}

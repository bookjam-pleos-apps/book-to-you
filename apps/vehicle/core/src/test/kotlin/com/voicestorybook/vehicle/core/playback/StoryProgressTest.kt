package com.voicestorybook.vehicle.core.playback

import kotlin.test.Test
import kotlin.test.assertEquals

class StoryProgressTest {
    private fun fills(progress: ChapterProgress) = List(progress.chapterCount, progress::fillOf)

    @Test
    fun `starting the last chapter does not look finished`() {
        assertEquals(listOf(1f, 1f, 0f), fills(chapterProgressOf(chapterIndex = 2, positionMs = 0, durationMs = 60_000, chapterCount = 3)))
    }

    @Test
    fun `fills the current chapter by how far we are`() {
        assertEquals(listOf(1f, 0.25f, 0f), fills(chapterProgressOf(chapterIndex = 1, positionMs = 15_000, durationMs = 60_000, chapterCount = 3)))
    }

    @Test
    fun `fills every cell only at the very end`() {
        assertEquals(listOf(1f, 1f, 1f), fills(chapterProgressOf(chapterIndex = 2, positionMs = 61_000, durationMs = 60_000, chapterCount = 3)))
    }

    @Test
    fun `treats an unknown chapter length as nothing heard in the chapter`() {
        assertEquals(listOf(0f, 0f, 0f), fills(chapterProgressOf(chapterIndex = 0, positionMs = 5_000, durationMs = -1, chapterCount = 3)))
    }

    @Test
    fun `keeps an out of range chapter inside the story`() {
        assertEquals(listOf(1f, 0.5f), fills(chapterProgressOf(chapterIndex = 7, positionMs = 30_000, durationMs = 60_000, chapterCount = 2)))
        assertEquals(emptyList(), fills(chapterProgressOf(chapterIndex = 0, positionMs = 0, durationMs = 0, chapterCount = 0)))
    }
}

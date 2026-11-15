package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Chapter
import com.voicestorybook.vehicle.core.library.asset
import com.voicestorybook.vehicle.core.library.story
import kotlin.test.Test
import kotlin.test.assertEquals

class StoryChoiceTest {
    private val twoChapters = story("r1").copy(
        chapters = listOf(Chapter(0, "body", asset("a", durationMs = 60_000)), Chapter(1, "body", asset("b", durationMs = 60_000))),
    )

    @Test
    fun `the story already in the player only opens the player`() {
        val history = listOf(ListeningMark("r1", 0, 10_000, 1))
        assertEquals(StoryChoice.ShowPlayer, chooseStoryStart(twoChapters, loadedRenderId = "r1", history))
    }

    @Test
    fun `another story starts from the latest record read at the tap`() {
        val history = listOf(ListeningMark("r2", 0, 1, 2), ListeningMark("r1", 1, 30_000, 1))
        assertEquals(StoryChoice.Start(ResumePoint(1, 25_000)), chooseStoryStart(twoChapters, loadedRenderId = "r2", history))
    }

    @Test
    fun `a story without a record starts from the beginning`() {
        assertEquals(StoryChoice.Start(ResumePoint(0, 0)), chooseStoryStart(twoChapters, loadedRenderId = null, emptyList()))
    }
}

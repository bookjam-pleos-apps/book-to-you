package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Story
import kotlin.test.Test
import kotlin.test.assertEquals

class StorySearchTest {
    private val redhood = Story("r", "redhood", "빨간 모자", "엄마", emptyList(), "mom")
    private val fisherman = Story("f", "fisherman", "어부와 욕심많은 아내", "엄마", emptyList(), "mom")
    private val all = listOf(redhood, fisherman)

    @Test
    fun `a spoken request containing the title finds the story`() {
        assertEquals(listOf(redhood), searchStories(all, "빨간모자 틀어줘"))
    }

    @Test
    fun `part of a title is enough`() {
        assertEquals(listOf(fisherman), searchStories(all, "어부"))
    }

    @Test
    fun `an empty request means any story and nonsense finds nothing`() {
        assertEquals(all, searchStories(all, " "))
        assertEquals(emptyList(), searchStories(all, "백설공주"))
    }

    @Test
    fun `a voice request without a title plays the most recent story, else the first`() {
        assertEquals(fisherman, storyForVoiceRequest(all, "f", ""))
        assertEquals(redhood, storyForVoiceRequest(all, null, " "))
        assertEquals(fisherman, storyForVoiceRequest(all, "r", "어부"))
        assertEquals(null, storyForVoiceRequest(all, "r", "백설공주"))
    }
}

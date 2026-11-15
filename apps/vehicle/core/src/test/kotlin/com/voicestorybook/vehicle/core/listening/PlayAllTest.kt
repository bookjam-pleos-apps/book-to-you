package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.library.Chapter
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import kotlin.test.Test
import kotlin.test.assertEquals

private fun story(id: String, voice: String) = Story(
    renderId = id, storyId = id, title = id, voiceLabel = voice,
    chapters = listOf(Chapter(0, "body", AudioAsset("$id-a", "/a", 1000, 1, "s"))), voiceId = voice,
)

class PlayAllTest {
    private val a = story("a", "mom")
    private val b = story("b", "dad")
    private val c = story("c", "mom")
    private val d = story("d", "mom")
    private val library = Library(0, listOf(a, b, c, d), emptyList())
    private val all = setOf("a-a", "b-a", "c-a", "d-a")

    @Test
    fun `plays the chosen story then the following ones in the same voice`() {
        assertEquals(listOf("a", "c", "d"), playAllStories(library, a, all).map { it.renderId })
    }

    @Test
    fun `does not wrap around to earlier stories`() {
        assertEquals(listOf("c", "d"), playAllStories(library, c, all).map { it.renderId })
    }

    @Test
    fun `skips following stories that are not downloaded yet`() {
        assertEquals(listOf("a", "d"), playAllStories(library, a, all - "c-a").map { it.renderId })
    }

    @Test
    fun `a story missing from the library plays alone`() {
        assertEquals(listOf("x"), playAllStories(library, story("x", "mom"), all).map { it.renderId })
    }

    @Test
    fun `a story without a voice plays alone`() {
        val unknown = story("u", "mom").copy(voiceId = null)
        val withUnknown = library.copy(stories = listOf(unknown, story("v", "mom").copy(voiceId = null)))
        assertEquals(listOf("u"), playAllStories(withUnknown, unknown, all + "u-a" + "v-a").map { it.renderId })
    }
}

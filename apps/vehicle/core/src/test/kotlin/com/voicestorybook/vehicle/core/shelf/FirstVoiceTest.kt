package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.listening.ListeningMark
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FirstVoiceTest {
    private val stories = listOf(
        render("a-dad", "a", "dad"), render("a-mom", "a", "mom"), render("a-gran", "a", "gran"), render("b-gran", "b", "gran"),
    )
    private val book = booksOf(stories).first()
    private val allCached = stories.map { "${it.renderId}-0" }.toSet()
    private val mark = { renderId: String -> ListeningMark(renderId, 0, 0, 0) }
    private fun first(history: List<ListeningMark>, defaultVoiceId: String? = null, cached: Set<String> = allCached) =
        firstVoiceOf(book, history, Library(60, stories, emptyList(), defaultVoiceId), cached)?.renderId

    @Test
    fun `the voice this story was last heard in comes first`() {
        assertEquals("a-mom", first(listOf(mark("b-gran"), mark("a-mom"), mark("a-dad")), defaultVoiceId = "dad"))
    }

    @Test
    fun `the default voice comes next when it read this story`() {
        assertEquals("a-mom", first(listOf(mark("b-gran")), defaultVoiceId = "mom"))
    }

    @Test
    fun `a default voice without this story is skipped for the most recent voice`() {
        assertEquals("a-gran", first(listOf(mark("b-gran")), defaultVoiceId = "solo"))
    }

    @Test
    fun `without any hint the first render in manifest order is chosen`() {
        assertEquals("a-dad", first(emptyList()))
    }

    @Test
    fun `only downloaded voices can be chosen`() {
        assertEquals("a-gran", first(listOf(mark("a-mom")), cached = setOf("a-gran-0")))
        assertNull(first(emptyList(), cached = emptySet()))
    }
}

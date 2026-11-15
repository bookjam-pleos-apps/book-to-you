package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.library.story
import kotlin.test.Test
import kotlin.test.assertEquals

internal fun render(renderId: String, storyId: String, voiceId: String): Story =
    story(renderId, "$renderId-0").copy(storyId = storyId, title = "title $storyId", voiceId = voiceId, voiceLabel = voiceId)

class BooksTest {
    private val stories = listOf(render("a-mom", "a", "mom"), render("b-mom", "b", "mom"), render("a-dad", "a", "dad"))

    @Test
    fun `renders of one story become one book in first-seen order`() {
        val books = booksOf(stories)
        assertEquals(listOf("a", "b"), books.map { it.storyId })
        assertEquals(listOf("a-mom", "a-dad"), books[0].renders.map { it.renderId })
        assertEquals("title a", books[0].title)
    }

    @Test
    fun `a book is ready when any voice is downloaded`() {
        val book = booksOf(stories).first()
        assertEquals(true, isReady(book, setOf("a-dad-0")))
        assertEquals(false, isReady(book, setOf("b-mom-0")))
        assertEquals(listOf("a-dad"), playableRenders(book, setOf("a-dad-0")).map { it.renderId })
    }

    @Test
    fun `only stories with two or more voices offer a voice choice`() {
        assertEquals(listOf(true, false), booksOf(stories).map(::hasVoiceChoice))
    }
}

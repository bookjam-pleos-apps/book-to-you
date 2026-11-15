package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.driving.StoryBrowsing
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.listening.ListeningMark
import kotlin.test.Test
import kotlin.test.assertEquals

class HomeBooksTest {
    private val stories = listOf(
        render("a-mom", "a", "mom"), render("b-mom", "b", "mom"), render("a-dad", "a", "dad"),
        render("c-dad", "c", "dad"), render("d-dad", "d", "dad"), render("d-mom", "d", "mom"),
    )
    private val library = Library(60, stories, emptyList())
    private val allCached = stories.map { "${it.renderId}-0" }.toSet()
    private val resumeD = HomeInput(library, listOf(ListeningMark("d-dad", 0, 0, 1)), library.story("d-dad"), allCached)
    private val idsOf = { home: HomeBooks -> home.books.map { it.storyId } }

    @Test
    fun `open and locked browsing show one book per story in manifest order`() {
        val open = homeBooksOf(resumeD, StoryBrowsing.Open)
        val locked = homeBooksOf(resumeD, StoryBrowsing.Locked)
        assertEquals(listOf("a", "b", "c", "d"), idsOf(open))
        assertEquals(HomeBooks(open.books, truncated = false, resumeOpen = false), locked)
        assertEquals(true, open.resumeOpen)
    }

    @Test
    fun `a content limit counts the resume card and leaves its story off in every voice`() {
        val home = homeBooksOf(resumeD, StoryBrowsing.Limited(maxItems = 3, maxDepth = 2))
        assertEquals(listOf("a", "b"), idsOf(home))
        assertEquals(true, home.truncated)
        assertEquals(true, home.resumeOpen)
    }

    @Test
    fun `recently heard stories come first and a depth limit keeps one list`() {
        val history = listOf(ListeningMark("c-dad", 0, 0, 2), ListeningMark("a-dad", 0, 0, 1))
        val home = homeBooksOf(HomeInput(library, history, null, allCached), StoryBrowsing.Limited(maxItems = 2, maxDepth = 1))
        assertEquals(listOf("c", "a"), idsOf(home))
    }

    @Test
    fun `downloaded books take the limited slots before ones still downloading`() {
        val input = HomeInput(library, emptyList(), resume = null, cachedAudioIds = setOf("c-dad-0", "d-mom-0"))
        assertEquals(listOf("c", "d"), idsOf(homeBooksOf(input, StoryBrowsing.Limited(maxItems = 2, maxDepth = 1))))
    }

    @Test
    fun `nothing is cut when the limit covers the card and every other book`() {
        val home = homeBooksOf(resumeD, StoryBrowsing.Limited(maxItems = 4, maxDepth = 3))
        assertEquals(listOf("a", "b", "c"), idsOf(home))
        assertEquals(false, home.truncated)
    }

    @Test
    fun `a zero limit shows no book and closes the resume card`() {
        assertEquals(HomeBooks(emptyList(), truncated = true, resumeOpen = false), homeBooksOf(resumeD, StoryBrowsing.Limited(0, 1)))
    }
}

package com.voicestorybook.vehicle.core.listening

import com.voicestorybook.vehicle.core.library.Chapter
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.asset
import com.voicestorybook.vehicle.core.library.story
import kotlin.test.Test
import kotlin.test.assertEquals

class ListeningHistoryTest {
    private val library = Library(60, listOf(story("r1", "a"), story("r2", "b"), story("r3", "c")), emptyList())
    private fun mark(renderId: String, at: Long) = ListeningMark(renderId, 0, at, at)

    @Test
    fun `latest progress goes first and replaces the same render`() {
        val history = listOf(mark("r1", 1), mark("r2", 2), mark("r1", 3)).fold(emptyList<ListeningMark>(), ::recordProgress)
        assertEquals(listOf("r1", "r2"), history.map { it.renderId })
        assertEquals(3, history.first().positionMs)
    }

    @Test
    fun `history is bounded`() {
        val history = (1..HISTORY_LIMIT + 5).map { mark("r$it", it.toLong()) }.fold(emptyList<ListeningMark>(), ::recordProgress)
        assertEquals(HISTORY_LIMIT, history.size)
    }

    @Test
    fun `recent skips stories the manifest dropped and others excludes recent`() {
        val history = listOf(mark("gone", 9), mark("r2", 8), mark("r1", 7))
        assertEquals(listOf("r2"), recentStories(history, library, limit = 1).map { it.story.renderId })
        assertEquals(listOf("r1", "r3"), otherStories(history, library, recentLimit = 1).map { it.renderId })
        assertEquals(listOf("r2", "r1"), forgetMissing(history, library).map { it.renderId })
    }

    // 장 길이 60초짜리 세 장. index는 0, 1, 2.
    private val threeChapters = story("r", "a", "b", "c").let { s ->
        s.copy(chapters = s.chapters.map { it.copy(asset = it.asset.copy(durationMs = 60_000)) })
    }
    private fun at(chapterIndex: Int, positionMs: Long) = ListeningMark("r", chapterIndex, positionMs, 0)

    @Test
    fun `no record starts from the beginning`() {
        assertEquals(ResumePoint(0, 0), resumePoint(threeChapters, null))
    }

    @Test
    fun `stopping mid chapter rewinds five seconds but not before the start`() {
        assertEquals(ResumePoint(1, 25_000), resumePoint(threeChapters, at(1, 30_000)))
        assertEquals(ResumePoint(1, 0), resumePoint(threeChapters, at(1, 3_000)))
    }

    @Test
    fun `stopping within three seconds of a chapter end moves to the next chapter`() {
        assertEquals(ResumePoint(2, 0), resumePoint(threeChapters, at(1, 57_000)))
        assertEquals(ResumePoint(1, 51_999), resumePoint(threeChapters, at(1, 56_999)))
    }

    @Test
    fun `finishing the last chapter starts the story again`() {
        assertEquals(ResumePoint(0, 0), resumePoint(threeChapters, at(2, 60_000)))
    }

    @Test
    fun `a chapter that left the manifest starts the story again`() {
        assertEquals(ResumePoint(0, 0), resumePoint(threeChapters, at(7, 10_000)))
    }

    @Test
    fun `chapter indexes are matched by value, not by list position`() {
        val gapped = threeChapters.copy(chapters = listOf(Chapter(5, "body", asset("x", durationMs = 60_000)), Chapter(2, "body", asset("y", durationMs = 60_000))))
        assertEquals(ResumePoint(5, 0), resumePoint(gapped, at(2, 59_000)))
        assertEquals(ResumePoint(2, 0), resumePoint(gapped, null))
    }
}

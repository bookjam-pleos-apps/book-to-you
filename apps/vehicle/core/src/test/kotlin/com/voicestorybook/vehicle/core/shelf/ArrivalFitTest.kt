package com.voicestorybook.vehicle.core.shelf

import com.voicestorybook.vehicle.core.library.AudioAsset
import com.voicestorybook.vehicle.core.library.Chapter
import com.voicestorybook.vehicle.core.library.Story
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private fun render(id: String, storyId: String, minutes: Long) = Story(
    renderId = id, storyId = storyId, title = storyId, voiceLabel = "엄마",
    chapters = listOf(Chapter(0, "body", AudioAsset("$id-0", "/a", minutes * 60_000, 1, "s"))), voiceId = "mom",
)

class ArrivalFitTest {
    private val long = Book("long", "long", listOf(render("l", "long", 20)))
    private val short = Book("short", "short", listOf(render("s", "short", 5)))
    private val mixed = Book("mixed", "mixed", listOf(render("m1", "mixed", 30), render("m2", "mixed", 8)))
    private val cached = setOf("l-0", "s-0", "m1-0", "m2-0")

    @Test
    fun `books that end before arrival come first, longest first`() {
        val tenMinutes = 10 * 60_000L
        assertEquals(listOf("mixed", "short", "long"), arrivalFitFirst(listOf(long, short, mixed), tenMinutes, cached).map { it.storyId })
    }

    @Test
    fun `without a route the order does not change`() {
        assertEquals(listOf(long, short), arrivalFitFirst(listOf(long, short), null, cached))
        assertEquals(listOf(long, short), arrivalFitFirst(listOf(long, short), 0, cached))
    }

    @Test
    fun `only downloaded voices count`() {
        assertFalse(fitsBeforeArrival(mixed, 10 * 60_000L, setOf("m1-0")))
        assertTrue(fitsBeforeArrival(mixed, 10 * 60_000L, setOf("m2-0")))
    }
}

class RemainingTimeTest {
    @Test
    fun `no route reads as unknown`() {
        kotlin.test.assertNull(remainingMsOf(0, 0))
        assertEquals(600_000L, remainingMsOf(600, 5_000))
    }
}

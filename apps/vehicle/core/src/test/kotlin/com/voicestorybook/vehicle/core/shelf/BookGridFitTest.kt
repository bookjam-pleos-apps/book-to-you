package com.voicestorybook.vehicle.core.shelf

import kotlin.test.Test
import kotlin.test.assertEquals

class BookGridFitTest {
    private fun fit(available: Int) = bookGridFitOf(available, minWidth = 286, maxWidth = 381, gap = 33, maxColumns = 2)

    @Test
    fun `a split window wide enough for two minimum cells gets two stretched columns`() {
        assertEquals(BookGridFit(2, 371), fit(808))
    }

    @Test
    fun `a narrow window falls back to one column capped at the full book width`() {
        assertEquals(BookGridFit(1, 381), fit(596))
    }

    @Test
    fun `columns never exceed the figma two and never drop below one`() {
        assertEquals(2, fit(3000).columns)
        assertEquals(381, fit(3000).cellWidth)
        assertEquals(BookGridFit(1, 1), fit(10))
    }

    @Test
    fun `the shelf takes three columns only when there is no resume card beside it`() {
        assertEquals(2, maxBookColumnsOf(resumeShown = true))
        assertEquals(3, maxBookColumnsOf(resumeShown = false))
    }

    @Test
    fun `split windows stay width limited even with room for three`() {
        val noCard = { available: Int -> bookGridFitOf(available, minWidth = 286, maxWidth = 381, gap = 33, maxColumns = maxBookColumnsOf(false)) }
        assertEquals(2, noCard(808).columns)
        assertEquals(1, noCard(596).columns)
    }
}

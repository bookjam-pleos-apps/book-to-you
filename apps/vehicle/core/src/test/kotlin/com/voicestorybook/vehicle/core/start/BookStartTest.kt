package com.voicestorybook.vehicle.core.start

import com.voicestorybook.vehicle.core.shelf.booksOf
import com.voicestorybook.vehicle.core.shelf.render
import kotlin.test.Test
import kotlin.test.assertEquals

class BookStartTest {
    private val mom = render("a-mom", "a", "mom")
    private val book = booksOf(listOf(mom, render("a-dad", "a", "dad"))).single()

    @Test
    fun `parked choices count down with the first voice`() {
        assertEquals(BookStart.Countdown(book, mom), bookStartOf(book, mom, loadedRenderId = "b-mom", parked = true))
    }

    @Test
    fun `idling, driving and unknown states play right away`() {
        assertEquals(BookStart.PlayNow(mom), bookStartOf(book, mom, loadedRenderId = null, parked = false))
    }

    @Test
    fun `a parked book already on the player counts down from the voice being heard`() {
        val dad = book.renders.last()
        assertEquals(BookStart.Countdown(book, dad), bookStartOf(book, mom, loadedRenderId = "a-dad", parked = true))
    }

    @Test
    fun `a book on the player only opens the player while driving or with one voice`() {
        assertEquals(BookStart.ShowPlayer, bookStartOf(book, mom, loadedRenderId = "a-mom", parked = false))
        val single = booksOf(listOf(mom)).single()
        assertEquals(BookStart.ShowPlayer, bookStartOf(single, mom, loadedRenderId = "a-mom", parked = true))
    }
}

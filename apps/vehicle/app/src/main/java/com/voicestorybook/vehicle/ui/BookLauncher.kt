package com.voicestorybook.vehicle.ui

import com.voicestorybook.vehicle.AppGraph
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.port.cachedIds
import com.voicestorybook.vehicle.core.shelf.Book
import com.voicestorybook.vehicle.core.shelf.playableRenders
import com.voicestorybook.vehicle.core.start.BookStart
import com.voicestorybook.vehicle.core.start.bookStartOf
import com.voicestorybook.vehicle.ui.countdown.CountdownActions
import com.voicestorybook.vehicle.ui.countdown.CountdownChoices

// 책을 고른 뒤 띄울 화면. 화면을 만들고 바꾸는 일은 MainActivity가 맡는다.
data class BookScreens(
    val showHome: () -> Unit,
    val showPlayer: () -> Unit,
    val showCountdown: (BookStart.Countdown, CountdownChoices, CountdownActions) -> Unit,
    val isCountdownShowing: () -> Boolean,
    val isParked: () -> Boolean,
)

// 책장의 책: 정차 중이면 카운트다운, 공회전·주행 중이면 처음 목소리로 바로 재생한다(core/start/BookStart.kt).
class BookLauncher(private val graph: AppGraph, private val starter: StoryStarter, private val screens: BookScreens) {
    fun choose(book: Book) {
        val first = starter.firstVoice(book) ?: return
        when (val start = bookStartOf(book, first, starter.loadedRenderId(), screens.isParked())) {
            BookStart.ShowPlayer -> screens.showPlayer()
            is BookStart.PlayNow -> starter.play(start.story)
            is BookStart.Countdown -> countDown(start)
        }
    }

    private fun countDown(start: BookStart.Countdown) {
        val playable = playableRenders(start.book, graph.audio.cachedIds()).map { it.renderId }.toSet()
        val choices = CountdownChoices(playable, starter::resumePointOf)
        screens.showCountdown(start, choices, CountdownActions(::playAfterCountdown, screens.showHome))
    }

    // 기한이 지났거나 파일이 없어 틀지 못하면 끝난 카운트다운에 머물지 않고 목록으로 간다.
    private fun playAfterCountdown(story: Story) {
        starter.play(story)
        if (screens.isCountdownShowing()) screens.showHome()
    }
}

package com.voicestorybook.vehicle.ui.countdown

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ResumePoint
import com.voicestorybook.vehicle.core.shelf.hasVoiceChoice
import com.voicestorybook.vehicle.core.start.BookStart
import com.voicestorybook.vehicle.core.start.CountdownEvent
import com.voicestorybook.vehicle.core.start.CountdownState
import com.voicestorybook.vehicle.core.start.CountdownStep
import com.voicestorybook.vehicle.core.start.countdownStep
import com.voicestorybook.vehicle.ui.Screen
import com.voicestorybook.vehicle.ui.player.showPlayerPreview
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class CountdownActions(val onPlay: (Story) -> Unit, val onCancel: () -> Unit)

// 고를 수 있는 목소리(받아 둔 렌더 id)와 목소리마다 이어 들을 위치. 덮개 뒤 재생 화면에 그 장을 보인다.
data class CountdownChoices(val playableIds: Set<String>, val pointOf: (Story) -> ResumePoint)

private const val TICK_MS = 1_000L

// v2 책을 고른 뒤 화면. 숫자는 countdownStep이 정하고, 이 화면은 1초마다 Tick을 보내고 그리기만 한다.
// 듣던 이야기는 0이 될 때까지 그대로 둔다(취소하면 끊김 없이 이어진다).
class CountdownScreen(
    private val root: View,
    private val start: BookStart.Countdown,
    private val choices: CountdownChoices,
    private val scope: CoroutineScope,
    private val actions: CountdownActions,
) : Screen {
    private val number: TextView = root.findViewById(R.id.countdownNumber)
    private val voices: ViewGroup = root.findViewById(R.id.countdownVoices)
    private val behind: ViewGroup = root.findViewById(R.id.countdownBehind)
    private var state = CountdownState(start.first)
    private var ticking: Job? = null
    private var finished = false

    fun start() {
        if (finished) return
        bindBook()
        showPreview(state.selected)
        root.findViewById<View>(R.id.countdownCancel).setOnClickListener { handle(CountdownEvent.Cancel) }
        root.findViewById<View>(R.id.countdownStartNow).setOnClickListener { handle(CountdownEvent.StartNow) }
        show(state)
    }

    // 정차가 풀리면(공회전·주행·상태 모름) 숫자와 목소리 고르기를 닫고 바로 재생한다.
    override fun setParked(parked: Boolean) {
        if (!parked) handle(CountdownEvent.LeftPark)
    }

    override fun release() {
        finished = true
        ticking?.cancel()
    }

    // 덮개 뒤 재생 화면은 보이기만 한다. 방향키·화면 읽기도 그 버튼으로 가지 않게 막는다.
    private fun bindBook() {
        behind.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
        behind.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        val choosable = hasVoiceChoice(start.book)
        root.findViewById<View>(R.id.countdownVoicePicker).visibility = if (choosable) View.VISIBLE else View.GONE
        if (choosable) inflateVoiceOptions(voices, start.book.renders, choices.playableIds) { handle(CountdownEvent.ChangeVoice(it)) }
    }

    private fun handle(event: CountdownEvent) {
        if (finished) return
        when (val step = countdownStep(state, event)) {
            is CountdownStep.Counting -> show(step.state)
            is CountdownStep.Play -> finish { actions.onPlay(step.story) }
            CountdownStep.Cancelled -> finish(actions.onCancel)
        }
    }

    // 새 숫자를 그리고 다음 Tick을 처음부터 다시 잰다(목소리를 바꾸면 1초를 새로 센다).
    private fun show(next: CountdownState) {
        if (next.selected != state.selected) showPreview(next.selected)
        state = next
        number.text = next.remaining.toString()
        markSelectedVoice(voices, next.selected)
        ticking?.cancel()
        ticking = scope.launch {
            delay(TICK_MS)
            handle(CountdownEvent.Tick)
        }
    }

    private fun showPreview(story: Story) = showPlayerPreview(behind, story, choices.pointOf(story))

    private fun finish(then: () -> Unit) {
        release()
        then()
    }
}

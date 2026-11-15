package com.voicestorybook.vehicle.core.start

import com.voicestorybook.vehicle.core.library.Story

const val COUNTDOWN_FROM = 3

data class CountdownState(val selected: Story, val remaining: Int = COUNTDOWN_FROM)

sealed interface CountdownEvent {
    // 1초가 지났다.
    data object Tick : CountdownEvent
    data class ChangeVoice(val story: Story) : CountdownEvent
    data object StartNow : CountdownEvent
    // 정차가 풀렸다(공회전·주행·상태 모름).
    data object LeftPark : CountdownEvent
    data object Cancel : CountdownEvent
}

sealed interface CountdownStep {
    data class Counting(val state: CountdownState) : CountdownStep
    data class Play(val story: Story) : CountdownStep
    data object Cancelled : CountdownStep
}

// 목소리를 바꾸면 3부터 다시 센다. 정차가 풀리면 고른 목소리로 바로 재생한다.
fun countdownStep(state: CountdownState, event: CountdownEvent): CountdownStep = when (event) {
    CountdownEvent.Tick -> if (state.remaining <= 1) CountdownStep.Play(state.selected) else CountdownStep.Counting(state.copy(remaining = state.remaining - 1))
    is CountdownEvent.ChangeVoice -> CountdownStep.Counting(CountdownState(event.story))
    CountdownEvent.StartNow, CountdownEvent.LeftPark -> CountdownStep.Play(state.selected)
    CountdownEvent.Cancel -> CountdownStep.Cancelled
}

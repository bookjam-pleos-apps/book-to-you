package com.voicestorybook.vehicle.core.start

import com.voicestorybook.vehicle.core.shelf.render
import kotlin.test.Test
import kotlin.test.assertEquals

class CountdownTest {
    private val mom = render("a-mom", "a", "mom")
    private val dad = render("a-dad", "a", "dad")

    private fun tickTimes(times: Int): CountdownStep =
        (1..times).fold<Int, CountdownStep>(CountdownStep.Counting(CountdownState(mom))) { step, _ ->
            if (step is CountdownStep.Counting) countdownStep(step.state, CountdownEvent.Tick) else step
        }

    @Test
    fun `three ticks count 3, 2, 1 and then play`() {
        assertEquals(CountdownStep.Counting(CountdownState(mom, 1)), tickTimes(2))
        assertEquals(CountdownStep.Play(mom), tickTimes(3))
    }

    @Test
    fun `changing the voice restarts from three with that voice`() {
        val step = countdownStep(CountdownState(mom, 1), CountdownEvent.ChangeVoice(dad))
        assertEquals(CountdownStep.Counting(CountdownState(dad, COUNTDOWN_FROM)), step)
    }

    @Test
    fun `starting now or leaving park plays the selected voice at once`() {
        assertEquals(CountdownStep.Play(dad), countdownStep(CountdownState(dad, 2), CountdownEvent.StartNow))
        assertEquals(CountdownStep.Play(dad), countdownStep(CountdownState(dad, 3), CountdownEvent.LeftPark))
    }

    @Test
    fun `cancel never plays`() {
        assertEquals(CountdownStep.Cancelled, countdownStep(CountdownState(mom, 2), CountdownEvent.Cancel))
    }
}

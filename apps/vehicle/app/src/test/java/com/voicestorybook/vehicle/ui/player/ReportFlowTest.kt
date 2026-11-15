package com.voicestorybook.vehicle.ui.player

import com.voicestorybook.vehicle.core.report.ReportOutcome
import com.voicestorybook.vehicle.core.report.ReportReason
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlin.test.Test
import kotlin.test.assertEquals

class ReportFlowTest {
    private val events = mutableListOf<String>()

    private val prompt = object : ReportPrompt {
        var pick: ((ReportReason) -> Unit)? = null

        override fun askReason(onReason: (ReportReason) -> Unit) {
            events += "ask"
            pick = onReason
        }

        override fun showResult(outcome: ReportOutcome) {
            events += "result:$outcome"
        }
    }

    private fun flowOf(renderId: String?) = ReportFlow(
        scope = CoroutineScope(Dispatchers.Unconfined),
        renderId = { renderId },
        send = { id, reason -> events += "send:$id:$reason"; ReportOutcome.Sent },
        pausePlayback = { events += "pause" },
        prompt = prompt,
    )

    @Test
    fun `pauses before asking and shows the outcome of the chosen reason`() {
        flowOf("r1").open()
        prompt.pick?.invoke(ReportReason.Content)
        assertEquals(listOf("pause", "ask", "send:r1:Content", "result:Sent"), events)
    }

    @Test
    fun `does nothing without a story, leaving playback alone`() {
        flowOf(null).open()
        assertEquals(emptyList(), events)
    }
}

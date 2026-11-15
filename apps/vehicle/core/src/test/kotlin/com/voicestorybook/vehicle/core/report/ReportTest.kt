package com.voicestorybook.vehicle.core.report

import kotlin.test.Test
import kotlin.test.assertEquals

class ReportTest {
    @Test
    fun `server accepts a report with 204 and refuses an unknown story with 404`() {
        assertEquals(ReportOutcome.Sent, reportOutcomeOf(204))
        assertEquals(ReportOutcome.NotOnShelf, reportOutcomeOf(404))
    }

    @Test
    fun `anything else, including no connection, counts as failed so the parent can try again`() {
        assertEquals(ReportOutcome.Failed, reportOutcomeOf(null))
        assertEquals(ReportOutcome.Failed, reportOutcomeOf(401))
        assertEquals(ReportOutcome.Failed, reportOutcomeOf(500))
    }

    @Test
    fun `reasons are sent with the values the server accepts`() {
        assertEquals(listOf("voice", "content"), ReportReason.entries.map { it.wire })
    }
}

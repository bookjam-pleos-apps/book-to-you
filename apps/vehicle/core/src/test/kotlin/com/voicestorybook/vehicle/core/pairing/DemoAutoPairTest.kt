package com.voicestorybook.vehicle.core.pairing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DemoAutoPairTest {
    @Test
    fun `auto pairing is off unless the build turns it on with a code`() {
        assertNull(autoPairCodeOf(enabled = false, rawCode = "ABCD-EFGH-JKLM-NP23"))
        assertNull(autoPairCodeOf(enabled = true, rawCode = "  "))
        assertEquals("ABCD-EFGH-JKLM-NP23", autoPairCodeOf(enabled = true, rawCode = " abcdefghjklmnp23 "))
    }

    @Test
    fun `retry waits double from 30 seconds up to 10 minutes`() {
        val delays = (0..8).map(::autoPairRetryDelayMs)
        assertEquals(listOf(0L, 30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000, 600_000), delays)
    }

    @Test
    fun `retry delay never exceeds the cap even after many failures`() {
        assertEquals(600_000, autoPairRetryDelayMs(1_000))
    }

    @Test
    fun `demo account offers my voice instead of disconnecting only when auto pairing is on`() {
        assertEquals(HomeAccountAction.StartWithMyVoice, homeAccountActionOf(autoPair = true, account = PairedAccount.Demo))
        assertEquals(HomeAccountAction.Disconnect, homeAccountActionOf(autoPair = true, account = PairedAccount.Own))
        assertEquals(HomeAccountAction.Disconnect, homeAccountActionOf(autoPair = false, account = PairedAccount.Demo))
    }
}

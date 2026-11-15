package com.voicestorybook.vehicle.core.pairing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class PairingPollTest {
    private val ticket = PairingTicket("dc", "ABCD2345", "https://x/pair", expiresAtMs = 600_000, intervalMs = 5_000)
    private val waiting = startWaiting(ticket, nowMs = 0)

    @Test
    fun `first poll waits one interval`() {
        assertEquals(5_000, waiting.nextPollAtMs)
    }

    @Test
    fun `pending keeps the interval`() {
        val next = assertIs<PairingState.Waiting>(advance(waiting, PollOutcome.Pending, 5_000))
        assertEquals(5_000, next.intervalMs)
        assertEquals(10_000, next.nextPollAtMs)
    }

    @Test
    fun `slow_down adds five seconds and keeps it`() {
        val slowed = assertIs<PairingState.Waiting>(advance(waiting, PollOutcome.SlowDown, 5_000))
        val after = assertIs<PairingState.Waiting>(advance(slowed, PollOutcome.Pending, 15_000))
        assertEquals(10_000, slowed.intervalMs)
        assertEquals(15_000, slowed.nextPollAtMs)
        assertEquals(10_000, after.intervalMs)
    }

    @Test
    fun `network failures back off exponentially up to a cap and reset on a server answer`() {
        val failures = generateSequence(waiting) { advance(it, PollOutcome.NetworkFailure, 0) as? PairingState.Waiting }
            .drop(1).take(5).toList()
        assertEquals(listOf(10_000L, 20_000L, 40_000L, 60_000L, 60_000L), failures.map { it.nextPollAtMs })

        val recovered = assertIs<PairingState.Waiting>(advance(failures.last(), PollOutcome.Pending, 100))
        assertEquals(5_100, recovered.nextPollAtMs)
        assertEquals(0, recovered.consecutiveFailures)
    }

    @Test
    fun `token ends polling even past expiry`() {
        assertEquals(PairingState.Paired("t"), advance(waiting, PollOutcome.Token("t"), 999_999))
    }

    @Test
    fun `expiry is terminal from the server or the local clock`() {
        assertEquals(PairingState.Expired, advance(waiting, PollOutcome.Expired, 1))
        assertEquals(PairingState.Expired, advance(waiting, PollOutcome.Pending, 600_000))
    }

    @Test
    fun `invalid_grant is denied`() {
        assertEquals(PairingState.Denied, advance(waiting, PollOutcome.Denied, 1))
    }
}

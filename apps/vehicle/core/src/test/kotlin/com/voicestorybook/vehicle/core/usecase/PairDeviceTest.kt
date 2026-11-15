package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.pairing.PairingTicket
import com.voicestorybook.vehicle.core.pairing.PollOutcome
import com.voicestorybook.vehicle.core.port.PairingGateway
import com.voicestorybook.vehicle.core.port.PairingStart
import com.voicestorybook.vehicle.core.port.StartResult
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class ScriptedGateway(
    private val start: StartResult,
    outcomes: List<PollOutcome>,
    private val clock: VirtualClock,
) : PairingGateway {
    private val queue = ArrayDeque(outcomes)
    val pollTimes = mutableListOf<Long>()
    var starts = 0
    override suspend fun start(deviceName: String) = start.also { starts += 1 }
    override suspend fun poll(deviceCode: String): PollOutcome {
        pollTimes += clock.now
        return queue.removeFirstOrNull() ?: PollOutcome.Pending
    }
}

private class VirtualClock(var now: Long = 0)

class PairDeviceTest {
    private val started = StartResult.Started(PairingStart("dc", "ABCD2345", "https://x/pair", expiresInSec = 600, intervalSec = 5))

    private suspend fun pair(gateway: ScriptedGateway, clock: VirtualClock, tickets: MutableList<PairingTicket>) =
        PairDevice(gateway, { clock.now }, { clock.now += it }).run("차량") { tickets += it }

    @Test
    fun `shows the code once and polls at the interval until confirmed`() = runTest {
        val clock = VirtualClock()
        val gateway = ScriptedGateway(started, listOf(PollOutcome.Pending, PollOutcome.SlowDown, PollOutcome.Token("tok")), clock)
        val tickets = mutableListOf<PairingTicket>()
        assertEquals(PairingResult.Paired("tok"), pair(gateway, clock, tickets))
        assertEquals(listOf("ABCD2345"), tickets.map { it.userCode })
        assertEquals(listOf(5_000L, 10_000L, 20_000L), gateway.pollTimes)
    }

    @Test
    fun `gives up when the code expires without confirmation`() = runTest {
        val clock = VirtualClock()
        val gateway = ScriptedGateway(started, emptyList(), clock)
        assertEquals(PairingResult.Expired, pair(gateway, clock, mutableListOf()))
        assertEquals(120, gateway.pollTimes.size)
    }

    @Test
    fun `reports a failed start without polling`() = runTest {
        val clock = VirtualClock()
        val gateway = ScriptedGateway(StartResult.Failed("rate_limited"), emptyList(), clock)
        val tickets = mutableListOf<PairingTicket>()
        assertEquals(PairingResult.StartFailed("rate_limited"), pair(gateway, clock, tickets))
        assertEquals(emptyList(), gateway.pollTimes)
        assertEquals(emptyList(), tickets)
    }

    @Test
    fun `resumes waiting on the same code without asking for a new one`() = runTest {
        val clock = VirtualClock(now = 100_000)
        val gateway = ScriptedGateway(started, listOf(PollOutcome.Pending, PollOutcome.Token("tok")), clock)
        val ticket = PairingTicket("dc", "ABCD2345", "https://x/pair", expiresAtMs = 600_000, intervalMs = 5_000)
        val result = PairDevice(gateway, { clock.now }, { clock.now += it }).resume(ticket)
        assertEquals(PairingResult.Paired("tok"), result)
        assertEquals(0, gateway.starts)
        assertEquals(listOf(105_000L, 110_000L), gateway.pollTimes)
    }

    @Test
    fun `resuming after the code expired ends without polling`() = runTest {
        val clock = VirtualClock(now = 600_000)
        val gateway = ScriptedGateway(started, emptyList(), clock)
        val ticket = PairingTicket("dc", "ABCD2345", "https://x/pair", expiresAtMs = 600_000, intervalMs = 5_000)
        assertEquals(PairingResult.Expired, PairDevice(gateway, { clock.now }, { clock.now += it }).resume(ticket))
        assertEquals(emptyList(), gateway.pollTimes)
    }
}

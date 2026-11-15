package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.port.DemoPairing
import com.voicestorybook.vehicle.core.port.DemoPairingGateway
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class ScriptedDemoGateway(replies: List<DemoPairing>) : DemoPairingGateway {
    private val left = ArrayDeque(replies)
    val sent = mutableListOf<String>()
    override suspend fun redeem(deviceName: String, demoCode: String): DemoPairing {
        sent += demoCode
        return left.removeFirst()
    }
}

class AutoPairDemoTest {
    @Test
    fun `retries with growing waits until the demo account pairs`() = runTest {
        val gateway = ScriptedDemoGateway(listOf(DemoPairing.Failed("down"), DemoPairing.InvalidCode, DemoPairing.Paired("t")))
        val slept = mutableListOf<Long>()
        val failures = mutableListOf<Int>()
        val token = AutoPairDemo(PairWithDemoCode(gateway)) { slept += it }.run("car", "ABCD-EFGH-JKLM-NP23", 0) { _, n -> failures += n }
        assertEquals("t", token)
        assertEquals(listOf(30_000L, 60_000L), slept)
        assertEquals(listOf(1, 2), failures)
        assertEquals(3, gateway.sent.size)
    }

    @Test
    fun `resuming after failures waits before asking again`() = runTest {
        val gateway = ScriptedDemoGateway(listOf(DemoPairing.Paired("t")))
        val slept = mutableListOf<Long>()
        AutoPairDemo(PairWithDemoCode(gateway)) { slept += it }.run("car", "ABCD-EFGH-JKLM-NP23", 3) { _, _ -> }
        assertEquals(listOf(120_000L), slept)
    }
}

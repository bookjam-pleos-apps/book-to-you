package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.port.DemoPairing
import com.voicestorybook.vehicle.core.port.DemoPairingGateway
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

private class RecordingDemoGateway(private val reply: DemoPairing) : DemoPairingGateway {
    val sent = mutableListOf<String>()
    override suspend fun redeem(deviceName: String, demoCode: String): DemoPairing {
        sent += demoCode
        return reply
    }
}

class PairWithDemoCodeTest {
    @Test
    fun `sends the normalized code and returns the server answer`() = runTest {
        val gateway = RecordingDemoGateway(DemoPairing.Paired("t"))
        assertEquals(DemoPairing.Paired("t"), PairWithDemoCode(gateway).run("car", " abcdefghjklmnp23 "))
        assertEquals(listOf("ABCD-EFGH-JKLM-NP23"), gateway.sent)
    }

    @Test
    fun `empty input is invalid without asking the server`() = runTest {
        val gateway = RecordingDemoGateway(DemoPairing.Paired("t"))
        assertEquals(DemoPairing.InvalidCode, PairWithDemoCode(gateway).run("car", "  "))
        assertEquals(emptyList(), gateway.sent)
    }
}

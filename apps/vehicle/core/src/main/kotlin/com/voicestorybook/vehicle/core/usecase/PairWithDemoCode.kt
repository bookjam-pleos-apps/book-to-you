package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.pairing.normalizeDemoCode
import com.voicestorybook.vehicle.core.port.DemoPairing
import com.voicestorybook.vehicle.core.port.DemoPairingGateway

class PairWithDemoCode(private val gateway: DemoPairingGateway) {
    // 보낼 수 없는 입력은 서버에 묻지 않는다(페어링 경로는 IP당 시간당 30회로 제한된다).
    suspend fun run(deviceName: String, input: String): DemoPairing {
        val code = normalizeDemoCode(input) ?: return DemoPairing.InvalidCode
        return gateway.redeem(deviceName, code)
    }
}

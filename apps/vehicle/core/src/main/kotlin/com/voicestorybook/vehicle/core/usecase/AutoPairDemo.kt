package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.pairing.autoPairRetryDelayMs
import com.voicestorybook.vehicle.core.port.DemoPairing

// 시연 계정에 붙을 때까지 간격을 두고 다시 시도한다. 멈추는 것은 부르는 쪽의 취소다(화면이 가려지거나 다른 방법으로 연결됨).
// failures는 앞서 실패한 횟수다. 화면이 가려졌다 돌아와 이어서 부를 때 처음부터 연달아 묻지 않게 그만큼 기다린 뒤 묻는다.
class AutoPairDemo(
    private val pairWithDemoCode: PairWithDemoCode,
    private val sleep: suspend (Long) -> Unit,
) {
    tailrec suspend fun run(deviceName: String, code: String, failures: Int, onFailed: (DemoPairing, Int) -> Unit): String {
        if (failures > 0) sleep(autoPairRetryDelayMs(failures))
        val result = pairWithDemoCode.run(deviceName, code)
        if (result is DemoPairing.Paired) return result.accessToken
        onFailed(result, failures + 1)
        return run(deviceName, code, failures + 1, onFailed)
    }
}

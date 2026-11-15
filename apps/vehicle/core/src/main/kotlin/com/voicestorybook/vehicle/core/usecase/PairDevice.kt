package com.voicestorybook.vehicle.core.usecase

import com.voicestorybook.vehicle.core.pairing.PairingState
import com.voicestorybook.vehicle.core.pairing.PairingTicket
import com.voicestorybook.vehicle.core.pairing.advance
import com.voicestorybook.vehicle.core.pairing.isExpired
import com.voicestorybook.vehicle.core.pairing.startWaiting
import com.voicestorybook.vehicle.core.port.PairingGateway
import com.voicestorybook.vehicle.core.port.PairingStart
import com.voicestorybook.vehicle.core.port.StartResult

sealed interface PairingResult {
    data class Paired(val accessToken: String) : PairingResult
    data object Expired : PairingResult
    data object Denied : PairingResult
    data class StartFailed(val reason: String) : PairingResult
}

class PairDevice(
    private val gateway: PairingGateway,
    private val clock: () -> Long,
    private val sleep: suspend (Long) -> Unit,
) {
    suspend fun run(deviceName: String, onTicket: (PairingTicket) -> Unit): PairingResult {
        val start = when (val started = gateway.start(deviceName)) {
            is StartResult.Failed -> return PairingResult.StartFailed(started.reason)
            is StartResult.Started -> started.start
        }
        val ticket = toTicket(start, clock())
        onTicket(ticket)
        return resume(ticket)
    }

    // 화면이 가려져 멈췄던 확인 대기를 같은 코드로 잇는다. 그사이 기한이 지났으면 서버에 묻지 않고 만료로 끝낸다.
    suspend fun resume(ticket: PairingTicket): PairingResult {
        if (isExpired(ticket, clock())) return PairingResult.Expired
        return toResult(pollUntilDone(startWaiting(ticket, clock())))
    }

    // 폴링 횟수는 만료(서버 10분)로 제한된다.
    private tailrec suspend fun pollUntilDone(state: PairingState.Waiting): PairingState {
        sleep(maxOf(0, state.nextPollAtMs - clock()))
        val next = advance(state, gateway.poll(state.ticket.deviceCode), clock())
        return if (next is PairingState.Waiting) pollUntilDone(next) else next
    }
}

private fun toTicket(start: PairingStart, nowMs: Long) = PairingTicket(
    deviceCode = start.deviceCode,
    userCode = start.userCode,
    verificationUri = start.verificationUri,
    expiresAtMs = nowMs + start.expiresInSec * 1000,
    intervalMs = start.intervalSec * 1000,
)

private fun toResult(state: PairingState): PairingResult = when (state) {
    is PairingState.Paired -> PairingResult.Paired(state.accessToken)
    PairingState.Denied -> PairingResult.Denied
    PairingState.Expired, is PairingState.Waiting -> PairingResult.Expired
}

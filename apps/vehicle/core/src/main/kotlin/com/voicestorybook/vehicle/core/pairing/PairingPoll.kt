package com.voicestorybook.vehicle.core.pairing

data class PairingTicket(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val expiresAtMs: Long,
    val intervalMs: Long,
)

sealed interface PollOutcome {
    data class Token(val accessToken: String) : PollOutcome
    data object Pending : PollOutcome
    data object SlowDown : PollOutcome
    data object Expired : PollOutcome
    data object Denied : PollOutcome
    data object NetworkFailure : PollOutcome
}

sealed interface PairingState {
    data class Waiting(
        val ticket: PairingTicket,
        val intervalMs: Long,
        val nextPollAtMs: Long,
        val consecutiveFailures: Int = 0,
    ) : PairingState
    data class Paired(val accessToken: String) : PairingState
    data object Expired : PairingState
    data object Denied : PairingState
}

// RFC 8628 3.5: slow_down을 받으면 간격을 5초 늘린다.
const val SLOW_DOWN_STEP_MS = 5_000L

// RFC 8628 3.5: 연결 실패는 지수 백오프. 만료(10분) 안에서 몇 번은 더 시도하도록 상한을 둔다.
const val MAX_BACKOFF_MS = 60_000L

// 코드 기한이 지났는지. 지난 코드로는 서버에 묻지 않는다.
fun isExpired(ticket: PairingTicket, nowMs: Long): Boolean = nowMs >= ticket.expiresAtMs

fun startWaiting(ticket: PairingTicket, nowMs: Long): PairingState.Waiting =
    PairingState.Waiting(ticket, ticket.intervalMs, nowMs + ticket.intervalMs)

fun advance(state: PairingState.Waiting, outcome: PollOutcome, nowMs: Long): PairingState {
    if (outcome is PollOutcome.Token) return PairingState.Paired(outcome.accessToken)
    if (outcome == PollOutcome.Expired || isExpired(state.ticket, nowMs)) return PairingState.Expired
    if (outcome == PollOutcome.Denied) return PairingState.Denied
    val interval = nextInterval(state.intervalMs, outcome)
    val failures = if (outcome == PollOutcome.NetworkFailure) state.consecutiveFailures + 1 else 0
    return state.copy(
        intervalMs = interval,
        nextPollAtMs = nowMs + waitAfter(interval, failures),
        consecutiveFailures = failures,
    )
}

private fun nextInterval(current: Long, outcome: PollOutcome): Long =
    if (outcome == PollOutcome.SlowDown) current + SLOW_DOWN_STEP_MS else current

private fun waitAfter(interval: Long, failures: Int): Long =
    if (failures == 0) interval else minOf(interval shl minOf(failures, 4), MAX_BACKOFF_MS)

fun isTerminal(state: PairingState): Boolean = state !is PairingState.Waiting

package com.voicestorybook.vehicle.adapter.http

import com.voicestorybook.vehicle.adapter.LenientJson
import com.voicestorybook.vehicle.core.pairing.PollOutcome
import com.voicestorybook.vehicle.core.port.DemoPairing
import com.voicestorybook.vehicle.core.port.DemoPairingGateway
import com.voicestorybook.vehicle.core.port.PairingGateway
import com.voicestorybook.vehicle.core.port.PairingStart
import com.voicestorybook.vehicle.core.port.StartResult
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString

// 계약 v1 devices.ts의 차량 쪽 사본.
@Serializable private data class StartBody(val deviceName: String)
@Serializable private data class StartReply(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val expiresInSec: Long,
    val intervalSec: Long,
)
@Serializable private data class TokenBody(val deviceCode: String)
@Serializable private data class TokenReply(val accessToken: String, val tokenType: String)
@Serializable private data class ErrorReply(val error: String)
@Serializable private data class DemoBody(val deviceName: String, val demoCode: String)

class HttpPairingGateway(private val http: ApiHttp) : PairingGateway, DemoPairingGateway {
    override suspend fun start(deviceName: String): StartResult {
        val reply = http.postJson("/v1/devices/pair/start", LenientJson.encodeToString(StartBody(deviceName)))
            ?: return StartResult.Failed("network")
        if (reply.code != 200) return StartResult.Failed("http ${reply.code}")
        val body = decodeOrNull<StartReply>(reply.body) ?: return StartResult.Failed("malformed")
        return StartResult.Started(PairingStart(body.deviceCode, body.userCode, body.verificationUri, body.expiresInSec, body.intervalSec))
    }

    override suspend fun poll(deviceCode: String): PollOutcome {
        val reply = http.postJson("/v1/devices/pair/token", LenientJson.encodeToString(TokenBody(deviceCode)))
            ?: return PollOutcome.NetworkFailure
        if (reply.code == 200) return decodeOrNull<TokenReply>(reply.body)?.let { PollOutcome.Token(it.accessToken) } ?: PollOutcome.NetworkFailure
        return when (decodeOrNull<ErrorReply>(reply.body)?.error) {
            "authorization_pending" -> PollOutcome.Pending
            "slow_down" -> PollOutcome.SlowDown
            "expired_token" -> PollOutcome.Expired
            "invalid_grant" -> PollOutcome.Denied
            else -> PollOutcome.NetworkFailure
        }
    }

    // 응답 표는 시연 서버 문서(deploy/demo/README.md)를 따른다.
    override suspend fun redeem(deviceName: String, demoCode: String): DemoPairing {
        val reply = http.postJson("/v1/devices/pair/demo", LenientJson.encodeToString(DemoBody(deviceName, demoCode)))
            ?: return DemoPairing.Failed("network")
        return when (reply.code) {
            200 -> decodeOrNull<TokenReply>(reply.body)?.let { DemoPairing.Paired(it.accessToken) } ?: DemoPairing.Failed("malformed")
            400 -> DemoPairing.InvalidCode
            404 -> DemoPairing.Unsupported
            429 -> DemoPairing.TooManyAttempts
            503 -> demoUnavailable(reply.body)
            else -> DemoPairing.Failed("http ${reply.code}")
        }
    }

    private fun demoUnavailable(body: String): DemoPairing =
        if (decodeOrNull<ErrorReply>(body)?.error == "demo_not_ready") DemoPairing.NotReady else DemoPairing.Failed("http 503")
}

private inline fun <reified T> decodeOrNull(body: String): T? = try {
    LenientJson.decodeFromString<T>(body)
} catch (e: SerializationException) {
    null
} catch (e: IllegalArgumentException) {
    null
}

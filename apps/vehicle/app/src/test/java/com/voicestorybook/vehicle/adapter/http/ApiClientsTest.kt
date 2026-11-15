package com.voicestorybook.vehicle.adapter.http

import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

// 네트워크 없이 보낸 요청만 모은다. 응답은 빈 JSON 200이다.
private class RecordingClient {
    val sent = mutableListOf<Request>()
    val client: OkHttpClient = OkHttpClient.Builder().addInterceptor { chain ->
        sent += chain.request()
        Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
            .body("{}".toResponseBody("application/json".toMediaType())).build()
    }.build()
}

class ApiClientsTest {
    private val recording = RecordingClient()
    private val api = ApiClients("http://api.test", recording.client) { "car-token" }

    @Test
    fun `pairing requests go without the car token even while paired`() = runBlocking {
        val gateway = HttpPairingGateway(api.pairing)
        gateway.start("car")
        gateway.poll("device-code")
        gateway.redeem("car", "ABCD-EFGH-JKLM-NP23")
        assertEquals(listOf("/v1/devices/pair/start", "/v1/devices/pair/token", "/v1/devices/pair/demo"), recording.sent.map { it.url.encodedPath })
        recording.sent.forEach { assertNull(it.header("Authorization")) }
    }

    @Test
    fun `library requests carry the car token`() = runBlocking {
        api.device.get("/v1/library/manifest")
        assertEquals("Bearer car-token", recording.sent.single().header("Authorization"))
    }
}

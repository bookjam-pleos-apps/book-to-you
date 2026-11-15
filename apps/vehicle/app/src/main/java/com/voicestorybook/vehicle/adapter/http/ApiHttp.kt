package com.voicestorybook.vehicle.adapter.http

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException

data class HttpReply(val code: Int, val body: String)

// 코어 API와의 경계. IO 실패는 null로 돌려주고 해석은 게이트웨이가 한다.
class ApiHttp(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val token: () -> String?,
) {
    // Content-Type이 없으면 서버 csrf()가 Origin 없는 POST를 403으로 막는다.
    suspend fun postJson(path: String, json: String): HttpReply? =
        execute(request(path).post(json.toRequestBody(JSON)).build()) { it.toReply() }

    suspend fun get(path: String): HttpReply? = execute(request(path).get().build()) { it.toReply() }

    suspend fun <T> stream(path: String, read: (Response) -> T): T? = execute(request(path).get().build(), read)

    private fun request(path: String): Request.Builder {
        val builder = Request.Builder().url(baseUrl.trimEnd('/') + path)
        val bearer = token() ?: return builder
        return builder.header("Authorization", "Bearer $bearer")
    }

    private suspend fun <T> execute(request: Request, read: (Response) -> T): T? = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use(read)
        } catch (e: IOException) {
            null
        } catch (e: IllegalArgumentException) {
            // 주소 설정이 잘못된 경우. 앱을 죽이지 않고 연결 실패로 다룬다.
            null
        }
    }

    private fun Response.toReply() = HttpReply(code, body?.string().orEmpty())

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}

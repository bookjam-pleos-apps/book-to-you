package com.voicestorybook.vehicle.adapter.http

import okhttp3.OkHttpClient

// 차 토큰은 듣기(manifest, audio)와 신고(reports)에만 쓴다. 서버는 기기 토큰이 붙은 요청을 기기 경로 밖에서 403으로 막으므로
// (apps/api access-policy judgeAccess) 연결 요청(pair/start, pair/token, pair/demo)은 연결된 상태에서도 토큰 없이 보낸다.
class ApiClients(baseUrl: String, client: OkHttpClient, token: () -> String?) {
    val device = ApiHttp(baseUrl, client, token)
    val pairing = ApiHttp(baseUrl, client) { null }
}

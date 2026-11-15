package com.voicestorybook.vehicle.core.gleo

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

// Pleos 음성 비서(Gleo)가 부르는 기능과 그 응답 형식(Gleo Interface). 기능 목록은 앱의 assets/schema.json과 같아야 한다.
const val PLAY_STORY = "PLAY_STORY"

enum class GleoStatus(val wire: String) { Success("success"), Fail("fail") }

// Gleo가 넘기는 인자(ACTION_PARAM)에서 이야기 제목을 꺼낸다. 인자가 없거나 읽지 못하면 빈 문자열("동화 틀어줘")로 본다.
// 문서 예시는 JSON 객체를 따옴표로 한 번 더 감싸 보낸다. 감싼 것과 안 감싼 것을 모두 읽는다.
fun storyTitleOf(actionParam: String?): String {
    val text = actionParam?.trim().orEmpty()
    val parameters = objectIn(text) ?: objectIn(text.removeSurrounding("\"")) ?: return ""
    return (parameters["title"] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
}

private fun objectIn(text: String): JsonObject? = when (val parsed = parsedOrNull(text)) {
    is JsonObject -> parsed
    is JsonPrimitive -> parsed.contentOrNull?.let(::parsedOrNull) as? JsonObject
    else -> null
}

private fun parsedOrNull(text: String): JsonElement? = runCatching { Json.parseToJsonElement(text) }.getOrNull()

// 재생은 앱이 직접 소리를 내므로 Gleo는 말 대신 완료음만 낸다(mode beep). 실패는 Gleo가 이유를 말한다.
// playedTitle은 튼 이야기 제목이다. Gleo가 대화 문맥으로 쓰도록 data에 싣는다(문서 권장, JSON 배열을 문자열로).
fun gleoResponse(functionName: String, status: GleoStatus, message: String, playedTitle: String? = null): String = buildJsonObject {
    put("functionName", functionName)
    put("status", status.wire)
    put("message", message)
    put("mode", if (status == GleoStatus.Success) "beep" else "voice")
    playedTitle?.let { title -> put("data", buildJsonArray { add(buildJsonObject { put("title", title) }) }.toString()) }
}.toString()

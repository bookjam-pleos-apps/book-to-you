package com.voicestorybook.vehicle.core.pairing

// 시연 서버 계약: 데모 코드는 XXXX-XXXX-XXXX-XXXX(대문자와 숫자)이고 서버는 그대로 비교한다.
// 앞뒤 공백 제거와 대문자 변환은 앱의 몫이다. 하이픈이나 공백 없이 16자를 넣었으면 4자리씩 끊어 준다.
private const val DEMO_CODE_MAX_LENGTH = 128
private const val GROUP_LENGTH = 4
private const val UNGROUPED_LENGTH = 16

// 보낼 수 없는 입력(비었거나 너무 김)이면 null.
fun normalizeDemoCode(input: String): String? {
    val code = input.trim().uppercase()
    if (code.isEmpty() || code.length > DEMO_CODE_MAX_LENGTH) return null
    val bare = code.filter(Char::isLetterOrDigit)
    val looksUngrouped = bare.length == UNGROUPED_LENGTH && code.all { it.isLetterOrDigit() || it == '-' || it.isWhitespace() }
    return if (looksUngrouped) bare.chunked(GROUP_LENGTH).joinToString("-") else code
}

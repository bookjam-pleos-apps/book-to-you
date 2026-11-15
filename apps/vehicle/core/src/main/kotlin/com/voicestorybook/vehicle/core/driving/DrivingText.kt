package com.voicestorybook.vehicle.core.driving

// 주행 중 문자열 길이 제한(LIMIT_STRING_LENGTH)이 걸려 있으면 받은 최대 길이, 아니면 null.
// 줄이는 대상은 데이터에서 오는 글(이야기 제목, 목소리 이름)과 상황 안내(상태 줄, 멈춤 배너, 잘림 안내)다.
// 화면 제목·버튼 라벨 같은 고정 문구는 짧게 써 두고 줄이지 않는다. AI 합성 음성 고지는 법적 고지라 줄이지 않는다.
fun textLimitOf(restriction: DrivingRestriction): Int? {
    if (restriction !is DrivingRestriction.Known || !restriction.requiresDistractionOptimization) return null
    if (DrivingLimit.StringLength !in restriction.limits) return null
    return restriction.maxStringLength.coerceAtLeast(0)
}

// 줄임표까지 넣어 limit 글자를 넘기지 않는다. 글자는 코드 포인트로 세어 이모지 같은 두 단위 글자를 반으로 자르지 않는다.
fun limitText(text: String, limit: Int?): String {
    if (limit == null || text.codePointCount(0, text.length) <= limit) return text
    if (limit == 0) return ""
    return text.substring(0, text.offsetByCodePoints(0, limit - 1)).trimEnd() + "…"
}

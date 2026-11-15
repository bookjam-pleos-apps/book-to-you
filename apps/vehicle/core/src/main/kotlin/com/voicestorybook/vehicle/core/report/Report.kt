package com.voicestorybook.vehicle.core.report

// 계약 v1 vocab REPORT_REASONS의 차량 쪽 사본이다. 서버가 받는 값(wire)과 같아야 한다.
enum class ReportReason(val wire: String) {
    Voice("voice"),
    Content("content"),
}

sealed interface ReportOutcome {
    data object Sent : ReportOutcome
    data object NotOnShelf : ReportOutcome // 404: 서버 책장에서 사라진 이야기
    data object Failed : ReportOutcome
}

// POST /v1/reports 응답: 접수는 204다. 연결이 안 되면 상태 코드가 없다.
fun reportOutcomeOf(httpCode: Int?): ReportOutcome = when (httpCode) {
    204 -> ReportOutcome.Sent
    404 -> ReportOutcome.NotOnShelf
    else -> ReportOutcome.Failed
}

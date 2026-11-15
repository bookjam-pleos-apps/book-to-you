package com.voicestorybook.vehicle.adapter.http

import com.voicestorybook.vehicle.adapter.LenientJson
import com.voicestorybook.vehicle.core.port.ReportGateway
import com.voicestorybook.vehicle.core.report.ReportOutcome
import com.voicestorybook.vehicle.core.report.ReportReason
import com.voicestorybook.vehicle.core.report.reportOutcomeOf
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

// 계약 v1 reports.ts의 차량 쪽 사본.
@Serializable private data class ReportBody(val renderId: String, val reason: String)

class HttpReportGateway(private val http: ApiHttp) : ReportGateway {
    override suspend fun send(renderId: String, reason: ReportReason): ReportOutcome {
        val body = LenientJson.encodeToString(ReportBody(renderId, reason.wire))
        return reportOutcomeOf(http.postJson("/v1/reports", body)?.code)
    }
}

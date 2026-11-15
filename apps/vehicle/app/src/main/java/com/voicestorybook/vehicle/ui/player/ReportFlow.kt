package com.voicestorybook.vehicle.ui.player

import com.voicestorybook.vehicle.core.report.ReportOutcome
import com.voicestorybook.vehicle.core.report.ReportReason
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

typealias SendReport = suspend (renderId: String, reason: ReportReason) -> ReportOutcome

// 사유를 묻고 결과를 보이는 팝업. 화면 쪽 구현은 DialogReportPrompt다.
interface ReportPrompt {
    fun askReason(onReason: (ReportReason) -> Unit)
    fun showResult(outcome: ReportOutcome)
}

// Pleos 심사 가이드: AI 생성 콘텐츠 앱은 신고 기능을 둔다. 사유를 고르면 지금 듣는 이야기를 서버로 보내고,
// 접수됐을 때만 "신고했어요"라고 보인다. 보내는 중에 주행이 시작되거나 화면을 떠나면 결과를 띄우지 않는다.
// 신고하는 동안 이야기가 다음 장으로 넘어가지 않도록 재생을 멈춘다. 다시 듣기는 사용자가 직접 누른다.
class ReportFlow(
    private val scope: CoroutineScope,
    private val renderId: () -> String?,
    private val send: SendReport,
    private val pausePlayback: () -> Unit,
    private val prompt: ReportPrompt,
) {
    private var sending: Job? = null

    fun open() {
        val target = renderId() ?: return
        pausePlayback()
        prompt.askReason { reason -> submit(target, reason) }
    }

    fun cancel() {
        sending?.cancel()
        sending = null
    }

    private fun submit(target: String, reason: ReportReason) {
        if (sending?.isActive == true) return
        sending = scope.launch { prompt.showResult(send(target, reason)) }
    }
}

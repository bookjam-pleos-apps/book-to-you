package com.voicestorybook.vehicle.ui.player

import android.app.Dialog
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.StringRes
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.report.ReportOutcome
import com.voicestorybook.vehicle.core.report.ReportReason
import com.voicestorybook.vehicle.ui.ParkedOnlyAction
import com.voicestorybook.vehicle.ui.popupWindowWidth

private data class ReasonChoice(@StringRes val label: Int, val reason: ReportReason)

private val CHOICES = listOf(
    ReasonChoice(R.string.report_reason_voice, ReportReason.Voice),
    ReasonChoice(R.string.report_reason_content, ReportReason.Content),
)

private data class ResultText(@StringRes val title: Int, @StringRes val message: Int)

private fun resultTextOf(outcome: ReportOutcome): ResultText = when (outcome) {
    ReportOutcome.Sent -> ResultText(R.string.report_sent_title, R.string.report_sent_message)
    ReportOutcome.NotOnShelf -> ResultText(R.string.report_gone_title, R.string.report_gone_message)
    ReportOutcome.Failed -> ResultText(R.string.report_failed_title, R.string.report_failed_message)
}

internal fun reasonDialog(context: Context, onReason: (ReportReason) -> Unit): Dialog {
    val dialog = reportDialog(context, R.string.report_title, null)
    dialog.findViewById<View>(R.id.dialogClose).visibility = View.GONE
    val options = dialog.findViewById<LinearLayout>(R.id.dialogOptions)
    CHOICES.forEachIndexed { index, choice ->
        options.addView(reasonButton(context, choice, index) { disableChildren(options); onReason(choice.reason) })
    }
    return dialog
}

internal fun resultDialog(context: Context, outcome: ReportOutcome): Dialog {
    val text = resultTextOf(outcome)
    val dialog = reportDialog(context, text.title, text.message)
    dialog.findViewById<View>(R.id.dialogOptions).visibility = View.GONE
    dialog.findViewById<View>(R.id.dialogDismiss).visibility = View.GONE
    return dialog
}

private fun reportDialog(context: Context, @StringRes title: Int, @StringRes message: Int?): Dialog {
    val dialog = Dialog(context, R.style.Theme_Vehicle_Popup)
    dialog.setContentView(R.layout.dialog_report)
    dialog.window?.setLayout(popupWindowWidth(context), ViewGroup.LayoutParams.WRAP_CONTENT)
    dialog.findViewById<TextView>(R.id.dialogTitle).setText(title)
    dialog.findViewById<TextView>(R.id.dialogMessage).bindMessage(message)
    dialog.findViewById<View>(R.id.dialogDismiss).setOnClickListener { dialog.dismiss() }
    dialog.findViewById<Button>(R.id.dialogClose).setOnClickListener { dialog.dismiss() }
    return dialog
}

private fun TextView.bindMessage(@StringRes message: Int?) {
    if (message == null) {
        visibility = View.GONE
        return
    }
    setText(message)
}

// 보내는 동안 다시 누르지 못하게 사유 버튼을 모두 끈다. 꺼진 버튼 모양이 "보내는 중" 표시를 겸한다.
private fun disableChildren(group: LinearLayout) = (0 until group.childCount).forEach { group.getChildAt(it).isEnabled = false }

private fun reasonButton(context: Context, choice: ReasonChoice, index: Int, onClick: () -> Unit): Button =
    Button(context, null, 0, R.style.Button_Primary_Large).apply {
        setText(choice.label)
        setOnClickListener { onClick() }
        val gap = if (index == 0) 0 else resources.getDimensionPixelSize(R.dimen.spaceL)
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = gap }
    }

internal class DialogReportPrompt(private val context: Context, private val action: ParkedOnlyAction) : ReportPrompt {
    override fun askReason(onReason: (ReportReason) -> Unit) = action.showDialog(reasonDialog(context, onReason))

    override fun showResult(outcome: ReportOutcome) = action.showDialog(resultDialog(context, outcome))
}

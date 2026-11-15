package com.voicestorybook.vehicle.ui

import android.app.Dialog
import android.content.Context
import android.view.ViewGroup
import android.widget.TextView
import androidx.annotation.StringRes
import com.voicestorybook.vehicle.R

data class ConfirmText(@StringRes val title: Int, @StringRes val message: Int, @StringRes val confirm: Int)

// 05 팝업 모양(layout/dialog_confirm.xml, Pleos System Popup): 아이콘 + 제목 + 설명 + [확인] [취소].
// 확인을 누르면 닫고 onConfirm을 부른다.
fun confirmDialog(context: Context, text: ConfirmText, onConfirm: () -> Unit): Dialog {
    val dialog = Dialog(context, R.style.Theme_Vehicle_Popup)
    dialog.setContentView(R.layout.dialog_confirm)
    dialog.window?.setLayout(popupWindowWidth(context), ViewGroup.LayoutParams.WRAP_CONTENT)
    dialog.findViewById<TextView>(R.id.dialogTitle).setText(text.title)
    dialog.findViewById<TextView>(R.id.dialogMessage).setText(text.message)
    dialog.findViewById<TextView>(R.id.dialogConfirm).apply {
        setText(text.confirm)
        setOnClickListener {
            dialog.dismiss()
            onConfirm()
        }
    }
    dialog.findViewById<TextView>(R.id.dialogCancel).setOnClickListener { dialog.dismiss() }
    return dialog
}

// 팝업 폭은 토큰(dialogWidth)이되 분할 창에서도 화면 가장자리 여백 안에 들어오게 줄인다. 그림자 자리는 양옆에 더한다.
internal fun popupWindowWidth(context: Context): Int {
    val res = context.resources
    val windowWidth = (res.configuration.screenWidthDp * res.displayMetrics.density).toInt()
    val available = windowWidth - 2 * res.getDimensionPixelSize(R.dimen.spaceScreenSide)
    val card = minOf(res.getDimensionPixelSize(R.dimen.dialogWidth), available)
    return card + 2 * res.getDimensionPixelSize(R.dimen.dialogShadowRoom)
}

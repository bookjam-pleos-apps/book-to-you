package com.voicestorybook.vehicle.ui

import android.app.Dialog
import android.view.View

// 정차 중에만 보이는 보조 버튼(연결 끊기, 신고)과 그 팝업. 주행이 시작되면 버튼을 숨기고 열린 팝업도 닫는다.
class ParkedOnlyAction(private val button: View, onClick: (ParkedOnlyAction) -> Unit) {
    private var dialog: Dialog? = null

    init {
        button.setOnClickListener { onClick(this) }
    }

    // 팝업은 하나만 띄운다. 다음 단계 팝업을 열면 앞의 것을 닫는다.
    fun showDialog(next: Dialog) {
        dismiss()
        dialog = next.also { it.show() }
    }

    fun setParked(parked: Boolean) {
        button.visibility = if (parked) View.VISIBLE else View.GONE
        if (!parked) dismiss()
    }

    fun dismiss() {
        dialog?.dismiss()
        dialog = null
    }
}

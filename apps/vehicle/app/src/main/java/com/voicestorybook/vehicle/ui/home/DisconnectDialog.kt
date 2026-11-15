package com.voicestorybook.vehicle.ui.home

import android.app.Dialog
import android.content.Context
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.ui.ConfirmText
import com.voicestorybook.vehicle.ui.confirmDialog

private val DISCONNECT_TEXT = ConfirmText(R.string.disconnect_title, R.string.disconnect_message, R.string.disconnect_confirm)

// 연결을 끊으면 받아 둔 이야기와 기록이 이 차에서 지워진다. 서버의 기기 등록은 부모 웹에서 지운다.
fun disconnectDialog(context: Context, onConfirm: () -> Unit): Dialog = confirmDialog(context, DISCONNECT_TEXT, onConfirm)

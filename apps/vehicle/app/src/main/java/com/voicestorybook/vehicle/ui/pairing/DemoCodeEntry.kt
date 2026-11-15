package com.voicestorybook.vehicle.ui.pairing

import android.os.LocaleList
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.port.DemoPairing
import com.voicestorybook.vehicle.core.usecase.PairWithDemoCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.Locale

// 심사자용 데모 코드 입력칸. 연결 화면의 코드 영역 안에 있어 주행 중에는 함께 숨는다.
class DemoCodeEntry(
    root: View,
    private val pairWithDemoCode: PairWithDemoCode,
    private val deviceName: String,
    private val scope: CoroutineScope,
    private val onPaired: (accessToken: String) -> Unit,
) {
    private val input: EditText = root.findViewById(R.id.demoCodeInput)
    private val submit: Button = root.findViewById(R.id.demoCodeSubmit)
    private val status: TextView = root.findViewById(R.id.demoCodeStatus)
    private var redeeming: Job? = null

    init {
        submit.setOnClickListener { redeem() }
        input.setOnEditorActionListener { _, actionId, _ -> redeemOnGo(actionId) }
        // 코드는 영문 대문자와 숫자다. 키보드에 영문 자판을 먼저 띄우라고 알린다(XML 속성이 없어 코드로 정한다).
        input.imeHintLocales = LocaleList(Locale.US)
    }

    fun release() {
        redeeming?.cancel()
    }

    private fun redeem() {
        if (redeeming?.isActive == true) return
        hideKeyboard()
        submit.isEnabled = false
        status.setText(R.string.demo_code_checking)
        redeeming = scope.launch {
            val result = pairWithDemoCode.run(deviceName, input.text.toString())
            submit.isEnabled = true
            if (result is DemoPairing.Paired) return@launch onPaired(result.accessToken)
            status.setText(messageOf(result))
        }
    }

    // 키보드의 이동 키가 연결 버튼과 같다. 다른 키는 키보드가 처리하게 둔다.
    private fun redeemOnGo(actionId: Int): Boolean {
        if (actionId != EditorInfo.IME_ACTION_GO) return false
        redeem()
        return true
    }

    private fun hideKeyboard() {
        input.context.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(input.windowToken, 0)
        input.clearFocus()
    }

    private fun messageOf(result: DemoPairing): Int = when (result) {
        DemoPairing.InvalidCode -> R.string.demo_code_invalid
        DemoPairing.NotReady -> R.string.demo_code_not_ready
        DemoPairing.Unsupported -> R.string.demo_code_unsupported
        DemoPairing.TooManyAttempts -> R.string.demo_code_too_many
        is DemoPairing.Failed, is DemoPairing.Paired -> R.string.demo_code_failed
    }
}

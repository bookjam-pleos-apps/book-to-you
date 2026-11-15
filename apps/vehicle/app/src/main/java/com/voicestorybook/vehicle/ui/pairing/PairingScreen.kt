package com.voicestorybook.vehicle.ui.pairing

import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.voicestorybook.vehicle.BuildConfig
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.ui.Screen
import com.voicestorybook.vehicle.core.pairing.PairedAccount
import com.voicestorybook.vehicle.core.pairing.PairingTicket
import com.voicestorybook.vehicle.core.usecase.PairDevice
import com.voicestorybook.vehicle.core.usecase.PairWithDemoCode
import com.voicestorybook.vehicle.core.usecase.PairingResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val QR_SIZE_PX = 640

class PairingScreen(
    private val root: View,
    private val pairDevice: PairDevice,
    pairWithDemoCode: PairWithDemoCode,
    private val owner: LifecycleOwner,
    private val mode: PairingMode,
    onPaired: (PairedAccount, accessToken: String) -> Unit,
) : Screen {
    private val qr: ImageView = root.findViewById(R.id.pairingQr)
    private val code: TextView = root.findViewById(R.id.pairingCode)
    private val status: TextView = root.findViewById(R.id.pairingStatus)
    private val retry: Button = root.findViewById(R.id.pairingRetry)
    private val codeArea: View = root.findViewById(R.id.pairingCodeArea)
    private val parkedOnly: View = root.findViewById(R.id.pairingParkedOnly)
    private val scope = owner.lifecycleScope
    private val autoPair: AutoPairRunner? = (mode as? PairingMode.Unpaired)?.autoPair
    private var pairing: Job? = null
    private var countdown: Job? = null
    private var ticket: PairingTicket? = null
    private var attemptOver = false

    // QR 확인과 데모 코드가 거의 같이 끝나도 연결은 한 번만 넘긴다(두 번째 토큰이 첫 토큰을 덮지 않게).
    private var finished = false
    private val finish: (PairedAccount, String) -> Unit = { account, token ->
        if (!finished) {
            finished = true
            release()
            onPaired(account, token)
        }
    }

    private val demoCode = DemoCodeEntry(root, pairWithDemoCode, root.context.getString(R.string.device_name), scope) {
        finish(PairedAccount.Demo, it)
    }

    init {
        retry.setOnClickListener { startQr() }
        val showsDemoCode = BuildConfig.DEMO_CODE_PAIRING && mode is PairingMode.Unpaired
        root.findViewById<View>(R.id.demoCodeEntry).visibility = if (showsDemoCode) View.VISIBLE else View.GONE
        root.findViewById<View>(R.id.pairingBack).apply {
            visibility = if (mode is PairingMode.SwitchAccount) View.VISIBLE else View.GONE
            setOnClickListener { goBack() }
        }
    }

    // 시연 빌드에서 연결이 없으면 시연 계정부터 붙여 본다. 처음 실패하면 QR을 띄우고, 뒤에서는 간격을 두고 계속 시도한다.
    fun start() {
        val autoPair = autoPair ?: return startQr()
        status.setText(R.string.pairing_auto)
        autoPair.start(onFirstFailure = ::startQr) { finish(PairedAccount.Demo, it) }
    }

    // 본인 계정으로 옮기던 중이면 시연 계정 홈으로 돌아간다. 연결이 없을 때는 돌아갈 곳이 없다.
    fun goBack(): Boolean {
        if (mode !is PairingMode.SwitchAccount) return false
        mode.onBack()
        return true
    }

    private fun startQr() {
        stopCodePairing()
        ticket = null
        attemptOver = false
        retry.visibility = View.GONE
        code.text = ""
        qr.setImageDrawable(null)
        status.setText(R.string.pairing_starting)
        pairing = scope.launch { owner.repeatOnLifecycle(Lifecycle.State.STARTED) { pairWhileVisible() } }
    }

    // 화면이 가려지면(STOPPED) 서버 폴링과 1초 카운트다운을 멈추고, 돌아오면 같은 코드로 잇는다(Pleos: 백그라운드 폴링·타이머 최소화).
    private suspend fun pairWhileVisible() = coroutineScope {
        if (attemptOver) return@coroutineScope
        val show: (PairingTicket) -> Unit = {
            showTicket(it)
            countdown = launch { showRemaining(it) }
        }
        val result = ticket?.let { show(it); pairDevice.resume(it) } ?: pairDevice.run(deviceName(), show)
        countdown?.cancel()
        attemptOver = true
        showResult(result)
    }

    private fun deviceName(): String = root.context.getString(R.string.device_name)

    // 주행 중에는 QR과 코드를 가린다. 확인 대기(폴링)는 계속해서, 차를 세우면 같은 코드가 다시 보인다.
    override fun setParked(parked: Boolean) {
        qr.visibility = if (parked) View.VISIBLE else View.INVISIBLE
        codeArea.visibility = if (parked) View.VISIBLE else View.GONE
        parkedOnly.visibility = if (parked) View.GONE else View.VISIBLE
    }

    override fun release() {
        stopCodePairing()
        demoCode.release()
        autoPair?.release()
    }

    private fun stopCodePairing() {
        pairing?.cancel()
    }

    private fun showTicket(next: PairingTicket) {
        ticket = next
        code.text = displayCode(next.userCode)
        qr.setImageBitmap(qrBitmap(verificationLink(next.verificationUri, next.userCode), QR_SIZE_PX))
    }

    private tailrec suspend fun showRemaining(ticket: PairingTicket) {
        val remainingSec = (ticket.expiresAtMs - System.currentTimeMillis()) / 1000
        if (remainingSec <= 0) return
        status.text = root.context.getString(R.string.pairing_waiting, "%d:%02d".format(remainingSec / 60, remainingSec % 60))
        delay(1_000)
        showRemaining(ticket)
    }

    private fun showResult(result: PairingResult) {
        if (result is PairingResult.Paired) return finish(PairedAccount.Own, result.accessToken)
        status.setText(
            when (result) {
                PairingResult.Denied -> R.string.pairing_denied
                is PairingResult.StartFailed -> R.string.pairing_failed
                else -> R.string.pairing_expired
            },
        )
        retry.visibility = View.VISIBLE
    }
}

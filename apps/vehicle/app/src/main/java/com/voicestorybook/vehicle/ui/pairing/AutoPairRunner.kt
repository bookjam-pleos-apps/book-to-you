package com.voicestorybook.vehicle.ui.pairing

import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.voicestorybook.vehicle.core.usecase.AutoPairDemo
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private const val TAG = "AutoPair"

// 연결 화면 뒤에서 시연 계정 자동 연결을 돌린다. 화면이 보일 때만 묻고(Pleos: 백그라운드 폴링 최소화),
// 돌아오면 앞서 실패한 횟수만큼 기다린 뒤 다시 묻는다.
class AutoPairRunner(
    private val autoPair: AutoPairDemo,
    private val deviceName: String,
    private val code: String,
    private val owner: LifecycleOwner,
) {
    private var failures = 0
    private var job: Job? = null

    fun start(onFirstFailure: () -> Unit, onPaired: (accessToken: String) -> Unit) {
        job?.cancel()
        job = owner.lifecycleScope.launch {
            owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                val token = autoPair.run(deviceName, code, failures) { result, count ->
                    failures = count
                    Log.i(TAG, "demo auto pairing failed ($count): $result")
                    if (count == 1) onFirstFailure()
                }
                onPaired(token)
            }
        }
    }

    fun release() {
        job?.cancel()
    }
}

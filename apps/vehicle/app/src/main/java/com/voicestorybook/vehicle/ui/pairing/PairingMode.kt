package com.voicestorybook.vehicle.ui.pairing

import androidx.appcompat.app.AppCompatActivity
import com.voicestorybook.vehicle.AppGraph
import com.voicestorybook.vehicle.R

// 연결 화면을 연 이유.
sealed interface PairingMode {
    // 연결이 없다. 시연 빌드면 QR보다 먼저 시연 계정 자동 연결을 시도한다(autoPair가 null이면 끔).
    class Unpaired(val autoPair: AutoPairRunner?) : PairingMode

    // 시연 계정의 홈에서 "내 목소리로 시작하기"를 눌렀다. QR만 보이고, 돌아가면 시연 계정 홈으로 간다.
    class SwitchAccount(val onBack: () -> Unit) : PairingMode
}

// 연결이 없을 때의 연결 화면. 시연 빌드(자동 연결 코드가 있음)에서만 자동 연결을 붙인다.
fun unpairedModeOf(graph: AppGraph, activity: AppCompatActivity) = PairingMode.Unpaired(
    graph.autoPairCode?.let { AutoPairRunner(graph.autoPairDemo, activity.getString(R.string.device_name), it, activity) },
)

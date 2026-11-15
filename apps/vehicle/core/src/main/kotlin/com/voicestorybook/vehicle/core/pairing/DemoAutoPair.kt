package com.voicestorybook.vehicle.core.pairing

// 시연 빌드 전용: 연결이 없으면 빌드에 넣은 데모 코드로 시연 계정에 붙는다(제품 빌드에서는 꺼 둔다).
// 실패하면 간격을 두 배씩 늘려 다시 시도한다. 페어링 경로는 IP당 시간당 30회로 제한되므로 상한 10분이면 시간당 10회 안팎이다.
private const val FIRST_RETRY_MS = 30_000L
private const val MAX_RETRY_MS = 600_000L
private const val MAX_DOUBLINGS = 5

// 꺼져 있거나 보낼 수 없는 코드면 null(자동 연결을 하지 않는다).
fun autoPairCodeOf(enabled: Boolean, rawCode: String): String? {
    if (!enabled) return null
    return normalizeDemoCode(rawCode)
}

// failures번 실패한 뒤 다음 시도까지 기다릴 시간. 30초, 1분, 2분, 4분, 8분, 그 뒤로는 10분.
fun autoPairRetryDelayMs(failures: Int): Long {
    if (failures <= 0) return 0
    val doublings = minOf(failures - 1, MAX_DOUBLINGS)
    return minOf(FIRST_RETRY_MS shl doublings, MAX_RETRY_MS)
}

// 홈 머리줄의 계정 버튼. 시연 계정에서 연결을 끊으면 곧바로 다시 시연 계정에 붙으므로 끊기 대신 본인 계정으로 옮기는 버튼을 둔다.
// 정차 중에만 보이는 것은 화면(ParkedOnlyAction)이 정한다.
enum class HomeAccountAction { StartWithMyVoice, Disconnect }

fun homeAccountActionOf(autoPair: Boolean, account: PairedAccount): HomeAccountAction =
    if (autoPair && account == PairedAccount.Demo) HomeAccountAction.StartWithMyVoice else HomeAccountAction.Disconnect

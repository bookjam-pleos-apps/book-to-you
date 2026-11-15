package com.voicestorybook.vehicle.core.driving

// CarUxRestrictions에서 앱이 직접 적용하는 제한. 나머지 플래그(영상, 키보드 등)는 해당 기능이 없어 옮기지 않는다.
enum class DrivingLimit { Content, StringLength }

// 상한값(항목 수, 문자열 길이, 깊이)은 차량 쪽 설정이라 기본값을 가정하지 않고 받은 값을 그대로 담는다.
sealed interface DrivingRestriction {
    data object Unknown : DrivingRestriction
    data class Known(
        val requiresDistractionOptimization: Boolean,
        val limits: Set<DrivingLimit>,
        val maxContentItems: Int,
        val maxStringLength: Int,
        val maxContentDepth: Int,
    ) : DrivingRestriction
}

// 상태를 모르면(차량 서비스 연결 전·실패) 주행 중으로 본다.
// 연결 코드, 연결 끊기, 신고처럼 주행 중에 막는 조작은 모두 이 판정 하나를 쓴다.
fun isParked(restriction: DrivingRestriction): Boolean =
    restriction is DrivingRestriction.Known && !restriction.requiresDistractionOptimization

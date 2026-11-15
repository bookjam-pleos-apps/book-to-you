package com.voicestorybook.vehicle.core.driving

// 이야기 고르기를 얼마나 열지. DO 요구 여부가 아니라 CarUxRestrictions 플래그로 정한다.
sealed interface StoryBrowsing {
    data object Locked : StoryBrowsing
    data object Open : StoryBrowsing
    // maxDepth: 목록을 몇 단까지 들어가게 둘 수 있는지. 책장(목소리) → 책은 2단이다.
    data class Limited(val maxItems: Int, val maxDepth: Int) : StoryBrowsing
}

// 책장의 책을 누를 수 있는지. 항목 수 제한 중에도 보이는 책은 고를 수 있다.
fun canChoose(browsing: StoryBrowsing): Boolean = browsing != StoryBrowsing.Locked

// AAOS 기본 설정에서 공회전(기어 P 아님, 속도 0)은 LIMIT_CONTENT가 없고, 실제 주행(속도 > 0)은 모든 제한이 켜진다.
// 그래서 주행 중의 기본 경로는 Limited다. 상태를 모르면 잠근다.
fun storyBrowsingOf(restriction: DrivingRestriction): StoryBrowsing {
    if (restriction !is DrivingRestriction.Known) return StoryBrowsing.Locked
    if (!restriction.requiresDistractionOptimization) return StoryBrowsing.Open
    if (DrivingLimit.Content !in restriction.limits) return StoryBrowsing.Open
    return StoryBrowsing.Limited(restriction.maxContentItems.coerceAtLeast(0), restriction.maxContentDepth)
}

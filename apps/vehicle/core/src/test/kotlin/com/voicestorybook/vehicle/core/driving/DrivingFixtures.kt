package com.voicestorybook.vehicle.core.driving

internal fun restrictionOf(
    requiresDistractionOptimization: Boolean,
    limits: Set<DrivingLimit> = emptySet(),
    maxContentItems: Int = 0,
    maxStringLength: Int = 0,
    maxContentDepth: Int = 0,
) = DrivingRestriction.Known(requiresDistractionOptimization, limits, maxContentItems, maxStringLength, maxContentDepth)

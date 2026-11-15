package com.voicestorybook.vehicle.core.driving

import kotlin.test.Test
import kotlin.test.assertEquals

class StoryBrowsingTest {
    private val allLimits = setOf(DrivingLimit.Content, DrivingLimit.StringLength)

    @Test
    fun `locked while the restriction is unknown`() {
        assertEquals(StoryBrowsing.Locked, storyBrowsingOf(DrivingRestriction.Unknown))
    }

    @Test
    fun `only a locked state blocks choosing`() {
        assertEquals(false, canChoose(StoryBrowsing.Locked))
        assertEquals(true, canChoose(StoryBrowsing.Open))
        assertEquals(true, canChoose(StoryBrowsing.Limited(maxItems = 0, maxDepth = 0)))
    }

    @Test
    fun `open when parked even if stale limit flags remain`() {
        val parked = restrictionOf(requiresDistractionOptimization = false, limits = allLimits, maxContentItems = 3)
        assertEquals(StoryBrowsing.Open, storyBrowsingOf(parked))
    }

    @Test
    fun `open while idling without the content limit`() {
        val idling = restrictionOf(requiresDistractionOptimization = true, limits = setOf(DrivingLimit.StringLength))
        assertEquals(StoryBrowsing.Open, storyBrowsingOf(idling))
    }

    @Test
    fun `limited to the received item count when the content limit is active`() {
        val moving = restrictionOf(requiresDistractionOptimization = true, limits = allLimits, maxContentItems = 21, maxContentDepth = 3)
        assertEquals(StoryBrowsing.Limited(maxItems = 21, maxDepth = 3), storyBrowsingOf(moving))
    }

    @Test
    fun `a non-positive item count leaves nothing to choose`() {
        val moving = restrictionOf(requiresDistractionOptimization = true, limits = allLimits, maxContentItems = -1)
        assertEquals(StoryBrowsing.Limited(maxItems = 0, maxDepth = 0), storyBrowsingOf(moving))
    }
}

package com.voicestorybook.vehicle.core.pairing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DemoCodeTest {
    @Test
    fun `trims and uppercases a grouped code`() {
        assertEquals("ABCD-EFGH-JKLM-NP23", normalizeDemoCode("  abcd-efgh-jklm-np23 "))
    }

    @Test
    fun `groups sixteen characters typed without separators or with spaces`() {
        assertEquals("ABCD-EFGH-JKLM-NP23", normalizeDemoCode("abcdefghjklmnp23"))
        assertEquals("ABCD-EFGH-JKLM-NP23", normalizeDemoCode("ABCD EFGH JKLM NP23"))
    }

    // 시연 서버의 실제 코드는 숫자 16자리다(Pleos 키보드의 숫자판으로 입력).
    @Test
    fun `groups a sixteen-digit code typed on the number pad`() {
        assertEquals("1234-5678-9012-3456", normalizeDemoCode("1234567890123456"))
        assertEquals("1234-5678-9012-3456", normalizeDemoCode(" 1234 5678 9012 3456 "))
        assertEquals("1234-5678-9012-3456", normalizeDemoCode("1234-5678-9012-3456"))
    }

    @Test
    fun `leaves other shapes for the server to judge`() {
        assertEquals("SHORT-CODE", normalizeDemoCode("short-code"))
    }

    @Test
    fun `rejects empty and over-long input`() {
        assertNull(normalizeDemoCode("   "))
        assertNull(normalizeDemoCode("A".repeat(129)))
    }
}

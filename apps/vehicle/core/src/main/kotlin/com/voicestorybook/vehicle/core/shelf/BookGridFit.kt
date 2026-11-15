package com.voicestorybook.vehicle.core.shelf

// 내 책장 칸 배치. 단위는 픽셀이고, 칸 하나는 책 폭 + 오른쪽 간격(gap)이다.
data class BookGridFit(val columns: Int, val cellWidth: Int)

// Figma 내 책장은 이어서 듣기 카드 옆 2열이다. 카드가 없으면 그 자리까지 책장이 넓어지므로 3열까지 둔다.
// 좁은 분할 창은 카드가 위로 가 책장 폭이 같고, 열 수는 폭(minWidth)이 먼저 막는다(840 창 2열, 628 창 1열).
fun maxBookColumnsOf(resumeShown: Boolean): Int = if (resumeShown) 2 else 3

// 칸이 minWidth보다 좁아지지 않는 만큼 열을 두고(1 ~ maxColumns), 남는 폭은 maxWidth까지 칸을 키워 채운다.
fun bookGridFitOf(available: Int, minWidth: Int, maxWidth: Int, gap: Int, maxColumns: Int): BookGridFit {
    val columns = (available / (minWidth + gap)).coerceIn(1, maxColumns)
    return BookGridFit(columns, (available / columns - gap).coerceIn(1, maxWidth))
}

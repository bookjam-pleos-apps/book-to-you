package com.voicestorybook.vehicle.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.GridLayout
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.driving.limitText
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.listening.ListeningMark
import com.voicestorybook.vehicle.core.shelf.Book
import com.voicestorybook.vehicle.core.shelf.CoverShape
import com.voicestorybook.vehicle.core.shelf.bookGridFitOf
import com.voicestorybook.vehicle.ui.bindCover

data class StoryRow(val story: Story, val mark: ListeningMark?, val ready: Boolean)

// 내 책장의 책 한 권. 같은 이야기의 목소리들을 묶었다. ready는 받아 둔 목소리가 하나라도 있는지다.
// arrivalFit: 내비 안내 중이고 도착 전에 끝나는 책. 제목 아래 작은 태그로 알린다.
data class BookRow(val book: Book, val ready: Boolean, val arrivalFit: Boolean = false)

// 책 뷰는 tag에 BookRow를 달아 applySelectable이 다시 찾는다.
// textLimit: 주행 중 문자열 길이 제한(없으면 null). 제목을 그 길이로 줄인다.
fun inflateBook(parent: ViewGroup, row: BookRow, textLimit: Int?, onClick: (BookRow) -> Unit): View {
    val view = LayoutInflater.from(parent.context).inflate(R.layout.item_book, parent, false)
    view.findViewById<TextView>(R.id.bookTitle).text = limitText(row.book.title, textLimit)
    view.findViewById<View>(R.id.bookArrivalFit).visibility = if (row.arrivalFit) View.VISIBLE else View.GONE
    val hint = if (row.ready) R.string.cover_placeholder else R.string.book_downloading
    bindCover(view.findViewById(R.id.bookCover), row.book.storyId, CoverShape.Landscape, hint)
    view.setOnClickListener { onClick(row) }
    view.tag = row
    return view
}

fun booksIn(grid: ViewGroup): List<View> = (0 until grid.childCount).map(grid::getChildAt)

// 창 폭이 바뀌면(분할 전환) 열 수와 칸 폭을 다시 정한다. 칸이 bookMinWidth보다 좁아지면 열을 줄이고,
// 남는 폭은 thumbWidth까지 칸을 키워 채운다(840 분할 창도 2열, 628 창은 1열). 그림은 16:9를 지킨다.
// maxColumns: 이어서 듣기 카드가 있으면 2, 없으면 3(maxBookColumnsOf). 카드가 생기거나 사라지면 책장 폭이 바뀌어 다시 잰다.
fun fitBookColumns(grid: GridLayout, maxColumns: () -> Int) {
    grid.addOnLayoutChangeListener { _, left, _, right, _, _, _, _, _ ->
        val fitted = bookGridOf(grid, right - left - grid.paddingStart - grid.paddingEnd, maxColumns())
        grid.tag = fitted
        if (!fitted.isAppliedTo(grid)) grid.post { fitted.applyTo(grid) }
    }
}

// 책장을 다시 만든 직후 마지막으로 잰 칸 폭을 바로 입힌다. 배치 뒤에 고치면 xml 폭으로 한 번 그려져 깜빡인다.
fun refitBooks(grid: GridLayout) {
    (grid.tag as? BookGrid)?.applyTo(grid)
}

private class BookGrid(val columns: Int, val cellWidth: Int, val ratio: Float) {
    fun isAppliedTo(grid: GridLayout): Boolean =
        grid.columnCount == columns && booksIn(grid).all { it.layoutParams.width == cellWidth }

    // GridLayout은 자동으로 놓은 칸 번호를 각 책의 LayoutParams에 적어 둔다. 그대로 열 수를 줄이면
    // "columnCount must be greater than ..." 예외로 앱이 죽으므로(분할 창 전환에서 재현), 칸 번호를 자동(UNDEFINED)으로 되돌린 뒤 바꾼다.
    fun applyTo(grid: GridLayout) {
        booksIn(grid).forEach(::resize)
        grid.columnCount = columns
    }

    private fun resize(book: View) {
        val params = book.layoutParams as? GridLayout.LayoutParams ?: return
        params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED)
        params.rowSpec = GridLayout.spec(GridLayout.UNDEFINED)
        params.width = cellWidth
        book.layoutParams = params
        book.findViewById<View>(R.id.bookThumb).layoutParams.let { it.width = cellWidth; it.height = (cellWidth * ratio).toInt() }
    }
}

private fun bookGridOf(grid: GridLayout, available: Int, maxColumns: Int): BookGrid {
    val res = grid.resources
    val fit = bookGridFitOf(
        available,
        minWidth = res.getDimensionPixelSize(R.dimen.bookMinWidth),
        maxWidth = res.getDimensionPixelSize(R.dimen.thumbWidth),
        gap = res.getDimensionPixelSize(R.dimen.bookGap),
        maxColumns = maxColumns,
    )
    return BookGrid(fit.columns, fit.cellWidth, res.getDimension(R.dimen.thumbHeight) / res.getDimension(R.dimen.thumbWidth))
}

// 주행 상태를 모르거나 아직 받지 못한 책은 누를 수 없다. 흐리게 보여 줘 한눈에 구분되게 한다.
fun applySelectable(view: View, browsable: Boolean) {
    val row = view.tag as? BookRow ?: return
    val selectable = browsable && row.ready
    view.isEnabled = selectable
    view.alpha = if (selectable) 1f else DIMMED_ALPHA
}

// 누를 수 없는 책·버튼의 투명도. 잠금과 받는 중을 같은 모양으로 보인다.
internal const val DIMMED_ALPHA = 0.4f

package com.voicestorybook.vehicle.ui.home

import android.view.View
import android.widget.GridLayout
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.adapter.store.HistoryStore
import com.voicestorybook.vehicle.navi.ArrivalWatch
import com.voicestorybook.vehicle.core.driving.DrivingRestriction
import com.voicestorybook.vehicle.core.driving.StoryBrowsing
import com.voicestorybook.vehicle.core.driving.canChoose
import com.voicestorybook.vehicle.core.driving.limitText
import com.voicestorybook.vehicle.core.driving.storyBrowsingOf
import com.voicestorybook.vehicle.core.driving.textLimitOf
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.library.isPlayable
import com.voicestorybook.vehicle.core.pairing.HomeAccountAction
import com.voicestorybook.vehicle.core.port.cachedIds
import com.voicestorybook.vehicle.core.listening.recentStories
import com.voicestorybook.vehicle.core.shelf.Book
import com.voicestorybook.vehicle.core.shelf.HomeInput
import com.voicestorybook.vehicle.core.shelf.homeBooksOf
import com.voicestorybook.vehicle.core.shelf.fitsBeforeArrival
import com.voicestorybook.vehicle.core.shelf.isReady
import com.voicestorybook.vehicle.core.shelf.maxBookColumnsOf
import com.voicestorybook.vehicle.core.usecase.LibraryNotice
import com.voicestorybook.vehicle.core.usecase.LibraryStatus
import com.voicestorybook.vehicle.core.usecase.libraryNoticeOf
import com.voicestorybook.vehicle.ui.ParkedOnlyAction
import com.voicestorybook.vehicle.ui.Screen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

// 홈이 주행 상태에서 쓰는 두 값. 다른 제한 플래그(영상, 키보드 등)만 바뀔 때는 다시 그리지 않는다.
private data class HomeDriving(val browsing: StoryBrowsing, val textLimit: Int?)

// arrivalFits: 도착 전에 끝나는 책(storyId). 남은 시간 자체를 두면 1분마다 값이 바뀌어 책장을 다시 만들고 스크롤이 처음으로 돌아간다.
private data class BooksShown(val books: List<Book>, val cachedAudioIds: Set<String>, val textLimit: Int?, val arrivalFits: Set<String>)

private data class HomeState(val status: LibraryStatus, val driving: HomeDriving, val remainingMs: Long?)

private const val ARRIVAL_REFRESH_MS = 60_000L

data class HomeActions(
    // 이어서 듣기 카드는 그 목소리로 바로 재생하고, 책장의 책은 목소리를 정한 뒤 시작한다(v2 결정 1).
    val onResume: (StoryRow) -> Unit,
    val onSelectBook: (Book) -> Unit,
    val onDisconnect: () -> Unit,
    // 머리줄 계정 버튼이 연결 끊기인지, 시연 계정에서 본인 계정으로 옮기기(QR 연결 화면)인지.
    val account: HomeAccountAction,
    val onStartWithMyVoice: () -> Unit,
    // 플레이어에 올라간 이야기. 고르기가 잠겨도 이 이야기는 이어서 듣기로 열 수 있다.
    val loadedRenderId: () -> String?,
)

// 02 목록. 라이브러리 상태를 구독해 그리기만 한다. 동기화는 VehicleSession이 앱 범위에서 돌린다.
class HomeScreen(
    private val root: View,
    private val status: StateFlow<LibraryStatus>,
    private val restriction: StateFlow<DrivingRestriction>,
    private val arrival: ArrivalWatch,
    private val audio: FileAudioStore,
    private val history: HistoryStore,
    private val scope: CoroutineScope,
    private val lifecycle: Lifecycle,
    private val actions: HomeActions,
) : Screen {
    private val statusText: TextView = root.findViewById(R.id.homeStatus)
    private val truncatedNote: View = root.findViewById(R.id.homeTruncated)
    private val truncatedText: TextView = root.findViewById(R.id.homeTruncatedText)
    private val books: GridLayout = root.findViewById<GridLayout>(R.id.homeBooks).also {
        fitBookColumns(it) { maxBookColumnsOf(resumeShown = resume.story != null) }
    }
    private val resume = ResumeCard(root) { if (canOpen(it)) actions.onResume(it) }
    private var browsing: StoryBrowsing = StoryBrowsing.Locked
    private var resumeOpen = false
    private var textLimit: Int? = null
    private var booksShown: BooksShown? = null
    private val account = accountButtonOf(root, actions)
    private var watching: Job? = null
    private var arrivalTicker: Job? = null
    private var remainingMs: Long? = null

    fun start() {
        val driving = restriction.map { HomeDriving(storyBrowsingOf(it), textLimitOf(it)) }.distinctUntilChanged()
        watching = scope.launch { combine(status, driving, arrival.remainingMs, ::HomeState).collect(::show) }
        arrivalTicker = scope.launch { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { refreshArrivalWhileShown() } }
    }

    // 내비 남은 시간은 요청해야 온다. 홈이 보이는 동안(STARTED)만 1분마다 묻는다(Pleos: 백그라운드 폴링 최소화).
    private suspend fun refreshArrivalWhileShown() {
        while (currentCoroutineContext().isActive) {
            arrival.refresh()
            delay(ARRIVAL_REFRESH_MS)
        }
    }

    override fun release() {
        watching?.cancel()
        arrivalTicker?.cancel()
        account.dismiss()
    }

    // 이야기 고르기는 정차 여부가 아니라 제한 플래그(storyBrowsingOf)를 따른다. 계정 버튼(연결 끊기, QR 연결)만 정차 중에 연다.
    override fun setParked(parked: Boolean) = account.setParked(parked)

    private fun show(state: HomeState) {
        val (current, driving) = state
        browsing = driving.browsing
        textLimit = driving.textLimit
        remainingMs = state.remainingMs
        render((current as? LibraryStatus.Showing)?.library ?: Library(0, emptyList(), emptyList()))
        val notice = libraryNoticeOf(current)
        statusText.visibility = if (notice == null) View.GONE else View.VISIBLE
        notice?.let { statusText.text = limited(textOf(it)) }
        truncatedText.text = limited(R.string.home_truncated)
    }

    private fun render(library: Library) {
        val cached = audio.cachedIds()
        val marks = history.load()
        val rowOf = { story: Story -> StoryRow(story, marks.firstOrNull { it.renderId == story.renderId }, isPlayable(story, cached)) }
        val resumeRow = recentStories(marks, library, 1).firstOrNull()?.let { rowOf(it.story) }
        val home = homeBooksOf(HomeInput(library, marks, resumeRow?.story, cached, remainingMs), browsing)
        resume.show(resumeRow, textLimit)
        val fits = home.books.filter { fitsBeforeArrival(it, remainingMs, cached) }.map { it.storyId }.toSet()
        renderBooks(BooksShown(home.books, cached, textLimit, fits))
        truncatedNote.visibility = if (home.truncated) View.VISIBLE else View.GONE
        resumeOpen = home.resumeOpen
        applyBrowsing()
    }

    private fun applyBrowsing() {
        booksIn(books).forEach { applySelectable(it, canChoose(browsing)) }
        resume.setPlayable(resumeOpen || isLoaded(resume.story?.renderId))
    }

    // 책장은 목록이나 받은 파일이 바뀔 때만 다시 만든다. 동기화 메모만 바뀔 때(받는 중 → 받음) 다시 만들면
    // 내려 보던 목록이 처음으로 돌아간다.
    private fun renderBooks(next: BooksShown) {
        if (next == booksShown) return
        booksShown = next
        books.removeAllViews()
        next.books.forEach { books.addView(inflateBook(books, rowOf(it, next), next.textLimit, ::select)) }
        refitBooks(books)
    }

    private fun rowOf(book: Book, shown: BooksShown): BookRow =
        BookRow(book, isReady(book, shown.cachedAudioIds), book.storyId in shown.arrivalFits)

    private fun limited(text: Int): String = limitText(root.context.getString(text), textLimit)

    private fun select(row: BookRow) {
        if (canChoose(browsing) && row.ready) actions.onSelectBook(row.book)
    }

    private fun canOpen(row: StoryRow): Boolean = row.ready && (resumeOpen || isLoaded(row.story.renderId))

    private fun isLoaded(renderId: String?): Boolean = renderId != null && renderId == actions.loadedRenderId()
}

private fun accountButtonOf(root: View, actions: HomeActions): ParkedOnlyAction = when (actions.account) {
    HomeAccountAction.Disconnect -> ParkedOnlyAction(root.findViewById(R.id.homeDisconnect)) {
        it.showDialog(disconnectDialog(root.context, actions.onDisconnect))
    }
    HomeAccountAction.StartWithMyVoice -> ParkedOnlyAction(root.findViewById(R.id.homeStartMyVoice)) { actions.onStartWithMyVoice() }
}

private fun textOf(notice: LibraryNotice): Int = when (notice) {
    LibraryNotice.Syncing -> R.string.library_syncing
    LibraryNotice.FirstOffline -> R.string.library_first_offline
    LibraryNotice.Offline -> R.string.library_offline
    LibraryNotice.Expired -> R.string.library_expired
    LibraryNotice.Rejected -> R.string.library_rejected
    LibraryNotice.Empty -> R.string.library_empty
    LibraryNotice.PartlyDownloaded -> R.string.library_partial
}

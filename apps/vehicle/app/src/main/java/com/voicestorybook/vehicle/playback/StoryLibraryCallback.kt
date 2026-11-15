package com.voicestorybook.vehicle.playback

import androidx.annotation.OptIn
import androidx.core.os.bundleOf
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSession.MediaItemsWithStartPosition
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.voicestorybook.vehicle.adapter.store.FileAudioStore
import com.voicestorybook.vehicle.core.library.Library
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.core.library.playableStories
import com.voicestorybook.vehicle.core.listening.ListeningMark
import com.voicestorybook.vehicle.core.listening.searchStories
import com.voicestorybook.vehicle.core.listening.storyForVoiceRequest
import com.voicestorybook.vehicle.core.port.cachedIds
import com.voicestorybook.vehicle.core.shelf.voiceShelvesOf

// Pleos Music/Audio 가이드: 오디오 앱은 MediaBrowserService가 있어야 차량 미디어 화면에 잡힌다.
// 받아 둔 이야기만 내보이고, 고르면 앱 화면과 같은 전체 재생 목록을 이어 들을 자리부터 튼다.
// 앱 화면이 올리는 장 항목(파일 경로를 가진 MediaItem)은 그대로 통과시킨다.
// onSetMediaItems·MediaItemsWithStartPosition은 media3의 불안정 API다. 버전을 올릴 때 이 클래스를 다시 확인한다.
@OptIn(UnstableApi::class)
class StoryLibraryCallback(
    private val ownPackage: String,
    private val library: () -> Library?,
    private val audio: FileAudioStore,
    private val history: () -> List<ListeningMark>,
    private val voiceTitle: (String) -> String,
) : MediaLibrarySession.Callback {
    // 음성 비서가 검색 재생을 보낼 수 있다고 알리는 루트 표시(android.media.browse.SEARCH_SUPPORTED).
    private val searchableRoot: LibraryParams = LibraryParams.Builder()
        .setExtras(bundleOf("android.media.browse.SEARCH_SUPPORTED" to true))
        .build()

    // 이야기 목록(제목·목소리 이름)은 이 앱과 시스템 앱(차량 미디어 화면, 음성 비서)에만 보인다. 재생 조작은 예전처럼 받는다.
    override fun onGetLibraryRoot(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
        if (!mayBrowse(browser)) return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_PERMISSION_DENIED))
        return Futures.immediateFuture(LibraryResult.ofItem(libraryRootItem(), searchableRoot))
    }

    override fun onGetChildren(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val items = childrenOf(parentId)?.takeIf { mayBrowse(browser) }
            ?: return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
        return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
    }

    // 뿌리 아래는 목소리 폴더, 목소리 아래는 그 목소리의 이야기. 모르는 id면 null.
    private fun childrenOf(parentId: String): List<MediaItem>? {
        val shelves = voiceShelvesOf(playableStories())
        if (parentId == LIBRARY_ROOT_ID) return shelves.map { libraryVoiceItem(it, voiceTitle(it.voiceLabel)) }
        val key = voiceKeyOfLibraryItem(parentId) ?: return null
        return shelves.firstOrNull { it.key == key }?.stories?.map(::libraryStoryItem)
    }

    override fun onGetItem(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> {
        val story = storyOf(mediaId)?.takeIf { mayBrowse(browser) }
            ?: return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
        return Futures.immediateFuture(LibraryResult.ofItem(libraryStoryItem(story), null))
    }

    // 음성 비서는 루트의 SEARCH_SUPPORTED를 보고 검색을 보낸다. 결과는 notifySearchResultChanged 뒤 onGetSearchResult로 준다.
    override fun onSearch(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
        if (!mayBrowse(browser)) return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_PERMISSION_DENIED))
        session.notifySearchResultChanged(browser, query, searchStories(playableStories(), query).size, params)
        return Futures.immediateFuture(LibraryResult.ofVoid())
    }

    override fun onGetSearchResult(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        page: Int,
        pageSize: Int,
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        if (!mayBrowse(browser)) return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_PERMISSION_DENIED))
        val items = searchStories(playableStories(), query).map(::libraryStoryItem)
        return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
    }

    override fun onSetMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: MutableList<MediaItem>,
        startIndex: Int,
        startPositionMs: Long,
    ): ListenableFuture<MediaItemsWithStartPosition> {
        val story = mediaItems.singleOrNull()?.let(::requestedStory)
            ?: return super.onSetMediaItems(mediaSession, controller, mediaItems, startIndex, startPositionMs)
        return startFrom(story)
    }

    // 앱이 꺼진 뒤 핸들 버튼·미디어 카드의 재생으로 다시 틀 때: 가장 최근에 들은 이야기를 이어 듣는다.
    override fun onPlaybackResumption(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
    ): ListenableFuture<MediaItemsWithStartPosition> {
        val story = mostRecentStory() ?: return nothingToResume()
        return startFrom(story)
    }

    // 앱 화면의 장 항목은 그대로, 미디어 화면에서 고른 이야기는 그 이야기의 장들로 바꾼다.
    override fun onAddMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> {
        val stories = playableStories().associateBy { it.renderId }
        val resolved = mediaItems.flatMap { item -> storyIn(stories, item.mediaId)?.let { storyItems(it, audio) } ?: listOf(item) }
        return Futures.immediateFuture(resolved.toMutableList())
    }

    private fun mayBrowse(controller: MediaSession.ControllerInfo): Boolean =
        controller.packageName == ownPackage || controller.isTrusted

    private fun startFrom(story: Story): ListenableFuture<MediaItemsWithStartPosition> {
        val queue = resumeQueue(library(), story, history(), audio) ?: return nothingToResume()
        return Futures.immediateFuture(MediaItemsWithStartPosition(queue.items, queue.startIndex, queue.startPositionMs))
    }

    private fun nothingToResume(): ListenableFuture<MediaItemsWithStartPosition> =
        Futures.immediateFailedFuture(UnsupportedOperationException("no downloaded story to play"))

    // "동화 틀어줘"(제목 없음)와 이어 재생은 가장 최근에 들은 이야기를 튼다.
    private fun mostRecentStory(): Story? {
        val renderId = history().firstOrNull()?.renderId ?: return null
        return playableStories().firstOrNull { it.renderId == renderId }
    }

    private fun playableStories(): List<Story> = playableStories(library(), audio.cachedIds())

    // 미디어 화면에서 고른 이야기(story:…) 또는 음성 비서의 검색 재생(requestMetadata.searchQuery).
    private fun requestedStory(item: MediaItem): Story? {
        storyOf(item.mediaId)?.let { return it }
        val query = item.requestMetadata.searchQuery ?: return null
        return storyForVoiceRequest(playableStories(), history().firstOrNull()?.renderId, query)
    }

    private fun storyOf(mediaId: String): Story? {
        if (renderIdOfLibraryItem(mediaId) == null) return null
        return storyIn(playableStories().associateBy { it.renderId }, mediaId)
    }

    private fun storyIn(stories: Map<String, Story>, mediaId: String): Story? = renderIdOfLibraryItem(mediaId)?.let(stories::get)
}

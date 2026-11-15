package com.voicestorybook.vehicle.core.playback

// "n / m" 장 태그는 장이 둘 이상일 때만 뜻이 있다. 한 장짜리 이야기(지금 동화 모두)는 태그를 숨기고 진행 막대만 보인다.
fun showsChapterCount(chapterCount: Int): Boolean = chapterCount > 1

// 장 줄("제n장. 제목")은 제목이 있거나 장이 둘 이상일 때 보인다. 제목 없는 한 장짜리 이야기는 이야기 제목만으로 충분하다.
fun showsChapterLine(chapterTitle: String?, chapterCount: Int): Boolean = chapterTitle != null || showsChapterCount(chapterCount)

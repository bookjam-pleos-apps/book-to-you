package com.voicestorybook.vehicle.ui.countdown

import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.TextView
import com.voicestorybook.vehicle.R
import com.voicestorybook.vehicle.core.library.Story
import com.voicestorybook.vehicle.ui.home.DIMMED_ALPHA

// 목소리 고르기 칸을 만든다. 아직 받지 못한 목소리는 흐리게 두고 누를 수 없다. 칸마다 tag에 렌더를 단다.
fun inflateVoiceOptions(container: ViewGroup, renders: List<Story>, playableIds: Set<String>, onPick: (Story) -> Unit) {
    container.removeAllViews()
    renders.map { story -> voiceOption(container, story, story.renderId in playableIds, onPick) }.forEach(container::addView)
}

private fun voiceOption(container: ViewGroup, story: Story, playable: Boolean, onPick: (Story) -> Unit): TextView {
    val view = LayoutInflater.from(container.context).inflate(R.layout.item_voice_option, container, false) as TextView
    view.text = story.voiceLabel
    view.tag = story
    view.isEnabled = playable
    view.alpha = if (playable) 1f else DIMMED_ALPHA
    view.setOnClickListener { onPick(story) }
    return view
}

fun markSelectedVoice(container: ViewGroup, selected: Story) =
    (0 until container.childCount).map(container::getChildAt).forEach { option ->
        val isSelected = (option.tag as? Story)?.renderId == selected.renderId
        option.isSelected = isSelected
        option.setBackgroundResource(if (isSelected) R.drawable.bg_segment_selected else 0)
    }

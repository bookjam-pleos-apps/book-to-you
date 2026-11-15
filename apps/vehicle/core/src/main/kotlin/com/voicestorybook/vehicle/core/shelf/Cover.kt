package com.voicestorybook.vehicle.core.shelf

enum class CoverTone { Red, Sea, Mint }

// 표지는 서버가 주지 않는다. 앱에 넣은 그림을 이야기 id(artKey)로 고르고, 그림이 없으면 tone 색 블록으로 둔다.
data class Cover(val artKey: String?, val tone: CoverTone)

// 시연 동화 3편. 디자이너 그림이 오면 앱의 그림 표(CoverArt)에 같은 이름으로 넣는다.
private val DEMO_COVERS = mapOf(
    "redhood" to CoverTone.Red,
    "fisherman" to CoverTone.Sea,
    "masteraway" to CoverTone.Mint,
)

fun coverOf(storyId: String): Cover {
    val demoTone = DEMO_COVERS[storyId]
    if (demoTone != null) return Cover(storyId, demoTone)
    // 같은 이야기는 늘 같은 색이 되도록 id로 고른다(String.hashCode는 JVM 명세로 고정).
    val tones = CoverTone.entries
    return Cover(null, tones[Math.floorMod(storyId.hashCode(), tones.size)])
}

// 표지는 두 비율로 그린다. 이어서 듣기·재생 화면은 세로(3:4), 책장 썸네일은 가로(16:9).
enum class CoverShape { Portrait, Landscape }

// 이야기 하나의 그림 묶음(앱의 drawable id). 원하는 비율이 없으면 다른 비율을 초점에 맞춰 잘라 쓰고(cropRegion), 둘 다 없으면 null(색 블록)이다.
data class CoverArt(val portrait: Int?, val landscape: Int?) {
    fun pick(shape: CoverShape): Int? = when (shape) {
        CoverShape.Portrait -> portrait ?: landscape
        CoverShape.Landscape -> landscape ?: portrait
    }
}

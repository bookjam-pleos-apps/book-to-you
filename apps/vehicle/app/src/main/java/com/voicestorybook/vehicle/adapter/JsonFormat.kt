package com.voicestorybook.vehicle.adapter

import kotlinx.serialization.json.Json

// 앱 어댑터가 함께 쓰는 JSON 설정. 서버 응답과 저장 형식 모두 필드 추가에 견디도록 모르는 키는 무시한다.
val LenientJson: Json = Json { ignoreUnknownKeys = true }

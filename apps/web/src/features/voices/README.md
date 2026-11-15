# voices

목소리 등록과 관리다. 이 폴더에는 하위 폴더가 함께 쓰는 API 요청, 경로, 녹음 단계 판단이 있다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `record/` | 목소리를 등록하는 흐름이다. 이름, 동의 낭독, 스타일별 녹음, 업로드 결과와 재녹음을 다룬다. |
| `mic-guide/` | 첫 녹음 전에 휴대폰을 어떻게 드는지 보여 주는 안내다. |
| `manage/` | 등록한 목소리를 보고 관리한다. 상세 화면, ⋯ 메뉴, 이름 바꾸기, 카드 상태 계산이다. |

## 파일

| 파일 | 역할 |
|---|---|
| [label-picker.tsx](label-picker.tsx) | 목소리 이름(엄마, 아빠 등) 고르기 |
| [step-titles.ts](step-titles.ts) | 녹음 단계 이름 |
| [voice-fixture.ts](voice-fixture.ts) | 테스트용 목소리 데이터 |
| [voice-paths.ts](voice-paths.ts) | 등록·재녹음 경로 계산 |
| [voice-steps.ts](voice-steps.ts) | 다음 녹음 단계 판단 |
| [voices-api.ts](voices-api.ts) | 목소리·녹음 API 요청 |

## 테스트 파일

- [voice-paths.test.ts](voice-paths.test.ts)
- [voice-steps.test.ts](voice-steps.test.ts)

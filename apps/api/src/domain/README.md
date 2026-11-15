# domain

DB나 HTTP 없이 계산하는 규칙이다. 인증 코드, 녹음 판정, 렌더 계획 등을 다룬다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `demo/` | 시연 계정의 음성과 렌더 가져오기·내보내기에 쓰는 값과 판단 규칙이다. 같은 이름의 테스트에서 경계 조건을 확인할 수 있다. |
| `devices/` | 차량 페어링과 기기 관리에 쓰는 값과 판단 규칙이다. 같은 이름의 테스트에서 경계 조건을 확인할 수 있다. |
| `identity/` | OTP 로그인, 세션과 약관에 쓰는 값과 판단 규칙이다. 같은 이름의 테스트에서 경계 조건을 확인할 수 있다. |
| `library/` | 책장과 재생 가능 여부를 판단하는 규칙이다. |
| `render-worker/` | 렌더 상태를 보고 워커가 실행할 다음 동작을 정한다. |
| `renders/` | 렌더 요청·실행·게시와 오디오 제공에 쓰는 값과 판단 규칙이다. 같은 이름의 테스트에서 경계 조건을 확인할 수 있다. |
| `stories/` | 동화 목록과 제목 조회에 쓰는 값과 판단 규칙이다. 같은 이름의 테스트에서 경계 조건을 확인할 수 있다. |
| `voices/` | 동의, 목소리 등록과 녹음 검증에 쓰는 값과 판단 규칙이다. 같은 이름의 테스트에서 경계 조건을 확인할 수 있다. |

## 파일

- [audio-content-type.ts](audio-content-type.ts)
- [compare-text.ts](compare-text.ts)
- [constant-time.ts](constant-time.ts)
- [describe-error.ts](describe-error.ts)
- [ignore-failure.ts](ignore-failure.ts)
- [in-sequence.ts](in-sequence.ts)
- [random.ts](random.ts)
- [secret-token.ts](secret-token.ts)
- [sha256.ts](sha256.ts)
- [shared-owner.ts](shared-owner.ts)
- [storage-keys.ts](storage-keys.ts)
- [terms.ts](terms.ts)

## 테스트 파일

- [constant-time.test.ts](constant-time.test.ts)
- [in-sequence.test.ts](in-sequence.test.ts)
- [secret-token.test.ts](secret-token.test.ts)
- [storage-keys.test.ts](storage-keys.test.ts)
- [terms.test.ts](terms.test.ts)

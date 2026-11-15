# application

유스케이스와 외부 기능 인터페이스다. 다른 모듈에서는 각 폴더의 index.ts로 접근한다.

## 하위 폴더

| 경로 | 역할 |
|---|---|
| `chapterize/` | 동화 오디오를 챕터로 나누는 처리 흐름이다. |
| `demo/` | 시연 계정의 음성과 렌더 가져오기·내보내기의 처리 흐름이다. 외부 의존성은 ports.ts 또는 공통 ports에서 정의한다. |
| `devices/` | 차량 페어링과 기기 관리의 처리 흐름이다. 외부 의존성은 ports.ts 또는 공통 ports에서 정의한다. |
| `identity/` | OTP 로그인, 세션과 약관의 처리 흐름이다. 외부 의존성은 ports.ts 또는 공통 ports에서 정의한다. |
| `library/` | 책장 조회와 오디오 제공을 담당한다. |
| `ports/` | 유스케이스가 필요로 하는 외부 기능의 인터페이스다. 실제 구현은 adapters에서 제공한다. |
| `recording-scripts/` | 녹음 대본을 조회한다. |
| `render-worker/` | 대기 중인 렌더를 장비에 제출하고 결과 확인·정리를 진행한다. |
| `renders/` | 동화 생성 요청, 참조 준비와 결과 게시를 담당한다. 장비 실행은 render-worker, 책장 조회는 library에 있다. |
| `reports/` | 차량에서 받은 동화 신고를 저장하고 조회한다. |
| `retention/` | 삭제 대기와 고아 데이터 정리의 처리 흐름이다. 외부 의존성은 ports.ts 또는 공통 ports에서 정의한다. |
| `stories/` | 동화 목록과 제목 조회의 처리 흐름이다. 외부 의존성은 ports.ts 또는 공통 ports에서 정의한다. |
| `verification/` | 동의 낭독과 스타일 녹음의 검사·판정을 처리한다. |
| `voices/` | 목소리와 동의 관리, 녹음 업로드를 담당한다. 검사는 verification에 있다. |

# 앱에 넣은 글꼴

| 글꼴 | 만든 곳 | 라이선스 | 파일 | 출처 |
|---|---|---|---|---|
| Asta Sans (300, 400, 700, 800) | 42dot | SIL Open Font License 1.1 (OFL-1.1) | `app/src/main/res/font/asta_sans_*.ttf` | https://fonts.google.com/specimen/Asta+Sans |

300(`asta_sans_light_digits.ttf`)은 카운트다운 숫자에만 쓴다. Google Fonts의 가변 글꼴 `ofl/astasans/AstaSans[wght].ttf`에서 `fonttools varLib.instancer ... wght=300 --update-name-table`로 뽑고, `pyftsubset --text="0123456789"`로 숫자 0~9만 남겼다(2026-11-12, 2.6MB → 8KB). OFL 1.1의 수정본이며, Reserved Font Name이 없어 이름은 원본 그대로("Asta Sans Light")다. 숫자 말고 다른 글자를 이 글꼴로 그리면 시스템 글꼴로 대신 나온다.

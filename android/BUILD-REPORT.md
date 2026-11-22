# AEHA Android 1.0.1 WebView 빌드 검증

2026-11-22에 Android SDK 36과 JDK 21을 사용해 Gradle의 `assembleRelease`와 `bundleRelease`를 실행했습니다.

| 항목 | 확인 결과 |
| --- | --- |
| 미서명 AAB | `android/artifacts/aeha-1.0.1-unsigned.aab`, 137,362바이트 |
| AAB SHA-256 | `ef224e5fb893cfeaf6e0f9d6fc3aca8c0e1534ec6caf37b733bb15988e8c4271` |
| 번들 검증 | `bundletool validate` 통과, `jarsigner -verify`에서 미서명 확인 |
| 최종 manifest | `com.esaedev.aeha`, 버전 `1.0.1` / 코드 `2`, 최소 API 24 / 대상 API 36 |
| 런처와 권한 | `LauncherActivity`, 기존 런처 아이콘, 인터넷 권한 |
| 네이티브 패키징 | 패키징 검사 4개와 릴리스 빌드 통과. 최종 DEX에서 WebView, JavaScript 및 DOM 저장소 설정 호출 확인 |
| 기존 웹앱 | 단위 테스트 149개 및 TypeScript를 포함한 프로덕션 PWA 빌드 통과 |

실제 Android 기기에서의 설치·업데이트와 프로세스 종료 후 WebView 기록 복원은 추가 확인 항목입니다. 사용자 PC에서 기존 업로드 키로 서명한 뒤 Play 내부 테스트에서 확인할 수 있습니다. [서명 절차](README.md)

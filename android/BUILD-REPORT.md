# AEHA Android 검증 결과 — 2026-11-03

## 완료

- Bubblewrap CLI/core **1.27.0** 설치, 공식 `TwaGenerator`로 `android/project/` 생성.
- 공식 Android SDK 플랫폼 36 / Build Tools 36.0.0 설치. 원래 환경의 JRE에는 javac가 없어, 공식 Android Studio 배포의 **JBR/JDK 21.0.3**만 작업 디렉터리로 추출해 사용.
- Gradle **8.11.1** / Android Gradle Plugin **8.9.1**에서 **`assembleRelease bundleRelease` 성공**.
- 실제 APK 메타데이터: `com.esaedev.aeha`, `1.0.0` / versionCode `1`, minSdk **24**, targetSdk / compileSdk **36**, 이름 **AEHA**.
- 실제 APK 리소스의 시작 URL: **`https://esae-dev.github.io/A/`**, 방향 `default`.
- 기존 PNG 기반 launcher/adaptive/splash 리소스 생성. Play 목록 아이콘은 기존 불투명 정사각형 PNG와 바이트 단위로 일치.
- Android Gradle Plugin classpath의 공식 **bundletool `validate` 성공**. AAB의 base manifest와 ZIP 무결성 확인.
- APK/AAB에 **네이티브 `.so` 파일 없음**.
- APK ZIP 정렬 검사(`zipalign -c -P 16 4`) 통과.
- `apksigner verify`: **서명 없음** 확인(`DOES NOT VERIFY / Missing META-INF/MANIFEST.MF`는 미서명 산출물에서 예상되는 결과).
- `jarsigner -verify`: AAB에 **`jar is unsigned`** 확인.
- 프로젝트 생성/Release 빌드에서 **배포용 키나 Debug 키를 생성하지 않음**. Git에 키/비밀번호/서명 산출물을 포함하지 않음.
- Android 설정/DAL 테스트 **6개 통과**. Placeholder 지문 거부, Play/로컬 APK 인증서 분리, 패키지/경로/API/아이콘 확인.
- 기존 웹앱 단위 테스트 **149개 통과**, TypeScript 포함 프로덕션/PWA 빌드 통과. 웹 소스·DB 스키마·PWA 설정은 변경 없음.
- 기존 Chromium E2E **63개 통과 / 3개 조건부 건너뜀**. 건너뛴 항목은 AEHA 1.0에서 숨긴 백업·복원 UI의 조작 테스트이며 내부 단위 테스트는 계속 실행했습니다. 메뉴 숨김과 원본 DB 보존은 별도 E2E에서 통과했습니다.

## 생성한 미서명 파일

아래 `artifacts/` 파일은 다운로드/검증용 작업 산출물로 Git에서 제외합니다. **아직 설치용 또는 Google Play 제출용으로 서명된 파일이 아닙니다.**

| 파일 | 크기(byte) | SHA-256 |
| --- | ---: | --- |
| `artifacts/aeha-1.0.0-unsigned.apk` | 2,080,755 | `1eff262cbdb361b3566312f2b776e0ea50342bda02f2d2d3b59c3b9d940d506f` |
| `artifacts/aeha-1.0.0-unsigned.aab` | 2,152,697 | `75739b97065fe1d3740058f0f4b625d44ce91e5eca885a5fe69f5c74d80d8d74` |

APK의 AndroidManifest와 AAB 구조를 검사했으며, 서명된 설치본의 실제 실행을 검사한 것은 아닙니다. 빌드에는 upstream 템플릿의 Java 8 source/target 폐기 예정 경고와 SDK XML 버전 경고가 있었으나 빌드는 성공했습니다.

## 소유자 작업이 필요한 항목

- **서명된 AAB/APK 미완료:** 사용자 PC에서 업로드 키를 생성/선택하고 `npm run build:signed` 실행 필요. 실제 서명 동작은 이 환경에서 검증하지 않았습니다.
- **DAL 인증 미완료:** 실제 Play 앱 서명 인증서가 아직 없고 도메인 루트 인증 파일을 배포하지 않았습니다. `/A/.well-known/assetlinks.json`에는 배포하지 않습니다.
- 루트 저장소 `esae-dev/esae-dev.github.io` 읽기 조회는 `Repository not found`였습니다. 부재 또는 권한 부족 여부와 루트 Pages 설정은 소유자 확인이 필요합니다. A 저장소의 프로젝트 Pages만으로는 루트 `/.well-known/assetlinks.json`을 제공할 수 없습니다.
- 현재 도메인 루트 DAL URL과 Google Play 정책 문서는 환경 프록시 **403**으로 접근하지 못했습니다. 이는 원격 파일의 404/부재나 인증 성공을 뜻하지 않습니다. API 36 설정은 확인했으나 최신 제출 정책 원문 대조는 완료하지 못했습니다.
- Play Console App Signing 설정, 내부 테스트 업로드, 실제 기기 설치, TWA 전체 화면/인증, Chrome 프로필의 기존 기록 접근은 소유자 단계입니다.

정확한 PC 명령어, 인증서 구분과 Console 순서는 [README.md](README.md)를 따르세요. 원래 PWA 삭제나 Chrome 데이터 초기화는 필요하지 않습니다.

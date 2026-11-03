# AEHA 1.0 Android / Google Play 패키징

React 앱을 다시 구현하지 않고 **Bubblewrap 1.27.0의 공식 TwaGenerator**로 만든 Trusted Web Activity 프로젝트입니다. 웹 UI, IndexedDB `eha-habit` 및 v2 스키마, 숨겨진 백업 기능, 웹 manifest와 `/A/` 배포 설정은 변경하지 않습니다.

| 항목 | 값 |
| --- | --- |
| 앱/런처 이름 | AEHA |
| Application ID | `com.esaedev.aeha` |
| 시작 URL | `https://esae-dev.github.io/A/` |
| 웹 manifest / scope | `https://esae-dev.github.io/A/manifest.webmanifest` / `/A/` |
| 버전 | `1.0.0`, versionCode `1` |
| compileSdk / targetSdk / build tools | 36 / 36 / 36.0.0 |
| minSdk | 24 — Android 7.0 이상. Android Browser Helper 2.7.4의 실제 요구사항 |
| Gradle / Android Gradle Plugin | 8.11.1 / 8.9.1 |
| 화면 방향 | `default` — 기존 PWA처럼 강제로 고정하지 않음 |
| 폴백 | Custom Tabs. 별도 WebView 저장소로 전환하지 않음 |
| 아이콘 | 기존 512px 일반/마스크용 PNG. Play 목록 아이콘은 기존 불투명 정사각형 마스크용 PNG |

API 36은 이 Bubblewrap 버전의 공식 템플릿 값입니다. 2026-11-03 이 환경에서 Google Play 정책 페이지가 403으로 차단되어 **현재 제출 요건의 원문 대조는 완료하지 못했습니다**. 제출 직전에 [Google Play 대상 API 정책](https://support.google.com/googleplay/android-developer/answer/11926878)과 Play Console 경고를 확인하세요. API 설정만으로 스토어 심사 통과를 보장하지 않습니다.

## 파일과 생성 방식

- `project/`: 실제 생성된 Android Studio/Gradle 프로젝트, Java 런처와 리소스, Gradle wrapper 포함.
- `twa-manifest.json`: 공개 패키징 설정. `signingKey.path`는 **존재하지 않는 안내용 경로**이고 `fingerprints`도 비어 있습니다.
- `scripts/generate.mjs`: 공식 Bubblewrap core를 사용합니다. 배포 서버 접근/개인 키 생성 없이 체크아웃의 `dist/manifest.webmanifest`와 기존 PNG를 입력으로 사용합니다. 생성된 프로젝트의 URL은 localhost가 아닌 원래 공개 URL입니다.
- 생성 후 최소 수정: 폐지된 JCenter를 Maven Central로 교체, Build Tools 36 고정, 로컬 서명 opt-in 연결. Play 목록 이미지는 기존 마스크용 아이콘을 그대로 복사하고, adaptive 아이콘의 기본 흰 배경은 네이비로 맞춥니다.
- `signing.gradle`: 사용자 PC의 환경 변수로만 서명하며, 명시적 `--signed`가 없으면 미서명 Release 빌드입니다.
- `digital-asset-links/assetlinks.template.json`: **그대로 배포하면 안 되는** 인증 파일 예시.
- `artifacts/`: 빌드 산출물/사용자가 생성한 인증 파일. Git에 커밋하지 않습니다.

`bubblewrap init`의 대화형 키 생성 절차를 원격에서 실행하지 않습니다. 재생성은 공식 core API를 사용하며 별도 웹앱 코드를 생성하거나 수정하지 않습니다. 라이브 웹 배포가 체크아웃과 동일한지는 공개 URL에서 별도로 검증해야 합니다.

## 사용자 PC 준비 및 미서명 빌드

1. Node.js 22.12 이상, **완전한 JDK 17 또는 21**(JRE만으로는 컴파일 불가)을 설치합니다. Android Studio에 포함된 `jbr` JDK도 사용할 수 있습니다.
2. Android Studio SDK Manager에서 **Android SDK Platform 36, Build-Tools 36.0.0, Platform Tools**를 설치하고 SDK 라이선스를 확인합니다.
3. `JAVA_HOME`을 JDK 디렉터리, `ANDROID_HOME`을 SDK 디렉터리로 지정합니다. 일반적인 SDK 위치는 macOS `~/Library/Android/sdk`, Linux `~/Android/Sdk`, Windows `%LOCALAPPDATA%\Android\Sdk`입니다. 키/비밀번호를 이 경로에 넣지 않습니다.
4. 저장소 루트에서 다음을 실행합니다.

```sh
npm ci
npm test
npm run build
cd android
npm ci
npm run generate
npm test
npm run build:unsigned
```

산출물:

```text
android/artifacts/aeha-1.0.0-unsigned.apk
android/artifacts/aeha-1.0.0-unsigned.aab
```

원본 Gradle 산출물은 `project/app/build/outputs/apk/release/app-release-unsigned.apk`와 `project/app/build/outputs/bundle/release/app-release.aab`입니다. **미서명 APK는 기기에 설치할 수 없고, 미서명 AAB는 Play에 제출할 수 없습니다.** AAB 자체는 APK처럼 기기에 직접 설치하는 형식도 아닙니다.

Android Studio에서는 `android/project/`를 열 수 있습니다. 실제 서명은 아래 사용자 PC 절차로만 수행합니다. 원격 환경에서는 Debug 빌드를 통해 임시 키를 생성하지도 않습니다.

## 사용자 PC에서만: 업로드 키 생성/보관

이미 해당 앱의 업로드 키가 있다면 그것을 사용하고 새 키로 덮어쓰지 마세요. 다음 예시는 **새 업로드 키가 필요한 소유자가 자신의 PC에서만** 실행합니다. 비밀번호는 명령행 인수나 저장소 파일에 적지 않고 keytool의 대화형 프롬프트에 입력합니다.

```sh
# Bash / macOS / Linux. 저장소 바깥 경로입니다.
export AEHA_SIGNING_DIR="$HOME/aeha-private-signing"
mkdir -p "$AEHA_SIGNING_DIR"
chmod 700 "$AEHA_SIGNING_DIR"
export AEHA_UPLOAD_KEYSTORE="$AEHA_SIGNING_DIR/aeha-upload.jks"
export AEHA_UPLOAD_ALIAS=aeha-upload
keytool -genkeypair -storetype JKS -keystore "$AEHA_UPLOAD_KEYSTORE" -alias "$AEHA_UPLOAD_ALIAS" -keyalg RSA -keysize 2048 -sigalg SHA256withRSA -validity 10000
```

`.jks`는 암호화된 별도 장소에도 백업하고 비밀번호는 비밀번호 관리자에 보관하세요. 파일·비밀번호·비밀 키를 GitHub나 이 채팅에 올리지 마세요. 별칭은 키 저장소 안에서 해당 키를 선택하는 이름입니다. 인증서 SHA-256 지문은 공개 식별자이며 비공개 키가 아닙니다.

공개 업로드 인증서 확인/내보내기:

```sh
keytool -list -v -keystore "$AEHA_UPLOAD_KEYSTORE" -alias "$AEHA_UPLOAD_ALIAS"
keytool -exportcert -rfc -keystore "$AEHA_UPLOAD_KEYSTORE" -alias "$AEHA_UPLOAD_ALIAS" -file "$AEHA_SIGNING_DIR/aeha-upload-cert.pem"
```

Google Play App Signing 사용 시 역할:

| 인증서/키 | 용도 | TWA 웹 인증 |
| --- | --- | --- |
| 사용자 업로드 키 | PC에서 AAB 서명, Play가 업로더 확인 | 직접 설치한 APK도 이 키로 서명한 경우에만 추가 테스트 지문으로 사용 |
| Play 앱 서명 키 | Play가 실제 기기에 배포하는 APK의 서명. 소유자가 Console에서 App Signing을 설정하고 Google이 관리할 수 있음 | **Play 배포용 `assetlinks.json`에는 이 인증서의 SHA-256 지문이 필수** |

업로드 인증서와 앱 서명 인증서가 다를 수 있습니다. 업로드 지문만 넣고 Play 설치본의 TWA 인증이 되었다고 판단하면 안 됩니다. Play Console의 **앱 무결성(App integrity) → 앱 서명(App signing)**에서 **앱 서명 키 인증서**를 확인하세요. 키 업그레이드로 실제 배포 인증서가 여러 개라면 활성 인증서들을 모두 추가해야 합니다.

## 사용자 PC에서만: 설치 가능한 APK / 업로드 서명된 AAB

Bash에서 비밀번호를 터미널 기록에 남기지 않고 입력합니다.

```sh
read -r -s -p 'Upload keystore password: ' AEHA_UPLOAD_STORE_PASSWORD
printf '\n'
read -r -s -p 'Upload key password: ' AEHA_UPLOAD_KEY_PASSWORD
printf '\n'
export AEHA_UPLOAD_STORE_PASSWORD AEHA_UPLOAD_KEY_PASSWORD
cd /path/to/A/android
npm run build:signed
unset AEHA_UPLOAD_STORE_PASSWORD AEHA_UPLOAD_KEY_PASSWORD
```

Windows PowerShell에서는 `JAVA_HOME`, `ANDROID_HOME`, `AEHA_UPLOAD_KEYSTORE`, `AEHA_UPLOAD_ALIAS`를 `$env:...`로 지정합니다. 비밀번호 입력 예시:

```powershell
$env:AEHA_UPLOAD_STORE_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Keystore password' -AsSecureString)).Password
$env:AEHA_UPLOAD_KEY_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Key password' -AsSecureString)).Password
npm run build:signed
Remove-Item Env:AEHA_UPLOAD_STORE_PASSWORD, Env:AEHA_UPLOAD_KEY_PASSWORD
```

결과는 `artifacts/aeha-1.0.0-signed.apk`, `artifacts/aeha-1.0.0-upload-signed.aab`입니다. 이 AAB는 **업로드 키로 서명된 파일**이며, Play가 재서명한 최종 배포 APK와는 구분합니다.

```sh
# SDK Build-Tools의 실행 파일을 사용합니다.
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs artifacts/aeha-1.0.0-signed.apk
jarsigner -verify -verbose artifacts/aeha-1.0.0-upload-signed.aab
"$ANDROID_HOME/platform-tools/adb" install -r artifacts/aeha-1.0.0-signed.apk
```

Windows 도구 이름에는 `.bat` 또는 `.exe`가 붙을 수 있습니다. 아직 Digital Asset Links가 검증되지 않았다면 Chrome의 주소창이 있는 Custom Tab으로 열릴 수 있습니다. 그것을 TWA 인증 성공으로 보고하지 마세요.

## Digital Asset Links — `/A/`와 도메인 루트 구분

필수 URL은 **`https://esae-dev.github.io/.well-known/assetlinks.json`**입니다. `A/public/.well-known/assetlinks.json`을 추가해도 주소가 `/A/.well-known/...`가 되므로 인증 파일 위치가 맞지 않습니다. 이번 작업에서는 그 잘못된 경로에 파일을 추가하거나 인증 파일을 임의로 배포하지 않습니다.

기존 웹 주소를 유지하는 해결책은 **`esae-dev/esae-dev.github.io` 사용자 Pages 저장소의 루트**에서 이 파일만 제공하는 것입니다. 기존 A 저장소의 `/A/` 웹앱은 그대로 둡니다. 이 환경의 읽기 조회에서는 루트 저장소가 `Repository not found`였으므로 부재/권한 부족 중 어느 것인지는 소유자가 확인해야 합니다. 기존 루트 사이트나 Actions가 있다면 덮어쓰지 말고 인증 파일을 그 배포 산출물에 포함하세요.

Play Console에서 얻은 실제 **앱 서명 인증서** 지문으로 사용자 PC에서 생성합니다. 아래 값은 실제 지문으로 교체해야 하며, 스크립트는 안내용 문자열이나 0으로 채운 지문을 거부합니다.

```sh
cd /path/to/A/android
npm run assetlinks -- --play-sha256 'PLAY_APP_SIGNING_SHA256_HERE'
# 직접 설치 APK도 검증하려면 해당 APK의 실제 서명 지문을 추가합니다.
npm run assetlinks -- --play-sha256 'PLAY_APP_SIGNING_SHA256_HERE' --apk-sha256 'SIDELOADED_APK_CERTIFICATE_SHA256_HERE'
```

출력은 `android/artifacts/assetlinks-site/.well-known/assetlinks.json`과 `.nojekyll`입니다. **스크립트는 배포하지 않으며 지문이 Play 인증서인지까지 자동 증명하지 않습니다.** 생성 파일을 소유자가 확인한 뒤 루트 Pages 저장소의 같은 경로로 복사하고 배포하세요. `.nojekyll`은 점으로 시작하는 `.well-known` 디렉터리가 Jekyll에서 누락되지 않게 합니다. 새 루트 사이트에는 필요하면 간단한 `index.html`을 추가하되, 기존 사이트/워크플로는 유지하세요. 기존 도메인을 바꾸는 CNAME/리디렉션은 추가하지 않습니다.

루트 Pages가 아직 없다면 다음 순서로 준비합니다.

1. 소유자 계정에서 공개 저장소 `esae-dev.github.io`를 만듭니다. 이미 있다면 기존 저장소/사이트를 사용합니다.
2. 생성한 `.well-known/assetlinks.json`과 `.nojekyll`을 저장소 최상위의 같은 경로로 복사합니다. `assetlinks-site`라는 상위 폴더째 넣으면 URL이 달라집니다.
3. 루트 저장소 **Settings → Pages → Source: Deploy from a branch → main / (root)**를 선택합니다. 이미 Actions로 배포 중이라면 해당 워크플로의 산출물에 `.well-known`을 포함합니다.
4. **A 저장소의 Pages 설정은 그대로 둡니다.** 루트 배포가 끝난 뒤 아래 URL을 직접 검사합니다.

배포 후 소유자가 확인합니다.

```sh
curl -i https://esae-dev.github.io/.well-known/assetlinks.json
```

**리디렉션 없이 HTTP 200**, `application/json` 응답, `com.esaedev.aeha`, 실제 설치본의 인증서 SHA-256 일치를 확인합니다. 앱에는 웹 원점을 위임하는 `asset_statements`가 포함되고, 딥 링크는 `/A/`로 제한되어 있습니다. Android 기기에서 `adb shell pm verify-app-links --re-verify com.esaedev.aeha`와 `adb shell pm get-app-links com.esaedev.aeha`로 앱 링크를 확인할 수 있습니다. 앱 링크 검증만으로 모든 브라우저의 TWA 검증 완료를 보장하지 않으므로 실제 Chrome에서 주소창 없이 실행되는지도 확인하세요.

공식 참고: [TWA 개요](https://developer.chrome.com/docs/android/trusted-web-activity), [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started), [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).

## Google Play Console 다음 단계

1. 개발자 계정/앱 `AEHA`를 준비하고 Application ID `com.esaedev.aeha`를 확정합니다. 기존 앱에 업데이트하는 경우 같은 패키지/올바른 업로드 키가 필요합니다.
2. 사용자 PC에서 업로드 키를 준비하고 `build:signed`로 AAB를 생성합니다.
3. Console에서 Play App Signing을 설정하고 **내부 테스트** 릴리스에 업로드 서명된 AAB를 올립니다. 개발자 계정 유형·생성일에 따라 별도 비공개 테스트/제작 액세스 요건이 있을 수 있으므로 Console의 현재 요구사항을 따릅니다.
4. Play 앱 서명 인증서의 SHA-256을 가져와 도메인 루트 DAL을 배포하고 검증합니다. Play 설치본과 직접 설치 APK의 인증서를 구분합니다.
5. Play 내부 테스트 링크로 실제 설치 후 TWA 실행, 기존 Chrome/PWA 기록, 오프라인 재실행, 테마, 체크·취소·정렬·완료 기록을 확인합니다.
6. 앱 설명·스크린샷·연령 등급·콘텐츠/광고/타깃층·데이터 보안·개인정보처리방침 등 Console 필수 항목을 실제 동작에 맞게 작성하고 정책 검사/사전 출시 보고서를 확인합니다. 이 작업에서는 스토어 정보를 임의 제출하거나 정책 답변을 대신 확정하지 않습니다.
7. 심사 요건을 충족한 뒤 소유자가 제작 릴리스를 제출합니다. 후속 업로드마다 `twa-manifest.json`의 `appVersionCode`를 증가시키고 `generate` 후 다시 서명합니다.

## 기존 사용자 데이터와 실기기 확인

TWA는 APK 안에 웹앱/IndexedDB를 복사하는 방식이 아니라 브라우저에서 원래 HTTPS 주소를 엽니다. **같은 Chrome 프로필·같은 원점**을 사용하면 기존 웹 저장소를 이용하지만, 다른 브라우저·업무/개인 프로필·기기에는 별도 저장소가 있을 수 있습니다. APK 설치나 Android 앱 백업이 Chrome IndexedDB의 기기 간 복원을 보장하지 않습니다.

기존 설치형 PWA(WebAPK)와 이 TWA는 서로 다른 Android 패키지로 공존할 수 있습니다. 데이터 확인을 위해 원래 PWA를 삭제/재설치하거나 Chrome 사이트 데이터를 초기화하지 마세요. 패키징은 숨겨진 JSON 백업 UI를 다시 켜지 않으며 로그인/동기화도 추가하지 않습니다.

실기기에서 확인할 항목: DAL 인증과 주소창 미표시, Play App Signing 인증서, 첫 온라인 실행과 후속 오프라인 실행, 원래 Chrome 기록 접근, 새/기존 루틴 체크·취소·정렬·보관·삭제, 라이트/다크, 회전/태블릿, 시스템 내비게이션 영역. 원격 미서명 빌드만으로 이 항목들이 완료되었다고 판단하지 않습니다.

# AEHA Android

AEHA 1.0.1은 Android 시스템 WebView에서 `https://esae-dev.github.io/A/`를 직접 엽니다. 첫 실행에는 네트워크 연결과 사용 가능한 Android System WebView 제공자가 필요합니다. 후속 실행에서는 기존 웹앱의 서비스 워커와 캐시가 준비된 범위에서 오프라인으로 이용할 수 있습니다.

| Play 업데이트 항목 | 값 |
| --- | --- |
| 앱 이름 / Application ID | AEHA / `com.esaedev.aeha` |
| versionName / versionCode | `1.0.1` / `2` |
| 최소 / 대상 Android API | 24 / 36 |
| 시작 주소 | `https://esae-dev.github.io/A/` |

WebView는 앱 전용 저장 공간에 루틴과 설정을 보관합니다. 이전 TWA나 Chrome PWA에서 쌓은 기록은 원래 Chrome 프로필에 남습니다. WebView의 첫 실행에서는 별도의 기록이 시작되며, 같은 앱의 후속 실행은 이 WebView 저장 공간을 계속 사용합니다.

## 미서명 빌드

완전한 JDK 17 또는 21과 Android SDK Platform 36, Build Tools 36.0.0을 설치하고 `JAVA_HOME`과 `ANDROID_HOME`을 설정합니다. 저장소 루트에서 다음 명령을 실행합니다.

```sh
cd android
npm test
npm run build:unsigned
```

출력 파일은 `android/artifacts/aeha-1.0.1-unsigned.aab`와 `android/artifacts/aeha-1.0.1-unsigned.apk`입니다. Android Studio에서는 `android/project`를 엽니다. 웹 콘텐츠는 기존 Pages에서 제공하며, Android 패키지만 다시 빌드할 수 있습니다.

## 내려받은 AAB에 기존 업로드 키로 서명하기

사용자 PC에서 **기존** `aeha-upload.jks`의 경로와 실제 키 별칭을 사용합니다. 아래 예시의 별칭은 `aeha-upload`입니다. 비밀번호는 JDK 도구의 프롬프트에 입력합니다.

```sh
jarsigner -keystore "/path/to/aeha-upload.jks" -signedjar aeha-1.0.1-upload-signed.aab aeha-1.0.1-unsigned.aab aeha-upload
jarsigner -verify -verbose -certs aeha-1.0.1-upload-signed.aab
keytool -printcert -jarfile aeha-1.0.1-upload-signed.aab
```

`jar verified.`와 출력된 SHA-256 지문을 확인합니다. 지문이 Play Console의 **업로드 키 인증서**와 일치하면 기존 AEHA 앱의 내부 테스트 릴리스에 `aeha-1.0.1-upload-signed.aab`를 업로드합니다. Play가 배포용 앱 서명을 적용합니다. 이 빌드는 이전 versionCode 1을 업데이트하도록 만들었습니다. 같은 앱에서 이미 versionCode 2 이상을 사용했다면 다음 업로드에 더 큰 번호가 필요합니다.

소스에서 직접 서명 빌드할 때는 기존 `npm run build:signed`도 사용할 수 있습니다. 사용자 PC에서 `AEHA_UPLOAD_KEYSTORE`(저장소 밖 절대 경로), `AEHA_UPLOAD_ALIAS`, `AEHA_UPLOAD_STORE_PASSWORD`, `AEHA_UPLOAD_KEY_PASSWORD`를 해당 프로세스에만 제공하세요.

# Mac 앱

웹앱을 Electron으로 감싼 데스크톱 앱. 콘텐츠·폰트가 모두 포함되어 오프라인에서도 동작한다.

## 설치 파일 받기 (권장)
1. GitHub 레포 → Actions → **mac-build** → Run workflow
2. 완료 후 Artifacts의 `social-atlas-mac`을 내려받는다
3. `.dmg`를 열고 Social Atlas를 Applications로 끌어 넣는다
4. 처음 실행할 때는 앱을 우클릭 → 열기 (Apple 개발자 인증서 서명 전이라 한 번 확인창이 뜬다)

## 직접 빌드 (Mac에서)
```bash
npm install
npm run mac:build     # release/ 에 dmg, zip 생성 (Apple Silicon·Intel)
```

## Linux에서 만든 zip을 쓰는 경우
서명이 없는 상태라 Apple Silicon Mac에서는 "손상됨" 메시지가 뜬다. 터미널에서 한 번 실행하면 열린다.
```bash
xattr -cr "/Applications/Social Atlas.app"
codesign --force --deep -s - "/Applications/Social Atlas.app"
```

## 배포용 서명
학교·외부 배포 시에는 Apple Developer ID 서명과 공증(notarization)이 필요하다.
인증서를 GitHub Secrets(`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID` 등)에 넣고 `mac.identity` 설정을 바꾸면 같은 워크플로로 처리된다.

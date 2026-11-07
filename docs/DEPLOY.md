# 배포 — GitHub → Vercel

Vite 정적 앱 + `api/` 폴더의 Vercel 함수(쏘 서버)로 구성된다. 추가 프레임워크 없이 그대로 배포된다.

## 1. 처음 한 번
1. 레포를 GitHub에 푸시한다.
2. 아래 링크로 Vercel에 가져온다(로그인 → GitHub 연결 → Import).
   **https://vercel.com/new/import?s=https://github.com/start7811dev-hub/middle_social**
   Framework는 Vite로 자동 인식된다(`vercel.json`에도 지정). Build·Output 설정은 바꾸지 않는다.
3. Settings → Environment Variables
   | 이름 | 값 | 비고 |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Claude API 키 | 필수. 서버 함수에서만 쓰이고 브라우저로 내려가지 않는다 |
   | `SSO_ACCESS_CODE` | 예: `class-2026` | 권장. 정하면 이 코드를 설정에 넣은 기기만 쏘와 대화할 수 있다 |
   | `SSO_MODEL` | `claude-sonnet-5-5` | 선택. 본 응답 모델 |
   | `SSO_GUARD_MODEL` | `claude-haiku-5-5` | 선택. 주제 분류 모델 |
   | `SSO_RATE_PER_10MIN` | `20` | 선택. 기기(IP)당 10분 요청 한도 |
4. Deploy. 빌드 과정에서 콘텐츠 검증 → 안전 테스트(190개) → 타입 검사 → 빌드가 차례로 돈다. 하나라도 실패하면 배포되지 않는다.

## 2. 확인
- `https://<주소>/api/sso` 를 열면 `{"ok":true,"ai":true,...}` 가 보여야 한다.
- 앱 → 정보(설정)에서 '연결 상태'가 "Claude 연결됨 (쏘 서버)"인지 본다.
- 실제 Claude로 안전 시험: `SSO_RATE_PER_10MIN=100` 을 잠시 설정하고
  ```
  npm run redteam -- https://<주소> <접근코드>
  ```
  38개 질문(학습·학습 외·민감·규칙 변경 시도·개인정보·위기·위조된 기록)이 기대대로 처리되는지 확인한다. 끝나면 한도를 되돌린다.

## 3. iPad에서 앱처럼 쓰기 (홈 화면 웹앱)
1. iPad Safari로 Vercel 주소를 연다.
2. 주소창 오른쪽 공유 버튼 → **홈 화면에 추가** → 이름 '쏘 사회' 확인 → 추가.
3. 홈 화면의 '쏘 사회' 아이콘으로 열면 주소창 없이 전체 화면 앱으로 뜬다.
- 한 번 연 학습 화면과 콘텐츠는 오프라인에서도 열린다(서비스 워커 캐시). 쏘와의 대화는 인터넷이 필요하다.
- 마이크(말로 대답하기)는 처음 누를 때 권한을 묻는다. iPadOS 버전에 따라 홈 화면 앱에서 음성 인식이 제한될 수 있는데, 그때는 Safari 탭에서 열거나 글자로 대답하면 된다. 쏘 목소리(읽어 주기)는 그대로 동작한다.
- 설정에서 접근 코드를 한 번 넣으면 그 iPad에 기억된다.

## 4. Mac 앱에서 쏘 서버 쓰기
- 앱 → 정보(설정) → '쏘 서버 주소'에 Vercel 주소를 넣는다. 접근 코드를 정했다면 함께 넣는다.
- 또는 빌드할 때 `VITE_SSO_SERVER=https://<주소> npm run mac:build`.
- Mac 앱(Electron)은 음성 인식이 지원되지 않아 대답은 글자로 하고, 쏘 목소리(음성 합성)는 동작한다. 말로 대답하기는 Safari·Chrome 웹 버전에서 쓴다.

## 5. 로컬 개발
```
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
npm install
npm run dev                  # http://localhost:5173 — /api/sso 도 같이 동작
npm test                     # 안전 가드·서버 테스트
```

## 6. 비용 감각
- 질문 1회 = 분류(Haiku, 출력 20토큰 이하) + 본 응답(Sonnet, 출력 450토큰 이하). 위기·민감 표현처럼 키워드에서 걸리는 질문은 모델을 부르지 않는다.
- 과금 상한은 Anthropic Console의 Workspace 사용 한도(spend limit)로 걸어 두는 것을 권한다.
- 요청 한도는 인스턴스 메모리 기준이라 여러 인스턴스에서는 느슨하다. 학교 단위로 운영하면 Vercel KV(Upstash) 기반 한도로 바꾼다.

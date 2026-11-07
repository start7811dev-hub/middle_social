# Social Atlas — 중학 사회 3D 학습 프로그램 + 학습 에이전트 쏘

2022 개정 교육과정 중학교 사회(사회①·사회②) 24개 단원을 3D 지구본과 인터랙티브 랩으로 학습하는 Mac·iPad용 앱.

## 실행
```bash
npm install
npm run dev          # 웹 개발 서버 (iPad는 같은 네트워크에서 접속)
npm run build        # 콘텐츠 검증 + 웹 빌드 → dist/
npm run mac:dev      # Mac 앱으로 실행 (Electron)
npm run mac:build    # Mac 설치 파일 → release/*.dmg, *.zip  (macOS에서 실행)
npm test             # 안전 가드·서버 테스트
npm run redteam -- https://<배포주소>   # 실제 Claude로 안전 시험
```

## 구성
| 경로 | 내용 |
|---|---|
| `public/content/` | 학습 콘텐츠(JSON). 단원 1개 = 파일 1개 |
| `schema/unit.schema.json` | 콘텐츠 스키마. `npm run validate`로 검증 |
| `src/labs/` | 3D·인터랙티브 랩. `registry.tsx`에 등록 |
| `src/styles/tokens.css` | 디자인 토큰 (컬러·타입·간격·그림자) |
| `electron/` | Mac 앱 래퍼 |
| `api/sso.ts` | Vercel 함수 — 쏘 대화 서버 (Claude API) |
| `shared/` | 서버·브라우저 공용 안전 가드와 대화 파이프라인 |
| `src/sso/` | 쏘 캐릭터·에이전트·말로 공부하기·음성 |
| `docs/` | 스타일 정의, 콘텐츠 추가 가이드, 교육과정 대조표, Mac 앱 안내 |

## 현재 상태 (v0.1)
- 구조: 24단원 · 70학습(성취기준 단위) · 성취기준 원문 46/70 대조 완료
- 동작하는 랩: 헥스 도트 지구본(지역 하이라이트·네트워크 아크), 수요·공급 시뮬레이션
- 학습 기능: 예측 게이트, 확신도 베팅, 간격 반복 복습, 현장 미션, 오답 노트, 스크랩, 주석, 사진 첨부 (기기 내 저장)
- 학습 콘텐츠: 70개 학습 전부 — 본문 210섹션, 핵심 개념 339개, 예측 질문 70개, 복습 문제 350개, 현장 미션 70개
- 검수: 단원별 독립 검수 1회 완료(정답 인덱스 전수 확인, 사실 오류 수정). 교사·전공자 검수는 아직
- 3D 랩: 2종 동작, 약 12종 제작 예정
- **쏘**: 3D 학습 에이전트(화이트 기본 + 4색). 학습 사건에 반응해 참견하고, 누르면 대화(Claude API). 말로 공부하기(음성 입출력·튜터 모드), 반말 말투
- **능동 읽기**: 섹션 하나씩 열기, 빈칸 확인(자동 생성), 개념어 팝오버, 듣기, 쏘에게 설명하기
- **안전**: 사전 필터 → 주제 분류 → 본 응답 → 출력 검사, 위기 시 도움 안내. 테스트 190개 + 실서버 레드팀 38개 (독립 검토 반영)

문서: [배포](docs/DEPLOY.md) · [쏘 안전 설계](docs/SAFETY.md) · [스타일](docs/STYLE.md) · [콘텐츠 추가](docs/CONTENT_GUIDE.md) · [교육과정 대조](docs/CURRICULUM_CHECK.md) · [Mac 앱](docs/MAC_APP.md) · [학습 방법론](docs/LEARNING_METHOD.md) · [역사 편집 원칙](docs/EDITORIAL_HISTORY.md)

# Social Atlas — 중학 사회 3D 학습 프로그램

2022 개정 교육과정 중학교 사회(사회①·사회②) 24개 단원을 3D 지구본과 인터랙티브 랩으로 학습하는 Mac·iPad용 앱.

## 실행
```bash
npm install
npm run dev          # 웹 개발 서버 (iPad는 같은 네트워크에서 접속)
npm run build        # 콘텐츠 검증 + 웹 빌드 → dist/
npm run mac:dev      # Mac 앱으로 실행 (Electron)
npm run mac:build    # Mac 설치 파일 → release/*.dmg, *.zip  (macOS에서 실행)
```

## 구성
| 경로 | 내용 |
|---|---|
| `public/content/` | 학습 콘텐츠(JSON). 단원 1개 = 파일 1개 |
| `schema/unit.schema.json` | 콘텐츠 스키마. `npm run validate`로 검증 |
| `src/labs/` | 3D·인터랙티브 랩. `registry.tsx`에 등록 |
| `src/styles/tokens.css` | 디자인 토큰 (컬러·타입·간격·그림자) |
| `electron/` | Mac 앱 래퍼 |
| `docs/` | 스타일 정의, 콘텐츠 추가 가이드, 교육과정 대조표, Mac 앱 안내 |

## 현재 상태 (v0.1)
- 구조: 24단원 · 70학습(성취기준 단위) · 성취기준 원문 46/70 대조 완료
- 동작하는 랩: 헥스 도트 지구본(지역 하이라이트·네트워크 아크), 수요·공급 시뮬레이션
- 학습 기능: 복습 문제 → 오답 노트 자동 저장, 스크랩, 주석, 사진 첨부 (기기 내 저장)
- 개념·문제가 채워진 학습은 4개. 나머지 66개 학습은 콘텐츠 제작 필요

문서: [스타일](docs/STYLE.md) · [콘텐츠 추가](docs/CONTENT_GUIDE.md) · [교육과정 대조](docs/CURRICULUM_CHECK.md) · [Mac 앱](docs/MAC_APP.md) · [학습 방법론](docs/LEARNING_METHOD.md) · [역사 편집 원칙](docs/EDITORIAL_HISTORY.md)

# 콘텐츠 추가·업데이트 가이드

코드를 건드리지 않고 JSON만으로 학습 내용을 추가·수정할 수 있다.

## 구조
```
public/content/
  manifest.json          교과서(사회①·②)와 단원 목록, 콘텐츠 버전
  units/s1-g02.json      단원 1개 = 파일 1개
```
- 단원 id: `s{교과서}-{g|s}{번호}` (예: `s1-g02` 사회① 지리 02, `s2-s09` 사회② 일반사회 09)
- 학습(lesson) id: `{단원id}-{순번}` — 성취기준 1개 = 학습 1개

## 학습 하나의 형태
```json
{
  "id": "s2-s09-2",
  "title": "수요·공급과 가격 결정",
  "standard": { "code": "9사(일사)09-02", "text": "성취기준 원문", "verified": true },
  "lab": { "type": "supply-demand", "params": { "mode": "equilibrium" } },
  "media": [{ "type": "image", "src": "https://.../market.jpg", "caption": "전통 시장", "credit": "출처" }],
  "concepts": [{ "term": "균형 가격", "desc": "수요량과 공급량이 같아지는 가격." }],
  "quiz": [{ "id": "q1", "q": "지문", "choices": ["①", "②", "③", "④"], "answer": 1, "explain": "해설" }]
}
```
- `answer`는 0부터 센다.
- `lab.type`: `globe`, `supply-demand`, `planned`(제작 예정 자리 표시).
- 성취기준 원문을 교육부 고시와 대조했으면 `verified: true`.

## 검증
```bash
npm run validate
```
스키마, id 중복, 정답 인덱스, 등록되지 않은 랩 타입을 검사한다. PR마다 GitHub Actions에서 자동 실행된다(`.github/workflows/validate-content.yml`).

## 외부 소스로 업데이트 (앱 재배포 없이)
`VITE_CONTENT_SOURCES`에 콘텐츠 소스 URL을 쉼표로 나열한다.
```
VITE_CONTENT_SOURCES=./content,https://<호스트>/content-pack
```
- 각 소스는 같은 구조(`manifest.json` + `units/*.json`)를 가진다.
- 뒤에 오는 소스가 우선한다. 같은 단원 id는 필드를 덮어쓰고, lessons는 lesson id 기준으로 교체하거나 추가한다.
- 그래서 외부 팩에는 바꾸거나 추가할 학습만 넣으면 된다.
- 소스 후보: 별도 GitHub 레포의 raw URL, Supabase Storage 공개 버킷, CMS의 JSON 내보내기.
- CORS 허용이 필요하다(GitHub raw·Supabase Storage는 기본 허용).

## 3D 랩 추가
1. `src/labs/`에 컴포넌트 작성 (`params`, `accent`를 props로 받음)
2. `src/labs/registry.tsx`의 `LABS`에 타입 이름으로 등록
3. `scripts/validate-content.mjs`의 `KNOWN_LABS`에 추가
4. 콘텐츠 JSON에서 `lab.type`을 새 이름으로 지정

## 사용자 데이터
오답 노트, 스크랩, 주석, 사진, 진도는 기기 내 IndexedDB에 저장된다(`src/data/userStore.ts`).
계정 동기화가 필요하면 같은 `UserStore` 인터페이스로 Supabase 구현을 만들어 `UserProvider`에 넘기면 된다.

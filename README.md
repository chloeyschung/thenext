# 어디서 만날까? (thenext)

여러 사람의 출발지와 이동수단을 모아, **가장 공평한 만남 장소**를 찾아주는 서비스.

방장이 링크를 만들어 공유하면 참여자들이 로그인 없이 각자 출발지와 이동수단(대중교통/자동차)을
입력하고, 전원의 실제 소요시간을 계산해 추천 장소 3곳을 지도에서 보여준다.

## 동작 방식

1. 참여자 좌표의 중심점을 구한다
2. 중심점 주변 지하철역을 후보로 최대 5곳 뽑는다 (역이 없으면 번화가 → 중심점 순으로 폴백)
3. 참여자 × 후보마다 실제 소요시간을 조회한다 — 자동차는 카카오모빌리티, 대중교통은 ODsay
4. **가장 오래 걸리는 사람의 시간이 짧은 순서(minimax)** 로 정렬해 상위 3곳을 보여준다

## 시작하기

### 1. API 키 발급

| 키 | 발급처 | 용도 |
| --- | --- | --- |
| `KAKAO_REST_API_KEY` | [카카오 개발자센터](https://developers.kakao.com) > 내 애플리케이션 > 앱 키 | 장소 검색, 자동차 길찾기 (서버 전용) |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 같은 곳의 JavaScript 키 | 브라우저 지도 렌더링 |
| `ODSAY_API_KEY` | [ODsay LAB](https://lab.odsay.com) | 대중교통 길찾기 (카카오는 미지원) |
| `POSTGRES_URL` | [Neon](https://neon.tech) (Vercel Marketplace 연동 또는 직접 가입) | 방/참여자 저장 |

> `@vercel/postgres` 드라이버는 Neon 계열 연결 문자열만 받는다. 일반 로컬 Postgres 를 쓰려면
> 드라이버를 `drizzle-orm/node-postgres` 로 바꿔야 하므로, 로컬에서도 Neon 개발용 DB를 그대로 쓰는 편이 간단하다.

카카오는 **플랫폼 > Web** 에 `http://localhost:3000` (및 배포 도메인)을 등록해야 지도가 뜬다.
카카오모빌리티 길찾기는 개발자센터에서 별도로 활성화가 필요할 수 있다.

### 2. 실행

```bash
cp .env.local.example .env.local   # 발급받은 키 채우기
npm install
npx drizzle-kit push               # 테이블 생성
npm run dev
```

## 구조

```
src/
  app/
    page.tsx                     방 만들기
    room/[slug]/                 방장 화면 / join / results
    api/                         방·참여자·결과·장소검색 라우트
  components/                    지도, 주소 검색, 폼 등 UI
  lib/
    db/                          drizzle 스키마 + 쿼리
    kakao/                       장소 검색(local), 자동차 길찾기(mobility)
    odsay/                       대중교통 길찾기
    midpoint/                    후보 생성 → 소요시간 조회 → 랭킹
```

## 현재 범위와 한계

- 링크를 아는 사람은 누구나 참여·조회 가능 (인증 없음)
- 참여자 기호(음식 취향 등)와 1차/2차/액티비티 코스 추천은 **미구현** — 다음 단계
- 후보를 지하철역 중심으로 뽑기 때문에 역세권이 아닌 지역에서는 추천 품질이 떨어진다
- 길찾기 조회에 실패하면 직선거리 기반 추정치로 대체하고 결과에 "추정"으로 표시한다

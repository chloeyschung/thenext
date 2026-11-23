# 어디서 만날까? (thenext)

여러 사람의 출발지·귀가지와 방향별 이동수단을 모아, **왕복 부담이 공평한 만남 장소**를 찾아주는 서비스.

방장이 링크를 만들어 공유하면 로그인 없이 출발지와 귀가지, 갈 때·돌아올 때 이동수단(대중교통/자동차)을
입력한다. 귀가지는 출발지, 귀가 수단은 출발 수단이 기본이며 각각 바꿀 수 있다.
경로 조회 또는 명시된 추정치로 왕복 시간을 비교해 후보 3곳을 보여준다.

## 동작 방식

1. 전원의 출발지와 귀가지 좌표를 함께 반영한 중심점을 구한다
2. 중심점 주변 지하철역을 후보로 최대 5곳 뽑는다 (역이 없으면 번화가 → 중심점 순으로 폴백)
3. 참여자 × 후보마다 **출발지 → 후보**, **후보 → 귀가지**를 각 방향의 수단으로 따로 조회한다. 역방향 복사/대칭 가정은 하지 않는다. 자동차는 카카오모빌리티, 대중교통은 기본 TMAP (ODsay 전환 가능)
4. **개인별 왕복 합계의 최댓값이 작은 순서(minimax)**, 동점이면 전원의 왕복 합이 작은 순서로 상위 3곳을 보여준다

실제 출발시각/모임 종료시각을 입력받거나 예측하지 않는다. 시간표·막차·미래 귀가시각 도착 보장을 제공하지 않는다.
후보 생성은 제한된 주변 검색이므로 전체 지역에서의 전역 최적해를 보장하지 않는다.

### 기존 DB에 귀가 필드 추가

기존 참여자/보호 테이블을 삭제하거나 backfill하지 않는다. 먼저 DB를 확인하고 아래의 **nullable 컬럼 4개 추가만** 실행한다.

```bash
ALLOW_HOMEWARD_SCHEMA=1 node --env-file=.env.local scripts/install-homeward.mjs
```

`home_address_label`, `home_lat`, `home_lng`, `return_transport_mode`가 NULL인 기존 행은
조회 시 출발지/출발 수단으로 해석한다. 이전 POST 형식도 같은 기본값으로 받는다.
명시적인 귀가지는 주소와 위도/경도를 모두 보내야 하며 출발지와 같은 좌표 범위를 검증한다.
결과 ETA의 `minutes`는 이제 왕복 합계이며 `outbound`/`homeward`에 각 구간의 분·수단·추정 여부·사유가 있다.

## 시작하기

### 1. API 키 발급

| 키 | 발급처 | 용도 |
| --- | --- | --- |
| `KAKAO_REST_API_KEY` | [카카오 개발자센터](https://developers.kakao.com) > 내 애플리케이션 > 앱 키 | 장소 검색, 자동차 길찾기 (서버 전용) |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 같은 곳의 JavaScript 키 | 브라우저 지도 렌더링 |
| `TMAP_APP_KEY` | TMAP 대중교통 요약정보 API 앱 키 | 기본 대중교통 길찾기 (서버 전용) |
| `ODSAY_API_KEY` | [ODsay LAB](https://lab.odsay.com) | `TRANSIT_PROVIDER=odsay` 선택 시에만 필요 |
| `POSTGRES_URL` | [Neon](https://neon.tech) (Vercel Marketplace 연동 또는 직접 가입) | 방/참여자 저장 |

> `@vercel/postgres` 드라이버는 Neon 계열 연결 문자열만 받는다. 일반 로컬 Postgres 를 쓰려면
> 드라이버를 `drizzle-orm/node-postgres` 로 바꿔야 하므로, 로컬에서도 Neon 개발용 DB를 그대로 쓰는 편이 간단하다.

카카오는 **플랫폼 > Web** 에 `http://localhost:3000` (및 배포 도메인)을 등록해야 지도가 뜬다.
카카오모빌리티 길찾기는 개발자센터에서 별도로 활성화가 필요할 수 있다.

### 2. 실행

```bash
touch .env.local                  # 기존 파일/키를 덮어쓰지 않고 필요한 변수만 편집
npm install
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs push
# .env.local을 명시적으로 로드. 변경 SQL 확인 후 승인하며, 기존 데이터 삭제 제안은 승인하지 않는다.
npm run dev
```

### 대중교통 제공자 선택

`.env.local`의 기존 자격증명은 유지하고 필요한 변수만 추가/변경한다. 서버 재시작 후 적용된다.

```dotenv
# 생략하거나 비우면 기본값 tmap. 명시해도 동일하다.
TRANSIT_PROVIDER=tmap
# 비어 있는 경우에만 실제 앱 키를 로컬에서 입력한다. 기존 값을 지우지 않는다.
# TMAP_APP_KEY=
```

ODsay로 돌아가려면 `TRANSIT_PROVIDER=odsay`로 바꾸고 `ODSAY_API_KEY`를 설정한다.
정확히 `odsay`일 때만 ODsay를 호출하며, 그 외 값은 TMAP을 사용한다.
`src/lib/odsay/transit.ts`는 원본 그대로 보존한다. 제공자 간 자동 재시도/전환은 하지 않는다.

- 공통 진입점은 서버 전용 `src/lib/transit.ts`; `midpoint/compute.ts`가 이를 사용한다.
- TMAP은 `POST https://apis.openapi.sk.com/transit/routes/sub`, `appKey` 헤더,
  문자열 WGS84 경도/위도(`startX/startY/endX/endY`), `format: "json"`, `count: 1`을 보낸다.
- `metaData.plan.itineraries[0].totalTime`(초)을 반올림한 분으로 변환한다.
- TMAP 요청은 8초 제한이며 키 누락, HTTP/네트워크/JSON 오류, 경로 없음,
  유효하지 않은 소요시간(숫자가 아님·무한대·0 이하)은 `null`을 반환한다.
  기존 추천 로직은 이를 직선거리 기반 시간과 `estimated: true`로 표시한다.
  키·원본 예외·응답 본문은 기록하지 않는다.
- `count: 1`은 응답 경로 개수일 뿐, 추천 전체의 호출 횟수 제한이 아니다.
  캐시가 없는 계산의 상한은 **2 × 참여자 수 × 후보 수(최대 5)**이며, 대중교통인 leg마다 조회를 시도하지만,
  아래 DB 기반 rolling 예산이 실제 TMAP 요청 전에 각 호출을 예약/차단한다.
  왕복 추가로 예산을 늘리지는 않는다. 10명·5후보는 최대 100 leg, 동시 길찾기는 5개로 유지한다.

공식 규격: [요약정보 API](https://transit.tmapmobility.com/docs/routes/sub),
[인증 헤더/이용절차](https://transit.tmapmobility.com/guide/procedure).

### 검증

설치된 Node.js 26에서 별도 테스트 패키지 없이 내장 테스트 러너와 TS 지원을 사용한다.
`react-server` 조건은 Node에서 `server-only` 모듈을 실행하기 위한 것이며 앱 빌드 설정은 바꾸지 않는다.

```bash
npm test                         # 오프라인 테스트; 실제 API/DB 호출 없음
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm run build
```

테스트 범위: TMAP 요청/초→분 변환, 제공자 선택 및 ODsay 기존 계약,
오류/잘못된 응답/시간 제한, 추천 파이프라인의 실측/추정 표시·자동차 분기·minimax 정렬.

실제 키를 로드해 강남→홍대 구간을 **1회만** 호출하는 수동 점검:

```bash
ALLOW_TMAP_PROBE=1 npm run probe:tmap
```

명시적 허용 없이는 호출하지 않는다. 출력은 요청 수·HTTP 상태·분 단위 시간만 포함한다.
현재 어댑터로 1회 호출해 `requests: 1`, `status: 200`, `minutes: 41`을 확인했다.
무료 할당량을 사용하므로 자동 테스트/빌드에는 포함하지 않는다.
이 제공자 변경 당시에는 DB 테이블과 전체 브라우저 플로우를 검증하지 않았다.
이후 **2026-11-23** 연결된 Neon DB에 `rooms`/`participants`를 생성하고,
실제 브라우저에서 방 생성 → 서로 다른 출발지 3명(대중교통 1명·자동차 2명) 입력 →
실제 소요시간 추천 3곳 → 카카오 지도/참여자 마커 3개·후보 표시 3개까지 검증했다.
이번 E2E의 TMAP 요청은 5회 모두 HTTP 200, 자동차 요청은 10회 모두 HTTP 200이었고,
화면의 9개 소요시간에 추정 폴백은 없었다. 검증 중에만 별도 실행 래퍼로 TMAP을 최대 5회 제한했다.
이후 앱 자체의 DB 기반 캐시/할당량 차단을 추가했다(아래 절). 위 호출량은 보호 추가 전의 E2E 기록이다.
상세 범위와 증거는 [로컬 E2E 검증 기록](docs/verification-2026-11-23.md)을 참고한다.

## DB 기반 호출량 보호 (2026-11-23)

- 결과 API와 서버 페이지 모두 같은 **10분 결과 캐시 / 방별 180초 lease**를 사용한다.
  참여자 ID·이름·출발지/귀가지 주소·정확한 좌표·각 방향 이동수단·제공자 지문이 바뀌면 재사용하지 않는다.
  왕복 버전 지문으로 이전 편도 캐시를 재사용하지 않는다. 각 leg의 추정 사유와 합계 추정 여부도 캐시한다.
  동시 계산은 대기 폴링 없이 409/안내를 반환하고 오래된 owner는 캐시 게시/잠금 해제를 못 한다.
- **TMAP 요약정보만 rolling 24시간 8회**. Neon에서 요청별 원자 예약하며 실패/타임아웃도 소진한다.
  키 누락·한도 거절은 fetch하지 않고, DB 확인 실패도 차단한다. 추정치/한도 안내는 캐시에서도 유지한다.
- 이전 호출의 정확한 잔량을 모르므로 최초 운영 예산은 8회 전부 소진으로 설치했다.
  **2026-11-24 10:46:14.377 KST** 전에는 이 앱의 TMAP 호출을 막는다. 제공자의 자정 reset을 가정하지 않는다.
- 무료 10건/일은 공식 사이트/약관으로 재확인했고, 10분 캐시는 24시간 이상 데이터 사용 금지보다 짧다.
  ODsay/카카오 전체 계정의 별도 일일 예산은 없고 결과 캐시/방별 중복 방지만 적용한다.
  ODsay 원본의 네트워크 타임아웃 한계는 그대로다.
- 추가 테이블 설치(기존 행/예산 보존):
  `ALLOW_PROTECTION_SCHEMA=1 node --env-file=.env.local scripts/install-protections.mjs`

설정값·재현 명령·공식 출처·보장 범위 및 Neon 통합 검증은
[호출량 보호 문서](docs/protections-2026-11-23.md), 실제 출력은
`docs/protection-verification.txt`를 참고한다. 운영 예산 행을 삭제/초기화하지 않는다.

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
    tmap/                        기본 대중교통 요약 길찾기
    odsay/                       보존된 대중교통 길찾기 (선택 가능)
    transit.ts                   제공자 선택 공통 진입점
    midpoint/                    후보 생성 → 소요시간 조회 → 랭킹
```

## 현재 범위와 한계

- 링크를 아는 사람은 누구나 참여·조회 가능 (인증 없음)
- 참여자 기호(음식 취향 등)와 1차/2차/액티비티 코스 추천은 **미구현** — 다음 단계
- 후보를 지하철역 중심으로 뽑기 때문에 역세권이 아닌 지역에서는 추천 품질이 떨어진다
- 길찾기 조회에 실패하면 직선거리 기반 추정치로 대체하고 결과에 "추정"으로 표시한다

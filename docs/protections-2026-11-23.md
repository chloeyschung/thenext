# DB 기반 호출량 보호 — 2026-11-23

이 문서는 이전 E2E/README/HANDOFF의 **캐시·영구 차단 없음** 기록보다 우선한다. 배포·유료 전환·실제 TMAP 재호출은 하지 않았다.

## 동작과 설정

- 공통 진입점 `src/lib/protections/results.ts`를 결과 API와 서버 결과 페이지 양쪽에서 사용한다. 후보 검색·자동차·대중교통 전체 계산을 한 번만 감싼다.
- **10분 결과 캐시**: 방 ID + SHA-256 지문. 알고리즘 버전, 제공자, 참여자 ID·이름·주소표현·정확한 위경도·이동수단 모두 포함. 입력 순서는 정규화한다. 참여자가 바뀌면 이전 지문 결과를 재사용하지 않는다. 계산 도중 추가된 참여자는 다음 조회에 반영한다.
- 추정치를 캐시할 때도 `estimated: true`와 `estimateReason: quota | protection-unavailable`를 그대로 저장한다. API의 한국어 message 및 페이지의 한도/추정 안내도 캐시에서 유지한다. 원본 TMAP 응답/경로는 저장하지 않는다. 만료된 결과는 절대 반환하지 않으며 만료 데이터가 물리적으로 즉시 삭제되는 주기 작업은 없다.
- **TMAP 요약정보만 rolling 24시간 최대 8회 예약**. 모든 방·프로세스·배포가 같은 Neon의 `tmap:summary` 행을 공유한다. 키가 바뀌어도 예산을 새로 만들지 않는다. DB 행 잠금을 사용하는 조건부 UPDATE가 요청 직전 1슬롯을 예약한다. 실패·타임아웃·잘못된 응답·예약 후 프로세스 종료도 환불하지 않는다. 키 누락은 예약/요청 0회. 예약 조회 실패는 fail-closed, fetch 0회.
- 설정값은 고정된 안전 기본값이다: 캐시 600초, lease 180초, TMAP cap 8. `store.ts`의 SQL과 상수에 함께 명시했으며 환경변수로 상한을 올리는 우회 경로는 없다. 기존 `.env.local`과 `TRANSIT_PROVIDER=odsay` 전환 방법은 그대로다.
- **방별 180초 lease + 임의 owner 토큰**. 다른 지문도 같은 방이면 동시에 계산하지 않는다. 동시 요청은 기다리며 폴링하지 않고 API 409/Retry-After 5초 또는 페이지 안내를 즉시 반환한다. DB/계산 장애는 API 503/안내. lease 만료 후 재획득 가능하며 오래된 owner는 새 owner의 잠금을 해제하거나 캐시를 게시하지 못한다.
- 기본 TMAP 및 카카오 후보/자동차 fetch는 8초 제한·redirect 차단, 매 outbound 직전에 DB owner와 lease 여유 10초를 검사한다. 이전 owner가 작업을 계속하더라도 다음 guarded 호출을 막고 최종 게시를 거부한다. 외부 제공자가 이미 받은 요청을 취소/중복제거하는 exactly-once 보장은 아니다. 프로세스가 검사 직후 장시간 정지되는 극단적인 경우도 외부 API와 DB의 분산 트랜잭션으로 해결한 것은 아니다.

## 초기 잔량을 보수적으로 처리한 이유

- 공식 페이지에서 2026-11-23 확인: 무료 요약정보 **10건/일**. 이용약관은 저장 후 24시간 이상 사용을 금지한다.
  - https://transit.tmapmobility.com/
  - https://transit.tmapmobility.com/terms
  - https://transit.tmapmobility.com/docs/routes/sub
- 공식 자료에서 정확한 일일 초기화 시간/시간대를 확정하지 못했다. 자정/KST로 가정하지 않고 각 예약이 24시간 지난 뒤에만 해당 슬롯이 돌아오는 rolling 방식이다.
- 기존 기록은 2026-11-23 E2E 5회와 이전 약 2회 probe다. 이전 probe들의 정확한 시각/제공자 전체 사용량은 검증할 수 없다. 따라서 **8회를 새로 주거나 잔여 1회라고 단정하지 않고**, 설치 시점에 8슬롯 전부 예약 처리했다.
- 실제 Neon 초기 행 read-back: 8슬롯, 최초 보호 해제 가능 시각 **2026-11-24 10:46:14.377 KST** (`2026-11-24T01:46:14.377Z`). 이는 이 앱의 보수적 초기 차단 종료이지 TMAP의 공식 reset/잔여량이 아니다. 이후에는 개별 예약별 24시간이다.
- 설치 재실행은 `ON CONFLICT DO NOTHING`이므로 기존 예산을 초기화하지 않는다. 행이 없거나 유실되어도 자동 생성 시 8회 소진 상태로 시작한다. 정상 사용을 위해 quota 행을 삭제/비우지 않는다.

## DB 적용과 재현

추가 테이블은 `api_quota_windows`, `calculation_cache` 두 개뿐이다. 기존 rooms/participants DDL과 데이터는 수정하지 않았다. 설치 전후 rooms=1, participants=3을 읽어 확인했다. 운영 quota 행 1개가 생성됐고 운영 방에 대한 계산/캐시 생성은 하지 않았다. Drizzle schema에도 두 테이블을 추가해 향후 push에서 유실되지 않게 했다.

```sh
# 승인된 additive 설치. .env.local 명시적 로딩, 기존 quota 보존.
ALLOW_PROTECTION_SCHEMA=1 node --env-file=.env.local scripts/install-protections.mjs

# Neon 통합 검증: UUID 접두사로 소유한 scratch 행만 생성/정리.
# DB 외 HTTP는 전부 stub이며 실제 TMAP/Kakao/ODsay 요청 없음.
ALLOW_PROTECTION_DB_TEST=1 node --env-file=.env.local --conditions=react-server \
  --import ./tests/register.mjs scripts/verify-protections-db.mjs

npm test
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm run build
```

실행 출력: `docs/protection-verification.txt`. RED→GREEN을 확인한 테스트는 지문, 전체 계산 캐시/TTL/변경, 동시 busy, stale owner/DB 실패, quota 거절·실패 카운트·키 누락, 추정 표시 보존, 실제 API/서버 페이지 함수의 공통 보호 경로, Drizzle 스키마다. 기존 12개 동작 테스트도 보존했다.

Neon 통합 검증은 실제 SQL로 24개 동시 예약 중 8개 허용, **독립 Node 4프로세스 × 6개 예약 중 합계 8개 허용**, rolling 만료, 캐시 TTL, stale owner 게시/해제 거절, 12개 동시 lock 중 1개 획득을 확인한다. 실제 어댑터의 성공/네트워크 실패 stub 2회를 DB에서 카운트하고 quota 거절 fetch 0회를 확인한다. 실제 후보→ETA→랭킹 파이프라인의 캐시 재조회에서 후보/자동차 추가 요청 0회를 확인하고 저장 결과도 다시 읽는다. scratch 행 삭제 후 count=0을 재조회한다. 예전 테스트 방/참여자는 남긴다.

## 보장 범위와 한계

- 강제 rolling 예산은 **TMAP 요약정보만**이다. ODsay 선택 시 ODsay 원본은 수정하지 않았고 제공자 자체의 일일 한도 차단/네트워크 타임아웃은 추가하지 않았다. 전체 결과 캐시·방별 lease·owner 게시 fencing은 ODsay에도 적용되고 원본 호출 직전 owner를 검사한다. 이미 시작된 ODsay 요청의 장시간 잔류는 제어하지 못한다.
- 자동차/후보 검색은 같은 방·같은 지문 10분 캐시 및 동시 계산 방지로 절약한다. 서로 다른 방/입력이나 만료 후 계산의 카카오 전체 계정 예산을 제한한 것은 아니다. 장소 자동완성 API는 방 계산 캐시 대상이 아니다(8초 fetch 제한은 적용).
- 앱 밖에서 같은 키를 쓰는 다른 코드/계정 콘솔 호출은 DB 예산에 잡히지 않는다. 무료 계정 전체의 정확한 남은 호출량 또는 비용을 보장하지 않는다.
- 익명 방 생성 악용 방지, 전역 카카오/ODsay 예산, DB 행 수 제한/주기 삭제, 배포 서버리스 최대 실행시간 조정은 별도다. 원본 응답이나 비밀 키는 로그/캐시에 저장하지 않는다.
- QA 서버를 열지 않았고 배포/결제/커밋/푸시는 하지 않았다. 실제 제공자 결과를 다시 조회하지 않았으므로 이전 실측 E2E 증거와 이번 offline+Neon 보호 검증을 구분한다.
- 검증 중 도구의 URL extract 백엔드가 지원되지 않아 공식 문서는 검색 결과 본문으로 확인했다. Neon HTTP가 `api.<region>` 호스트를 사용함을 처음 stub이 허용하지 않아 통합 테스트가 실패했다. 설치 드라이버 `transformHost`를 확인하고 **DB 호스트만** allowlist에 추가한 뒤 통과했다. 실패 실행도 소유한 scratch 행 정리/0건 재조회를 완료했다. 실제 제공자 호출로 대체하지 않았다.

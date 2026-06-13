# Vercel 이전 + Neon Postgres 설정 가이드

웨딩홀 지도를 **Vercel**(정적 사이트 + 서버리스 API)로 옮기고, **Neon Postgres**에
공유 후기·키워드 투표를 저장하는 설정이에요. 코드는 이미 다 들어가 있고, 아래 대시보드
작업만 한 번 해주면 됩니다.

## 1) Vercel 프로젝트 생성
1. https://vercel.com → **Add New… → Project**
2. GitHub의 `ikdd7/test5` 저장소를 Import
3. **Production Branch**를 `claude/vibe-coding-revenue-page-k8dg72`로 지정
   (Settings → Git → Production Branch)
4. Framework Preset: **Other** (정적 + `api/` 자동 인식). Build/Output 설정은 비워두세요.
5. Deploy

→ 배포되면 `https://<프로젝트>.vercel.app` 주소가 나와요. (커스텀 도메인은 나중에 연결 가능)

## 2) Neon Postgres 연결
1. Vercel 프로젝트 → **Storage** 탭 → **Create Database** → **Neon (Postgres)** 선택
   (또는 https://neon.tech 에서 만들고 Integration으로 연결)
2. 연결하면 `POSTGRES_URL` 등 환경변수가 프로젝트에 **자동 주입**됩니다.
   (`api/votes.js`·`api/reviews.js`의 `@vercel/postgres`가 이걸 자동으로 읽어요.)

## 3) 테이블 생성 (한 번만)
Neon 대시보드 → **SQL Editor**에 저장소의 [`schema.sql`](./schema.sql) 내용을 붙여넣고 **Run**.
(votes / reviews 두 테이블이 생깁니다.)

## 4) 재배포
환경변수가 잡힌 뒤 Vercel에서 **Redeploy** 한 번. 끝!

---

## 동작 방식
- **API 있으면** → 후기·키워드 투표가 서버(Neon)에 저장돼 **모두에게 공유**됩니다.
- **API 없으면**(예: 로컬 파일로 열기) → 자동으로 **이 기기 localStorage**로 폴백.
  그래서 설정 전에도 화면은 안 깨져요.
- 익명 식별: 기기마다 `wedding_cid`(임의 ID)로 "한 사람=키워드당 1표", 본인 후기만 삭제 가능.

## 운영(스팸·가짜 관리)
- 후기는 `reviews.status` 컬럼이 `visible`/`hidden`. 부적절한 글은 Neon SQL Editor에서
  `update reviews set status='hidden' where id=...;` 로 숨길 수 있어요.
- 더 본격적인 운영자 승인 화면이 필요하면 `/api`에 관리자 토큰 기반 엔드포인트를 추가하면 됩니다.

## 스크래퍼는 그대로
가격 수집(GitHub Actions의 smartwedding/iwedding 등)은 기존처럼 동작하고 `venues.js`를
커밋합니다. 커밋되면 Vercel이 자동 재배포해요.

## 주의
- Vercel 무료(Hobby)는 비상업용 전제입니다. 수익화 시 Pro 플랜이 필요할 수 있어요.
- Neon 무료 티어는 초기 트래픽에 충분합니다.

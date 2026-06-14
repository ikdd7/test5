-- 전국 웨딩홀 지도 — 공유 후기·키워드 투표 스키마 (Neon Postgres)
-- Neon 대시보드의 SQL Editor에 붙여넣고 Run 하세요.

-- 키워드 투표: (식장, 키워드, 기기) 1표. 같은 기기가 같은 키워드 다시 누르면 토글(삭제).
create table if not exists votes (
  venue_key  text not null,
  keyword    text not null,
  client_id  text not null,
  created_at timestamptz not null default now(),
  primary key (venue_key, keyword, client_id)
);
create index if not exists votes_venue_idx on votes (venue_key);

-- 후기(여러 개). status='visible'만 노출, 'hidden'은 운영자가 가린 것.
create table if not exists reviews (
  id         bigint generated always as identity primary key,
  venue_key  text not null,
  venue_name text,
  client_id  text not null,
  body       text not null,
  rating     int,                       -- 별점 1~5 (없으면 null)
  status     text not null default 'visible',
  created_at timestamptz not null default now()
);
create index if not exists reviews_venue_idx on reviews (venue_key, status);

-- 기존 테이블에 별점 컬럼 추가(이미 만들어둔 경우 이 한 줄만 실행)
alter table reviews add column if not exists rating int;

-- 사용자 가격 제보(식대/대관료). 공식 데이터와 별개로 집계해 참고용 표시.
create table if not exists price_reports (
  id         bigint generated always as identity primary key,
  venue_key  text not null,
  venue_name text,
  client_id  text not null,
  meal       int,                       -- 1인 식대(원)
  rental     bigint,                    -- 대관료(원)
  created_at timestamptz not null default now()
);
create index if not exists price_reports_venue_idx on price_reports (venue_key);

-- 운영자 승인 기반 언락: pending(대기)/approved(승인)/rejected(반려). 승인된 제보만 가격 언락·집계.
alter table price_reports add column if not exists status text not null default 'pending';
create index if not exists price_reports_status_idx on price_reports (client_id, status);

-- 제보 증빙 사진(견적서, base64 data URL) + 검증용 메모(연락처/SNS 등)
alter table price_reports add column if not exists photo text;
alter table price_reports add column if not exists note  text;

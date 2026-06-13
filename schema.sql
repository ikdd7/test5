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
  status     text not null default 'visible',
  created_at timestamptz not null default now()
);
create index if not exists reviews_venue_idx on reviews (venue_key, status);

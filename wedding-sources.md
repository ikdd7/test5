# 🔗 결혼식장 가격 수집용 소스 100+ (수집 작업지)

> 제가 못 여는(403·로그인) 글을 **로그인되는 당신이** 열어 `seed.html`에 입력하는 작업지입니다.
> 각 줄에서 `지역 / 홀타입 / 1인 식대 / 대관료 / 보증인원 / 시간대 / 출처URL`을 뽑아 입력하세요.
> 식대는 **부가세 포함가**로 통일(미포함이면 seed.html이 ×1.1 보정). 출처는 source 칸에 URL.

수집 순서: **① 공식 요금표(빠르고 정확) → ② 다수정리글(1글=여러 식장) → ③ 리뷰 플랫폼 → ④ 커뮤니티**. 이 순서면 100개 충분히 모입니다.

---

## ① 🥇 공식 요금표 — 식장이 직접 공개 (정확·무위험, verified=y)
한 페이지에 정가가 박혀 있어 판단 없이 그대로 옮기면 됩니다. 가장 먼저 터세요.
- [ ] 서울대연구공원웨딩홀 예식/연회비용 — https://www.snuwedding.co.kr/snu/guide_cost
- [ ] 서울 공공예식장 시설/요금 (대관 시간당 37.4만~42.4만, 수용 100~200) — https://wedding.seoulwomen.or.kr/facilities
- [ ] 서울 공공예식장 22곳 안내(대관 무료~120만) — https://mediahub.seoul.go.kr/archives/2008859 · 누리집 “서울마이웨딩”
- [ ] 인천 웨딩홀 정보 — https://incheon.wedding/hall/
- [ ] 웨딩홀 등급표 2025(다수 식장 가격대) — https://ikidari.co.kr/wedding-hall/
> 💡 “공공예식장 / 시민의숲 / 구민회관 / 대학교 웨딩홀 / 컨벤션센터”는 대부분 요금을 공개합니다. 지역명+“공공예식장 대관료”로 더 찾으세요. 여기서만 30~40개 가능.

## ② 🟢 다수 식장 정리글 — 1글 = 여러 식장 (최고 효율)
- [ ] 서울 결혼식 비용 정리(장문) — https://cafe.daum.net/dotax/D8UA/5502357
- [ ] 대구 웨딩홀 투어 리스트(식대·대관 공유) — https://blog.weddinglast.com/대구-웨딩홀-투어-리스트/
- [ ] 성남·강남·강동 웨딩홀 비교 — https://kookoo-life.com/entry/02웨딩홀-비교성남-웨딩홀-및-강남-강동-웨딩홀
- [ ] 인천 웨딩홀 순위·견적 리스트 — https://www.directwedding.co.kr/blog/incheon-weddinghall
      (같은 블로그에서 `/blog/`+지역명으로 강남·부산 등도 확인)
- [ ] MyWedlog 커뮤니티(결혼예산의 정석) — https://community.mywedlog.com/
- [ ] 항목별 결혼 비용 총정리 — https://brunch.co.kr/@intp-lia/4

## ③ 🔵 리뷰 플랫폼 — 지역별로 훑기 (리뷰 1개 = 식장 1개)
- [ ] MyWedlog 리뷰(세인트메리엘 등, /review/번호로 순회) — https://mywedlog.com/review/998
- [ ] 결직웨딩(신도림 라마다 등 계약 견적 후기) — https://kgwed.com/
- [ ] 신부야 웨딩홀 — https://www.sinbuya.com/product/hall/wedding

## ④ 🟣 개별 견적 후기 블로그 (상세·정확, 1글=1식장, 보통 시리즈)
- [ ] 전지적 예랑이 시점(빌라드지디 강남 등 “웨딩후기 #N” 시리즈) — https://thegroomlog.com/
- [ ] 분당 웨딩홀 투어(판교 W스퀘어 등 “투어 #N”) — https://tyvld.meat2ja.com/

## ⑤ ⚫ 커뮤니티 — 글마다 견적 숫자 (검색해 줍기)
- [ ] Threads “결혼 영수증” 계정(견적 다수) — https://www.threads.com/@wedding_receipt_
- [ ] Threads @bambi_ne_ — https://www.threads.com/@bambi_ne_
- [ ] 블라인드 “서울 웨딩베뉴 티어” — https://www.teamblind.com/kr/post/서울-웨딩베뉴-티어-ffRGynhg
- [ ] 클리앙 “웨딩홀 가격 올랐네요” — https://www.clien.net/service/board/park/18914024
> 다결·인스타는 로그인 후 “지역명 웨딩홀 견적” 검색 → 견적 캡처 글이 가장 많습니다.

---

## 입력 팁 (품질 = 사이트의 전부)
- **부가세 포함 여부**를 꼭 확인(미포함이면 식대가 10% 낮게 보임).
- **시간대**(토요일 낮/저녁·일요일·평일) 기록 — 대관료가 크게 갈림.
- **공식 요금표·견적서 사진**이면 `검증=y`, 카더라면 `n`.
- 식장명은 입력해도 사이트엔 **익명 집계**로만 노출(실명은 3건+검증 이후). source엔 URL 남기기.
- 한 지역(예: 서울·경기)을 먼저 5건 이상 채워야 그 지역 페이지가 열립니다(`node build.js`).

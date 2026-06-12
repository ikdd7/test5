/*
 * venues.js — 전국 예식장 리스트 (실제 식장 + 좌표). 지도 핀의 소스.
 * 출처: 공개 가격정보 사이트(스마트웨딩·다이렉트결혼준비·아이웨딩 등) 및 견적공유 글.
 * 가격은 시작가(~)·범위 중간값 등 근사이며 verified=false(견적서 직접 확인 전).
 * 좌표는 식장 소재 구/동 중심 근사값(정밀 주소 지오코딩은 추후).
 */
window.WEDDING_VENUES = [
  // 서울
  { name: "아펠가모 광화문", region: "서울", district: "종로구", type: "컨벤션", meal: 90000, rental: 9000000, lat: 37.5705, lng: 126.9770, verified: false, source: "kgwed.com" },
  { name: "더라움", region: "서울", district: "강남구", type: "하우스웨딩", meal: 125000, rental: 5500000, lat: 37.5108, lng: 127.0224, verified: false, source: "smartwedding/TheRaum" },
  { name: "노블발렌티 대치", region: "서울", district: "강남구", type: "하우스웨딩", meal: 98000, rental: 12000000, lat: 37.4995, lng: 127.0560, verified: false, source: "smartwedding/noblevalentidaechi" },
  { name: "그랜드하얏트 서울", region: "서울", district: "용산구", type: "호텔", meal: 145000, rental: 4000000, lat: 37.5390, lng: 126.9876, verified: false, source: "directwedding/hall0063" },
  { name: "엘타워", region: "서울", district: "서초구", type: "컨벤션", meal: 150000, rental: 20000000, guarantee: 250, lat: 37.4701, lng: 127.0388, verified: false, source: "smartwedding/eltower" },
  { name: "서울웨딩타워", region: "서울", district: "송파구", type: "컨벤션", meal: 85000, rental: 9500000, lat: 37.5145, lng: 127.1060, verified: false, source: "smartwedding/swtower" },
  { name: "웨딩그룹 위더스 영등포", region: "서울", district: "영등포구", type: "컨벤션", meal: 96000, rental: 13000000, lat: 37.5256, lng: 126.9070, verified: false, source: "smartwedding/withus" },
  { name: "여의도웨딩컨벤션", region: "서울", district: "영등포구", type: "컨벤션", meal: 85000, rental: 9000000, lat: 37.5215, lng: 126.9240, verified: false, source: "smartwedding/YeouidoWeddingConvention" },
  { name: "FKI플라자", region: "서울", district: "영등포구", type: "컨벤션", meal: 69000, rental: 3500000, lat: 37.5285, lng: 126.9250, verified: false, source: "smartwedding/FKIPLAZA" },
  { name: "보타닉파크웨딩", region: "서울", district: "강서구", type: "컨벤션", meal: 82000, rental: 8000000, lat: 37.5700, lng: 126.8350, verified: false, source: "smartwedding/botanicparkwedding" },
  { name: "더뉴컨벤션", region: "서울", district: "강서구", type: "컨벤션", meal: 95000, rental: 13000000, lat: 37.5510, lng: 126.8500, verified: false, source: "smartwedding/thenewwedding" },
  { name: "라루체 웨딩", region: "서울", district: "중구", type: "컨벤션", meal: 77000, rental: 11000000, lat: 37.5600, lng: 126.9970, verified: false, source: "smartwedding/lalucewedding" },
  // 경기
  { name: "W힐스컨벤션", region: "경기", district: "성남시 분당구", type: "컨벤션", meal: 55000, rental: 4000000, lat: 37.4115, lng: 127.1290, verified: false, source: "smartwedding/WHillsConvention" },
  { name: "파티움하우스 수원", region: "경기", district: "수원시", type: "하우스웨딩", meal: 63000, rental: 6000000, lat: 37.2900, lng: 127.0100, verified: false, source: "directwedding/hall0485" },
  { name: "호텔리츠컨벤션웨딩", region: "경기", district: "수원시 팔달구", type: "컨벤션", meal: 62000, rental: 6500000, lat: 37.2780, lng: 127.0150, verified: false, source: "smartwedding/hotelritzkr" },
  { name: "판교 W스퀘어 채플홀", region: "경기", district: "성남시 분당구", type: "채플/성당", meal: 58000, rental: 6500000, guarantee: 150, lat: 37.3950, lng: 127.1110, verified: false, source: "tyvld.meat2ja.com" },
  // 인천
  { name: "다르미앙 (송도)", region: "인천", district: "연수구", type: "컨벤션", meal: 117000, rental: 5500000, guarantee: 300, lat: 37.3900, lng: 126.6400, verified: false, source: "thewedd.com/hall-161" },
  // 대구
  { name: "대구웨딩칼라디움", region: "대구", district: "동구", type: "일반예식장", meal: 45000, rental: 1500000, lat: 35.8810, lng: 128.7360, verified: false, source: "directwedding/hall0103" },
  { name: "웨딩 메르디앙", region: "대구", district: "대구", type: "컨벤션", meal: 57000, rental: 2000000, slot: "토요일 낮", lat: 35.8700, lng: 128.5950, verified: false, source: "4.mjella.com" },
  { name: "라테라스 웨딩", region: "대구", district: "대구", type: "컨벤션", meal: 53000, rental: 2450000, lat: 35.8650, lng: 128.6050, verified: false, source: "blog.weddinglast.com" },
  // 부산
  { name: "파라다이스 호텔 부산", region: "부산", district: "해운대구", type: "호텔", meal: 165000, rental: 0, lat: 35.1590, lng: 129.1600, verified: false, source: "wedding-info/sotongsamsung" },
  // 대전
  { name: "라도무스아트센터", region: "대전", district: "서구", type: "컨벤션", meal: 57500, rental: 0, lat: 36.3520, lng: 127.3780, verified: false, source: "iwedding/1459495032" },
  { name: "루이비스컨벤션 대전", region: "대전", district: "유성구", type: "컨벤션", meal: 57500, rental: 0, lat: 36.3620, lng: 127.3560, verified: false, source: "directwedding/hall0191" },
  // 광주
  { name: "광주웨딩시대 (홀리데이인)", region: "광주", district: "광주", type: "컨벤션", meal: 45000, rental: 0, lat: 35.1600, lng: 126.8510, verified: false, source: "iwedding/1537518991" },
  // 제주
  { name: "제주해비치 호텔앤리조트", region: "제주", district: "서귀포시", type: "호텔", meal: 130000, rental: 4400000, lat: 33.3240, lng: 126.8400, verified: false, source: "directwedding/hall0440" },
  // 지방 보강
  { name: "부산 W스퀘어", region: "부산", district: "부산진구", type: "일반예식장", meal: 42000, rental: 2950000, guarantee: 150, lat: 35.1630, lng: 129.0530, verified: false, source: "directwedding/hall0225" },
  { name: "대구 파라다이스컨벤션", region: "대구", district: "달서구", type: "컨벤션", meal: 45000, rental: 0, lat: 35.8290, lng: 128.5320, verified: false, source: "directwedding/hall0105" },
  { name: "대구 웨딩비엔나", region: "대구", district: "대구", type: "컨벤션", meal: 39000, rental: 0, lat: 35.8550, lng: 128.5800, verified: false, source: "iwedding/1382437461" },
  { name: "전주웨딩의전당", region: "전북", district: "전주시", type: "일반예식장", meal: 40000, rental: 300000, guarantee: 150, lat: 35.8240, lng: 127.1480, verified: false, source: "directwedding/hall0435" },
  { name: "그랜드머큐어앰배서더 창원", region: "경남", district: "창원시", type: "호텔", meal: 45000, rental: 0, lat: 35.2280, lng: 128.6810, verified: false, source: "directwedding/hall0059" },
  // 빈 지역 보강(강원·충남·충북·울산)
  { name: "아모르컨벤션웨딩 원주", region: "강원", district: "원주시", type: "컨벤션", meal: 45000, rental: 0, lat: 37.3420, lng: 127.9200, verified: false, source: "ihall/1377222636" },
  { name: "아산터미널웨딩홀", region: "충남", district: "아산시", type: "일반예식장", meal: 48000, rental: 1800000, lat: 36.7900, lng: 127.0040, verified: false, source: "directwedding/hall0338" },
  { name: "CA웨딩컨벤션 천안", region: "충남", district: "천안시", type: "컨벤션", meal: 45000, rental: 0, lat: 36.7950, lng: 127.1040, verified: false, source: "ca-wedding.co.kr" },
  { name: "청주더빈웨딩홀", region: "충북", district: "청주시", type: "컨벤션", meal: 57000, rental: 4000000, lat: 36.6420, lng: 127.4890, verified: false, source: "directwedding/hall0453" },
  { name: "모든날웨딩 청주", region: "충북", district: "청주시", type: "컨벤션", meal: 58000, rental: 4500000, guarantee: 100, lat: 36.6300, lng: 127.4600, verified: false, source: "weddingcrowd/1710" },
  { name: "울산 컨벤션(참고)", region: "울산", district: "울주군", type: "일반예식장", meal: 38000, rental: 1500000, lat: 35.5380, lng: 129.3110, verified: false, source: "localinfo/울산5곳" },
  { name: "라한호텔 포항", region: "경북", district: "포항시", type: "호텔", meal: 60000, rental: 0, lat: 36.0190, lng: 129.3430, verified: false, source: "lahanhotels/pohang" },
  { name: "라한셀렉트 경주", region: "경북", district: "경주시", type: "호텔", meal: 50000, rental: 0, lat: 35.8560, lng: 129.2250, verified: false, source: "lahanhotels/gyeongju(2021)" },
];

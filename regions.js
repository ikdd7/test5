/*
 * regions.js — 지역명 ↔ URL 슬러그 (Node + 브라우저 겸용)
 * build.js(정적 페이지 파일명)와 wedding.html(런타임 링크)이 함께 사용 → 링크 일관성.
 */
(function (root) {
  "use strict";
  var SLUGS = {
    "서울": "seoul", "경기": "gyeonggi", "인천": "incheon", "부산": "busan",
    "대구": "daegu", "대전": "daejeon", "광주": "gwangju", "울산": "ulsan",
    "세종": "sejong", "제주": "jeju", "강원": "gangwon", "충북": "chungbuk",
    "충남": "chungnam", "전북": "jeonbuk", "전남": "jeonnam", "경북": "gyeongbuk",
    "경남": "gyeongnam",
  };
  root.REGION_SLUGS = SLUGS;
})(typeof window !== "undefined" ? window : this);

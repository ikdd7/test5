/*
 * build.js — 지역별 랜딩 페이지 정적 생성기 + sitemap 자동화
 * 실행:  node build.js
 * 입력:  wedding-data.js (예시/시드) · stats.js · regions.js
 * 출력:  region/{slug}.html (데이터 5건 이상 지역만) · sitemap.xml
 *
 * 핵심: H1·메타·요약문에 "중앙값 숫자"를 정적으로 박아 SEO 즉답 + thin content 방지.
 *       차트/백분위는 임베드된 데이터로 클라이언트 렌더.
 */
const fs = require("fs");
const path = require("path");
const Stats = require("./stats.js").Stats;
const SLUGS = require("./regions.js").REGION_SLUGS;

const SITE = "https://example.com";
const MIN_PAGE = 3; // 식장 3곳 이상인 지역만 페이지 생성(통계 신뢰 최소선)
const ROOT = __dirname;

function loadData() {
  const vm = require("vm");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "venues.js"), "utf8"), sandbox);
  return (sandbox.window.WEDDING_VENUES || []).filter(Stats.plausible);
}
function groupMedian(rows, key, valKey) {
  const g = {};
  rows.forEach((d) => (g[d[key]] = g[d[key]] || []).push(d[valKey]));
  return Object.keys(g).map((k) => {
    const r = Stats.robust(g[k]);
    return { label: k, median: r.median, n: r.n };
  }).sort((a, b) => b.median - a.median);
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function regionPage(region, recs, allRegions) {
  const slug = SLUGS[region];
  const meals = recs.map((d) => d.meal);
  const rMeal = Stats.robust(meals);
  const medMeal = rMeal.median;
  const q1 = Math.round(Stats.quantile(meals, 0.25)), q3 = Math.round(Stats.quantile(meals, 0.75));
  const byType = groupMedian(recs, "type", "meal");
  const bySlot = groupMedian(recs, "slot", "rental");
  const verified = recs.filter((d) => d.verified).length;
  const topType = byType[0] ? byType[0].label : "";
  const topSlot = bySlot[0] ? bySlot[0].label : "";
  const today = new Date().toISOString().slice(0, 10);

  const medTxt = Stats.manwon(medMeal) + "원";
  const summary = `${region} 웨딩홀 식대는 중앙값 ${medTxt}, 대부분 ${Stats.manwon(q1)}~${Stats.manwon(q3)}원 사이입니다.` +
    (topType ? ` ${topType}이 가장 비싼 편입니다. (식장 ${recs.length}곳 기준)` : "");
  const title = `${region} 웨딩홀 식대 ${medTxt} (중앙값) — 결혼식장 비용 비교`;
  const desc = `${region} 결혼식장 1인 식대 중앙값 ${medTxt}, 대관료·시간대별 비교. 실제 제보 ${recs.length}건 기준 그래프와 내 견적 비교.`;

  // 인근 지역 내부링크
  const near = allRegions.filter((r) => r !== region).slice(0, 6)
    .map((r) => `<a href="${SLUGS[r]}.html">${esc(r)}</a>`).join(" · ");

  // 게이트(식장별 상세 — 예시 데이터는 익명 표본으로 표시)
  const gateRows = recs.slice(0, 20).map((d) =>
    `<tr><td>${esc(d.name || "-")}</td><td>${esc(d.type)}</td><td>${Stats.won(d.meal)}</td><td>${d.rental ? Stats.won(d.rental) : "—"}</td><td>${d.verified ? "✅" : "–"}</td></tr>`
  ).join("");

  const ld = {
    "@context": "https://schema.org", "@type": "Dataset",
    name: `${region} 결혼식장 비용 데이터`, description: desc,
    creator: { "@type": "Organization", name: "계산기허브" },
    variableMeasured: ["1인 식대", "대관료", "보증인원"], dateModified: today,
  };
  const faq = {
    "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: `${region} 웨딩홀 식대는 얼마인가요?`, acceptedAnswer: { "@type": "Answer", text: `${region} 1인 식대 중앙값은 ${medTxt}이며, 대부분 ${Stats.manwon(q1)}~${Stats.manwon(q3)}원 사이입니다. (제보 ${recs.length}건 기준)` } },
      { "@type": "Question", name: "이 가격은 어떻게 모았나요?", acceptedAnswer: { "@type": "Answer", text: "사용자 제보를 모아 중앙값으로 집계하고 IQR 이상치를 제외합니다. 자세한 방법은 방법론 페이지를 참고하세요." } },
    ],
  };
  const crumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "결혼식장 비용", item: SITE + "/wedding.html" },
      { "@type": "ListItem", position: 2, name: region, item: `${SITE}/region/${slug}.html` },
    ],
  };

  const embed = JSON.stringify(recs.map((d) => ({ name: d.name, type: d.type, slot: d.slot, meal: d.meal, rental: d.rental, guarantee: d.guarantee, verified: !!d.verified })));

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}/region/${slug}.html" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(region)} 웨딩홀 식대 ${esc(medTxt)} (중앙값)" />
<meta property="og:description" content="${esc(summary)}" />
<meta property="og:locale" content="ko_KR" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💒</text></svg>" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(faq)}</script>
<script type="application/ld+json">${JSON.stringify(crumb)}</script>
<script>window.REPORT_FORM_URL="";</script>
<link rel="stylesheet" href="../style.css" />
</head>
<body>

<nav class="sitenav"><div class="in">
  <span class="brand">🧮 계산기허브</span>
  <a href="../wedding.html">결혼식장 비용</a>
  <a href="../map.html">지도</a>
  <a href="../method.html">방법론</a>
</div></nav>

<header class="wrap">
  <nav class="crumb"><a href="../wedding.html">결혼식장 비용</a> › <b>${esc(region)}</b></nav>
  <h1 style="margin-top:8px">${esc(region)} 웨딩홀 식대 중앙값<br><span class="hero">${esc(medTxt)}</span> <span class="heroin">/ 1인</span></h1>
  <p class="metaline">제보 ${recs.length}건 · 검증 ${verified}건 · 2026 기준 · ${today} 갱신</p>
  <p class="summary">${esc(summary)}</p>
  <a class="cta" href="#compare">내 견적은 평균보다 비쌀까? →</a>
</header>

<main class="wrap">
  <div class="chart-card"><h3>🍽️ 홀 타입별 식대 중앙값 (1인)</h3><div id="cType"></div></div>
  <div class="chart-card"><h3>🕐 시간대별 대관료 중앙값</h3><div id="cSlot"></div></div>
  <div class="chart-card"><h3>📊 식대 분포 (1만원 구간)</h3><div id="cDist"></div>
    <p class="cap">막대가 높을수록 그 가격대 식장이 많다는 뜻. 내 식대 위치는 아래 비교에서.</p></div>

  <div class="ad" id="ad1">광고 영역 (애드센스 승인 후 자동 노출)</div>

  <h2 id="compare" style="margin:28px 0 12px;font-size:1.3rem">💰 내 견적 vs ${esc(region)} 평균</h2>
  <div class="card">
    <div class="grid2">
      <div class="field"><label>예상 하객 수</label><div class="inputrow"><input id="mG" inputmode="numeric" placeholder="250"/><span class="unit">명</span></div></div>
      <div class="field"><label>1인 식대</label><div class="inputrow"><input id="mM" inputmode="numeric" placeholder="65,000"/><span class="unit">원</span></div></div>
    </div>
    <div class="field"><label>대관료 <span class="hint">없으면 0</span></label><div class="inputrow"><input id="mR" inputmode="numeric" placeholder="0"/><span class="unit">원</span></div></div>
  </div>
  <div class="result">
    <div class="lbl">내 총 예상 비용</div><div class="big" id="pRes">–</div>
    <div class="verdict" id="pVer"></div>
  </div>
  <div class="share" id="share"></div>

  <div class="chart-card gatewrap">
    <h3>🏛️ ${esc(region)} 식장별 상세 (표본)</h3>
    <div id="gate" class="gate">
      <table class="seedtbl"><thead><tr><th>식장</th><th>타입</th><th>식대</th><th>대관료</th><th>검증</th></tr></thead>
      <tbody>${gateRows}</tbody></table>
    </div>
    <div class="gateover"><button type="button" class="sharebtn alt" id="gateBtn">🔓 제보 1건 남기고 전체 보기</button>
      <p class="cap">집계는 누구나, 식장별 상세는 함께 만드는 분께 공개해요.</p></div>
  </div>

  <h2 style="margin:26px 0 12px;font-size:1.2rem">자주 묻는 질문</h2>
  <details open><summary>${esc(region)} 웨딩홀 식대는 얼마인가요?</summary><div class="a">1인 식대 중앙값은 ${esc(medTxt)}이며, 대부분 ${esc(Stats.manwon(q1))}~${esc(Stats.manwon(q3))}원 사이입니다. (제보 ${recs.length}건 기준, 이상치 제외)</div></details>
  <details><summary>이 가격은 믿을 수 있나요?</summary><div class="a">평균이 아닌 중앙값으로 집계하고 IQR 이상치를 자동 제외해, 가짜 한두 건이 결과를 흔들지 못합니다. 검증된 제보만 보기도 가능합니다. <a href="../method.html">방법론 보기</a></div></details>
</main>

<footer class="wrap">
  <p>표시 데이터는 제보 기반 추정치이며 실제 계약과 다를 수 있습니다. 계약 시 직접 확인하세요.</p>
  <p style="margin-top:6px">인근 지역: ${near || "준비 중"}</p>
  <p style="margin-top:6px"><a href="../method.html">방법론·신뢰</a> · © <span id="yr"></span> 계산기허브</p>
</footer>

<script>window.REGION_NAME=${JSON.stringify(region)};window.REGION_DATA=${embed};</script>
<script src="../stats.js"></script>
<script src="../charts.js"></script>
<script src="../share.js"></script>
<script src="../region.js"></script>
</body>
</html>
`;
}

function sitemap(slugs) {
  const today = new Date().toISOString().slice(0, 10);
  const statics = [
    ["/", "1.0", "monthly"], ["/wedding.html", "0.9", "weekly"], ["/map.html", "0.9", "weekly"], ["/method.html", "0.5", "monthly"],
    ["/silup.html", "0.9", "monthly"], ["/daechul.html", "0.9", "monthly"],
    ["/man-nai.html", "0.8", "monthly"], ["/pyeong.html", "0.7", "monthly"],
  ];
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  statics.forEach(([u, p, f]) => { x += `  <url><loc>${SITE}${u}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>\n`; });
  slugs.forEach((s) => { x += `  <url><loc>${SITE}/region/${s}.html</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`; });
  return x + "</urlset>\n";
}

function main() {
  const data = loadData();
  const byRegion = {};
  data.forEach((d) => (byRegion[d.region] = byRegion[d.region] || []).push(d));
  const eligible = Object.keys(byRegion)
    .filter((r) => SLUGS[r] && byRegion[r].length >= MIN_PAGE)
    .sort((a, b) => byRegion[b].length - byRegion[a].length);

  const dir = path.join(ROOT, "region");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  // 오래된(자격 미달이 된) 지역 페이지 정리
  fs.readdirSync(dir).filter((f) => f.endsWith(".html")).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  eligible.forEach((r) => {
    fs.writeFileSync(path.join(dir, SLUGS[r] + ".html"), regionPage(r, byRegion[r], eligible), "utf8");
  });
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap(eligible.map((r) => SLUGS[r])), "utf8");

  console.log(`지역 페이지 ${eligible.length}개 생성: ${eligible.map((r) => r + "(" + byRegion[r].length + ")").join(", ")}`);
  console.log(`표본 부족으로 제외: ${Object.keys(byRegion).filter((r) => !eligible.includes(r)).join(", ") || "없음"}`);
  console.log("sitemap.xml 갱신 완료");
}
main();

'use strict';
/* 진도군 통합돌봄 모니터링 대시보드 - api.php에서 데이터를 받아 그립니다 */

/* ---------- 유틸 ---------- */
const pad = n => String(n).padStart(2, '0');
const hm = m => m == null ? '' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : 0;
const fmt = n => Number(n || 0).toLocaleString('ko-KR');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const toS = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return toS(d); };
const dlabel = s => { const d = toD(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
const sdate = s => { const d = toD(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const STL = { plan: '예정', prog: '진행중', done: '완료', late: '지연', miss: '미수행', cancel: '취소' };
const HL = ['좋음', '보통', '나쁨'];
const LV = ['', '관심', '주의', '위험'], LVC = ['', 'var(--st-plan)', 'var(--st-late)', 'var(--st-miss)'];
const riskBadge = l => l ? `<em class="risk" style="--c:${LVC[l]}">${LV[l]}</em>` : '';
function nice(max) { if (max <= 0) return 1; const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }

/* ---------- API ---------- */
let TODAY = '', NOW = 0, LOADED_AT = null;
async function api(a, params = {}, body) {
  const u = new URL('api.php', location.href);
  u.searchParams.set('a', a);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify(body) } : {});
  if (r.status === 401) { location.href = 'login.php'; throw new Error('로그인이 필요합니다.'); }
  let j;
  try { j = await r.json(); } catch (e) { throw new Error(`서버 응답을 읽지 못했습니다 (${r.status})`); }
  if (!r.ok || j.error) throw new Error(j.error || `요청 실패 (${r.status})`);
  if (j.today) TODAY = j.today;
  if (j.now != null) { NOW = j.now; LOADED_AT = new Date(); }
  return j;
}

/* ---------- 기본정보 ---------- */
let SV = [], SVI = {}, R = new Map(), W = new Map(), EMD = [], HOUSE = [], DEMO = false, RULE = {};
const sc = sid => `var(--s${SVI[sid]})`;
const svc = sid => SV[SVI[sid]];
function wrap(x) { x.r = R.get(x.rid); x.w = W.get(x.wid); return x; }

/* ---------- 상태 ---------- */
const VS = {
  tab: 'day', year: 0, month: 1, mmode: 'all', msvc: 2, mperson: null, date: '', dsub: 'people', wsvc: 2, drawer: null,
  f: { q: '', emd: '', svc: '', st: '', all: false, sort: 'risk' },
};
let DAY = null; // {date, recs, risk}
const view = document.getElementById('view');

function showError(e) { view.innerHTML = `<div class="panel"><h3>데이터를 불러오지 못했습니다</h3><p class="empty-note">${esc(e.message)}</p><button class="btn" data-act="refresh">다시 시도</button></div>`; }
function loading() { view.innerHTML = '<p class="empty-note">불러오는 중…</p>'; }

/* ---------- 역할별 탭과 도움말 ---------- */
let ME = null;
const ROLE = () => ME ? ME.role : '';
const TABS = {
  admin:   [['day', '일간'], ['month', '월간'], ['year', '연간'], ['care', '집중관리·발굴'], ['approve', '계획 승인'], ['accounts', '계정 관리'], ['audit', '접속기록']],
  central: [['day', '일간'], ['month', '월간'], ['year', '연간'], ['care', '집중관리·발굴'], ['approve', '계획 승인'], ['accounts', '계정 관리']],
  viewer:  [['day', '일간'], ['month', '월간'], ['year', '연간'], ['care', '집중관리·발굴']],
  org:     [['day', '오늘 현황'], ['plan', '월간 계획'], ['month', '월간 실적'], ['year', '연간'], ['accounts', '수행자 계정']],
};
const HELP = {
  day: {
    central: '오늘 모든 서비스의 진행 상황입니다. 오른쪽 "주의 필요"부터 확인하고, 어르신 이름을 누르면 상세 기록이 열립니다.',
    org: '우리 기관 오늘 방문 현황입니다. 지연(주황)·미수행(빨강)이 보이면 담당자에게 연락해 주세요.',
  },
  month: { central: '달력의 날짜를 누르면 그날의 상세 현황으로 이동합니다. 위의 보기 버튼으로 서비스별·담당자별·개인별로 바꿔 볼 수 있습니다.' },
  year: { central: '막대나 표의 칸을 누르면 해당 월 화면으로 이동합니다. 이행률은 어제까지의 승인된 계획 기준입니다.' },
  care: { central: '위험 점수가 높은 어르신부터 보입니다. 전화·방문 등 조치를 한 뒤 처리 상태와 메모를 남겨 주세요.' },
  plan: { org: '① 초안을 만들고 ② 공휴일·휴가 등 바뀐 부분만 고친 뒤 ③ 점검 결과를 확인하고 ④ 매월 20일까지 제출하세요. 승인되면 일정이 잠기고, 이후 변경은 "변경 요청"으로 올립니다.' },
  approve: { central: '수행기관이 제출한 다음 달 계획을 확인하고 승인하거나 반려합니다. 점검 결과에 문제가 있으면 사유를 적어 반려하세요. 아래에서 일정 변경 요청도 처리합니다.' },
  accounts: {
    central: '수행기관 관리자와 조회 전용 계정을 만듭니다. 처음 비밀번호는 한 번만 보이니 당사자에게 전달하세요.',
    org: '우리 기관 현장 수행자 계정을 만들고 관리합니다. 퇴사한 수행자는 "사용 정지"하고, 남은 일정은 월간 계획의 "담당자 일괄 이관"으로 넘기세요.',
  },
  audit: { admin: '누가 언제 어떤 정보를 보고 바꿨는지 기록입니다. 건강정보 열람 기록은 2년 이상 보관합니다.' },
};
function helpStrip(tab) {
  const h = HELP[tab]; if (!h) return '';
  const txt = h[ROLE()] || h.central || h.admin; if (!txt) return '';
  let hidden = false; try { hidden = localStorage.getItem('jd-help-' + tab) === '1'; } catch (e) { }
  if (hidden) return '';
  return `<div class="help" role="note"><span><b>이 화면에서 할 일</b> ${esc(txt)}</span><button class="btn sm" data-act="hidehelp" data-k="${tab}">알겠어요</button></div>`;
}
function drawTabs() {
  const tabs = TABS[ROLE()] || [];
  document.getElementById('tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${VS.tab === k}">${l}<span class="cnt" id="cnt-${k}" hidden></span></button>`).join('');
}
function setBadge(tab, n) { const el = document.getElementById('cnt-' + tab); if (el) { el.textContent = n || ''; el.hidden = !n; } }
function setTab(t) {
  const allowed = (TABS[ROLE()] || []).map(x => x[0]);
  if (!allowed.includes(t)) t = allowed[0];
  VS.tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) { }
  render();
  window.scrollTo(0, 0);
}
async function render() {
  try {
    await ({ year: renderYear, month: renderMonth, day: renderDay, care: renderCare, plan: renderPlan, approve: renderApprove, accounts: renderAccounts, audit: renderAudit })[VS.tab]();
    const hs = helpStrip(VS.tab);
    if (hs && !view.querySelector('.help')) view.insertAdjacentHTML('afterbegin', hs);
    if (ROLE() === 'viewer') view.querySelectorAll('select[data-care],input[data-care],select[data-rep],#repform').forEach(el => { el.disabled = true; if (el.id === 'repform') el.closest('.panel').hidden = true; });
  }
  catch (e) { console.error(e); showError(e); }
  updateClock();
}
function updateClock() {
  const ago = LOADED_AT ? Math.floor((Date.now() - LOADED_AT) / 60000) : 0;
  document.getElementById('clk').innerHTML = TODAY ? `${dlabel(TODAY)} <b class="num">${hm(Math.min(1439, NOW + ago))}</b>` : '';
}
function setCareCount(n) { setBadge('care', n); }

/* ---------- 연간 ---------- */
async function renderYear() {
  loading();
  const Y = await api('year', { y: VS.year });
  if (VS.tab !== 'year') return;
  const cm = VS.year === +TODAY.slice(0, 4) ? +TODAY.slice(5, 7) : (VS.year < +TODAY.slice(0, 4) ? 12 : 0);
  const keys = ['plan', 'pplan', 'cancel', 'pdone', 'done', 'miss'];
  const tot = {}; SV.forEach(s => { tot[s.id] = Object.fromEntries(keys.map(k => [k, 0])); });
  for (let m = 1; m <= 12; m++) SV.forEach(s => { const a = Y.months[m][s.id]; keys.forEach(k => tot[s.id][k] += a[k]); });
  const sum = k => SV.reduce((t, s) => t + tot[s.id][k], 0);
  const rate = T => pct(T.pdone, T.pplan - T.cancel);
  // 월별 막대
  const mtot = m => SV.reduce((t, s) => t + Y.months[m][s.id].plan, 0);
  let mx = 0; for (let m = 1; m <= 12; m++) mx = Math.max(mx, mtot(m));
  const step = nice(mx), top = Math.max(step, Math.ceil(mx / step) * step);
  const Wd = 780, H = 270, ml = 52, mr = 10, mt = 12, mb = 30, iw = Wd - ml - mr, ih = H - mt - mb, bw = iw / 12 * .62;
  const y = v => mt + ih - v / top * ih;
  let g = ''; for (let v = 0; v <= top; v += step) g += `<line class="gridl" x1="${ml}" x2="${Wd - mr}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  let bars = '';
  for (let m = 1; m <= 12; m++) {
    const x = ml + iw / 12 * (m - 1) + (iw / 12 - bw) / 2; let acc = 0, parts = '', dm = 0;
    SV.forEach(s => {
      const a = Y.months[m][s.id], solid = a.done, light = Math.max(0, a.plan - a.done - a.miss - a.cancel); dm += solid;
      if (solid) { parts += `<rect x="${x}" y="${y(acc + solid)}" width="${bw}" height="${ih * solid / top}" style="fill:${sc(s.id)}"/>`; acc += solid; }
      if (light) { parts += `<rect x="${x}" y="${y(acc + light)}" width="${bw}" height="${ih * light / top}" style="fill:${sc(s.id)};opacity:.28"/>`; acc += light; }
    });
    bars += `<g class="bar" data-act="ymonth" data-m="${m}"><title>${m}월 · 계획 ${fmt(mtot(m))}건 · 제공 ${fmt(dm)}건</title>${parts}<rect x="${x - 4}" y="${mt}" width="${bw + 8}" height="${ih}" fill="transparent"/></g><text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" style="${m === cm ? 'font-weight:700;fill:var(--ink)' : ''}">${m}월</text>`;
  }
  const heat = SV.map(s => `<tr><th>${s.short}</th>${Array.from({ length: 12 }, (_, i) => {
    const m = i + 1, a = Y.months[m][s.id], den = a.pplan - a.cancel;
    if (den <= 0) return `<td class="hc" data-act="heat" data-m="${m}" data-s="${s.id}" style="color:var(--faint)">–</td>`;
    const rt = pct(a.pdone, den);
    const c = rt >= 99 ? 'var(--st-done)' : rt >= 98 ? 'color-mix(in srgb,var(--st-done) 55%,var(--st-late))' : rt >= 97 ? 'var(--st-late)' : 'var(--st-miss)';
    return `<td class="hc num" data-act="heat" data-m="${m}" data-s="${s.id}" style="background:color-mix(in srgb,${c} ${rt >= 99 ? 22 : 34}%,transparent)" title="${s.name} ${m}월 이행률 ${rt}%">${rt.toFixed(1)}</td>`;
  }).join('')}</tr>`).join('');
  const emdN = EMD.map((_, e) => [...R.values()].filter(r => r.e === e).length), emdMax = Math.max(1, ...Object.values(Y.emd));
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="yprev" aria-label="이전 해">◀</button><h2>${VS.year}년 서비스 제공 현황</h2><button class="btn" data-act="ynext" aria-label="다음 해">▶</button></div><span class="sub">이행률은 어제까지의 계획 기준 (취소 제외)</span></section>
  <div class="kpis">
    <div class="kpi"><span class="k">누적 제공</span><span class="v">${fmt(sum('done'))}</span><span class="d">연간 계획 ${fmt(sum('plan'))}건</span></div>
    <div class="kpi"><span class="k">계획 대비 이행률</span><span class="v">${pct(sum('pdone'), sum('pplan') - sum('cancel'))}%</span><span class="d">취소 제외</span></div>
    <div class="kpi"><span class="k">이용 수혜자</span><span class="v">${fmt(Y.recipients)}</span><span class="d">2개 이상 이용 ${fmt(Y.multi)}명</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-miss)"></i>미수행</span><span class="v">${fmt(sum('miss'))}</span><span class="d">취소 ${fmt(sum('cancel'))}건</span></div>
    <div class="kpi"><span class="k">담당자</span><span class="v">${fmt(Y.workers)}</span><span class="d">${SV.length}개 수행기관</span></div>
  </div>
  <div class="svccards">${SV.map(s => `<div class="svccard" style="--c:${sc(s.id)}"><span class="n">${s.name}</span><span class="vd">${esc(s.vendor)}</span><span class="v">${fmt(tot[s.id].done)}<small style="font-size:12px;font-weight:500;color:var(--muted)"> 건</small></span>
    <span class="row">이행률 <b>${rate(tot[s.id])}%</b></span><span class="row">이용자 <b>${fmt(Y.users[s.id] || 0)}명</b></span><span class="row">미수행 <b>${fmt(tot[s.id].miss)}</b></span></div>`).join('')}</div>
  <div class="panel"><h3>월별 서비스 제공 추이 <small>진한 색: 제공 완료 · 옅은 색: 남은 계획 · 막대를 누르면 월간 화면</small></h3>
    <div class="legend" style="margin-bottom:6px">${SV.map(s => `<span><i class="dot" style="--c:${sc(s.id)}"></i>${s.name}</span>`).join('')}</div>
    <div class="chartwrap"><svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="월별 서비스 제공 건수">${g}${bars}</svg></div></div>
  <div class="panel"><h3>서비스 × 월 이행률 (%) <small>낮은 칸일수록 붉게 표시 · 칸을 누르면 해당 월로 이동</small></h3>
    <div class="tblwrap"><table class="heat"><thead><tr><th></th>${Array.from({ length: 12 }, (_, i) => `<th style="text-align:center">${i + 1}월</th>`).join('')}</tr></thead><tbody>${heat}</tbody></table></div></div>
  <div class="grid2">
    <div class="panel"><h3>읍·면별 현황 <small>수혜자 수 · 누적 제공</small></h3>
      ${EMD.map((n, e) => `<div class="emdrow"><span>${n}</span><div class="hbar"><i style="width:${(Y.emd[n] || 0) / emdMax * 100}%;background:var(--accent)"></i></div><span class="r">${emdN[e]}명 · ${fmt(Y.emd[n] || 0)}건</span></div>`).join('')}</div>
    <div class="panel"><h3>수행기관별 실적</h3><div class="tblwrap"><table><thead><tr><th>서비스</th><th>수행기관</th><th class="r">대상자</th><th class="r">연간 계획</th><th class="r">누적 제공</th><th class="r">이행률</th></tr></thead><tbody>
      ${SV.map(s => `<tr><td><i class="dot" style="--c:${sc(s.id)}"></i> ${s.short}</td><td>${esc(s.vendor)}</td><td class="r">${fmt(Y.users[s.id] || 0)}</td><td class="r">${fmt(tot[s.id].plan)}</td><td class="r">${fmt(tot[s.id].done)}</td><td class="r"><b>${rate(tot[s.id])}%</b></td></tr>`).join('')}
    </tbody></table></div></div>
  </div>`;
}

/* ---------- 월간 ---------- */
let MONTH = null;
async function renderMonth() {
  loading();
  if (VS.mperson == null) VS.mperson = [...R.keys()][0];
  const M = await api('month', { y: VS.year, m: VS.month, svc: VS.mmode === 'worker' ? VS.msvc : null, rid: VS.mmode === 'person' ? VS.mperson : null });
  if (VS.tab !== 'month') return;
  MONTH = M;
  const days = []; for (let d = M.from; d <= M.to; d = addDays(d, 1)) days.push(d);
  const zero = () => ({ plan: 0, done: 0, prog: 0, late: 0, miss: 0, cancel: 0, bad: 0 });
  const agg = d => SV.map(s => (M.days[d] && M.days[d][s.id]) || zero());
  const sm = SV.map(() => ({ plan: 0, done: 0, miss: 0, cancel: 0 }));
  days.forEach(d => agg(d).forEach((o, i) => { sm[i].plan += o.plan; sm[i].done += o.done; sm[i].miss += o.miss; sm[i].cancel += o.cancel; }));
  const modes = [['all', '전체'], ['svc', '서비스별'], ['worker', '담당자별'], ['person', '개인별']];
  const svcSel = `<select id="msvc" aria-label="서비스">${SV.map(s => `<option value="${s.id}" ${s.id === VS.msvc ? 'selected' : ''}>${s.name}</option>`).join('')}</select>`;
  const P = R.get(VS.mperson);
  const personSel = `<input type="search" id="mperson" list="plist" placeholder="이름 또는 번호" value="${esc(P.name)} (${P.code})" style="width:200px" aria-label="수혜자 선택"><datalist id="plist">${[...R.values()].map(r => `<option value="${esc(r.name)} (${r.code})">${EMD[r.e]} · ${r.age}세</option>`).join('')}</datalist>`;
  let body;
  if (VS.mmode === 'worker') body = workerGrid(days, M);
  else {
    const first = toD(days[0]).getDay();
    const byDate = {}; (M.person || []).forEach(x => (byDate[x.date] = byDate[x.date] || []).push(wrap(x)));
    let cells = WD.map((w, i) => `<div class="wh ${i === 0 ? 'sun' : ''}">${w}</div>`).join('');
    for (let i = 0; i < first; i++) cells += '<div class="cday empty"></div>';
    for (const d of days) cells += dayCell(d, agg(d), byDate[d] || []);
    body = `<div class="tblwrap"><div class="cal">${cells}</div></div>`;
  }
  const nm = VS.month === 12 ? 1 : VS.month + 1;
  const legend = VS.mmode === 'worker'
    ? '<span><i class="wc ok" style="width:14px;min-width:0">&nbsp;</i>모두 완료</span><span><i class="wc lt" style="width:14px;min-width:0">&nbsp;</i>지연 있음</span><span><i class="wc bad" style="width:14px;min-width:0">&nbsp;</i>미수행 있음</span><span><i class="wc pl" style="width:14px;min-width:0">&nbsp;</i>계획</span> · 숫자는 방문 건수'
    : VS.mmode === 'person' ? Object.entries(STL).map(([k, l]) => `<span><i class="dot st-${k}"></i>${l}</span>`).join('') + '<span><b style="color:var(--h2)">!</b> 건강 나쁨</span>'
    : '지난 날: 완료/계획 · 오늘: 실시간 · 이후: 계획 건수 · <b style="color:var(--st-miss)">빨간 숫자</b>: 미수행 · 날짜를 누르면 일간 화면';
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="mprev" aria-label="이전 달">◀</button><h2>${VS.year}년 ${VS.month}월</h2><button class="btn" data-act="mnext" aria-label="다음 달">▶</button></div>
    <div class="seg" role="group" aria-label="보기">${modes.map(([k, l]) => `<button data-act="mmode" data-k="${k}" aria-pressed="${VS.mmode === k}">${l}</button>`).join('')}</div>
    <div class="ctl">${VS.mmode === 'svc' || VS.mmode === 'worker' ? svcSel : ''}${VS.mmode === 'person' ? personSel : ''}</div></section>
  ${VS.mmode === 'person' ? personHead(P) : ''}
  <div class="mlay"><div class="panel" style="padding:10px">${body}<div class="legend" style="margin-top:10px">${legend}</div></div>
    <div class="rail">
      <div class="panel"><h3>${VS.month}월 서비스별 실적</h3>
        ${SV.map((s, i) => { const o = sm[i], r = pct(o.done, o.plan - o.cancel); return `<div class="sb" style="margin-bottom:8px"><div class="t"><span><i class="dot" style="--c:${sc(s.id)}"></i> ${s.name}</span><span><b>${fmt(o.done)}</b> / ${fmt(o.plan)}</span></div><div class="hbar"><i style="width:${r}%;background:${sc(s.id)}"></i></div><div class="t"><span>진척 ${r}%</span><span>${o.miss ? `<span style="color:var(--st-miss)">미수행 ${o.miss}</span> · ` : ''}취소 ${o.cancel}</span></div></div>`; }).join('')}
      </div>
      <div class="panel"><h3>계획 승인 상태 <small>${VS.month}월 / ${nm}월</small></h3>${SV.map(s => { const p = M.plans[s.id] || {}; return `<div class="cl" style="font-size:12.5px;padding:4px 0;gap:6px"><i class="sw" style="--c:${sc(s.id)}"></i>${esc(s.short)}<span style="margin-left:auto;display:flex;gap:4px">${planPill(p.this)}${planPill(p.next)}</span></div>`; }).join('')}
        ${ROLE() === 'central' || ROLE() === 'admin' ? '<button class="btn sm" data-act="tab" data-tab="approve" style="margin-top:8px">계획 승인 화면으로</button>' : ROLE() === 'org' ? '<button class="btn sm" data-act="tab" data-tab="plan" style="margin-top:8px">월간 계획 화면으로</button>' : ''}</div>
    </div></div>`;
}
function dayCell(d, a, precs) {
  const dt = toD(d), dow = dt.getDay(), fut = d > TODAY, isT = d === TODAY;
  const cls = `cday${isT ? ' today' : ''}${fut ? ' fut' : ''}`;
  const dh = extra => `<div class="dh"><span class="${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}">${dt.getDate()}${isT ? ' · 오늘' : ''}</span>${extra || ''}</div>`;
  if (VS.mmode === 'person') {
    return `<button class="${cls}" data-act="mday" data-d="${d}">${dh()}${precs.sort((x, y) => SVI[x.sid] - SVI[y.sid]).map(x => `<span class="pchip st-${x.st}"><i class="dot"></i>${svc(x.sid).short}${x.st === 'done' && x.h === 2 ? ' <b style="color:var(--h2)">!</b>' : ''}</span>`).join('')}</button>`;
  }
  if (VS.mmode === 'svc') {
    const o = a[SVI[VS.msvc]];
    if (!o.plan) return `<button class="${cls}" data-act="mday" data-d="${d}">${dh()}<span class="empty-note">일정 없음</span></button>`;
    const r = pct(o.done, o.plan - o.cancel);
    return `<button class="${cls}" data-act="mday" data-d="${d}">${dh(fut ? '' : `<span class="rate" style="--c:${r >= 98 ? 'var(--st-done)' : 'var(--st-late)'}">${r}%</span>`)}
      <span class="big">${fut ? o.plan : `${o.done}<small style="font-size:13px;color:var(--muted)">/${o.plan}</small>`}</span>
      <div class="hbar"><i style="width:${fut ? 0 : r}%;background:${sc(VS.msvc)}"></i></div>
      <span class="cl">${fut ? '계획' : `${o.miss ? `<span class="mx">미수행 ${o.miss}</span>` : ''}${o.late ? ` <span class="mx" style="color:var(--st-late)">지연 ${o.late}</span>` : ''}${o.cancel ? ` 취소 ${o.cancel}` : ''}`}</span></button>`;
  }
  const tp = a.reduce((s, o) => s + o.plan, 0), td = a.reduce((s, o) => s + o.done, 0), tc = a.reduce((s, o) => s + o.cancel, 0), r = pct(td, tp - tc);
  if (!tp) return `<button class="${cls}" data-act="mday" data-d="${d}">${dh()}<span class="empty-note">일정 없음</span></button>`;
  return `<button class="${cls}" data-act="mday" data-d="${d}">${dh(fut ? `<span class="rate" style="--c:var(--st-plan)">계획 ${tp}</span>` : `<span class="rate" style="--c:${r >= 98 ? 'var(--st-done)' : isT ? 'var(--st-prog)' : 'var(--st-late)'}">${r}%</span>`)}
    ${a.map((o, i) => o.plan ? `<span class="cl"><i class="sw" style="--c:${sc(SV[i].id)}"></i>${SV[i].short}${o.miss ? ` <span class="mx">${o.miss}</span>` : ''}${o.late ? ` <span class="mx" style="color:var(--st-late)">${o.late}</span>` : ''}<b>${fut ? o.plan : `${o.done}/${o.plan}`}</b></span>` : '').join('')}</button>`;
}
function workerGrid(days, M) {
  const ws = [...W.values()].filter(w => w.sid === VS.msvc);
  return `<div class="tblwrap"><table class="wgrid"><thead><tr><th style="text-align:left;position:sticky;left:0;background:var(--surface)">담당자 (${esc(svc(VS.msvc).role)})</th>${days.map(d => { const dt = toD(d); return `<th style="${d === TODAY ? 'color:var(--accent)' : dt.getDay() === 0 ? 'color:var(--st-miss)' : ''}">${dt.getDate()}</th>`; }).join('')}<th class="r">합계</th></tr></thead><tbody>
  ${ws.map(w => { let t = 0; return `<tr><td class="wn">${esc(w.name)} <small style="color:var(--muted)">${EMD[w.e]} · ${w.n}명</small></td>${days.map(d => { const o = M.workers[w.id + '_' + d]; if (!o) return '<td></td>'; t += o.n; const c = d > TODAY ? 'pl' : o.miss ? 'bad' : o.late ? 'lt' : 'ok'; return `<td><span class="wc ${c}" data-act="mday" data-d="${d}" title="${sdate(d)} ${o.n}건${o.miss ? ` · 미수행 ${o.miss}` : ''}">${o.n}</span></td>`; }).join('')}<td class="r num">${t}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
function personHead(P) {
  return `<div class="panel" style="display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center"><b style="font-size:16px">${esc(P.name)}</b><span>${P.age}세 · ${P.sex} · ${EMD[P.e]} · ${HOUSE[P.house]}</span>
    <span style="color:var(--muted)">${P.en.map(en => `${svc(en.sid).short}(${en.text})`).join(' · ')}</span><button class="btn sm" data-act="open" data-rid="${P.id}" style="margin-left:auto">상세 보기</button></div>`;
}

/* ---------- 일간 ---------- */
async function renderDay() {
  const f = VS.f;
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="dprev" aria-label="이전 날">◀</button><h2 id="dtitle">${toD(VS.date).getFullYear()}년 ${dlabel(VS.date)}</h2><button class="btn" data-act="dnext" aria-label="다음 날">▶</button><button class="btn sm" data-act="dtoday">오늘</button></div>
    <span class="sub" id="dsubt"></span>
    <div class="seg" role="group" aria-label="보기" style="margin-left:auto"><button data-act="dsub" data-k="people" aria-pressed="${VS.dsub === 'people'}">수혜자별</button><button data-act="dsub" data-k="tl" aria-pressed="${VS.dsub === 'tl'}">담당자 타임라인</button></div></section>
  <div class="kpis" id="dkpi"></div>
  <div class="panel"><h3>서비스별 진행 <small>완료 / 계획</small></h3><div class="svcbars" id="dsvc"></div></div>
  <div class="dlay">
    <div class="panel" id="dmain">
      <div class="ctl" id="dfilters" style="margin-bottom:10px" ${VS.dsub === 'tl' ? 'hidden' : ''}>
        <input type="search" id="fq" placeholder="이름·번호 검색" value="${esc(f.q)}" style="width:150px" aria-label="검색">
        <select id="femd" aria-label="읍면"><option value="">전체 읍·면</option>${EMD.map((e, i) => `<option value="${i}" ${String(i) === f.emd ? 'selected' : ''}>${e}</option>`).join('')}</select>
        <select id="fsvc" aria-label="서비스"><option value="">전체 서비스</option>${SV.map(s => `<option value="${s.id}" ${String(s.id) === f.svc ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
        <select id="fst" aria-label="상태"><option value="">전체 상태</option>${[['issue', '지연·미수행'], ['bad', '건강이상'], ['prog', '진행중'], ['open', '미완료']].map(([k, l]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="fsort" aria-label="정렬">${[['risk', '주의 필요 순'], ['name', '이름순'], ['emd', '읍·면순']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label><input type="checkbox" id="fall" ${f.all ? 'checked' : ''}> 일정 없는 대상자 포함</label>
      </div>
      <div id="dbody"><p class="empty-note">불러오는 중…</p></div>
    </div>
    <aside class="rail"><div class="panel" id="dalerts"></div><div class="panel" id="dfeed"></div></aside>
  </div>`;
  await loadDay();
}
async function loadDay() {
  const d = VS.date;
  const j = await api('day', { date: d });
  if (VS.tab !== 'day' || VS.date !== d) return;
  j.recs.forEach(wrap);
  DAY = j;
  setCareCount(Object.values(j.risk).filter(o => o.level === 3).length);
  drawDay();
  if (VS.drawer != null) renderDrawer();
  updateClock();
}
const rkOf = rid => (DAY && DAY.risk[rid]) || { score: 0, level: 0, reasons: [] };
function drawDay() {
  if (VS.tab !== 'day' || !DAY) return;
  const recs = DAY.recs, d = DAY.date, isT = d === TODAY, fut = d > TODAY;
  document.getElementById('dtitle').textContent = `${toD(d).getFullYear()}년 ${dlabel(d)}`;
  document.getElementById('dsubt').textContent = isT ? `${hm(NOW)} 기준 · 30초마다 자동 갱신` : fut ? '계획만 등록된 날' : '지난 날의 기록';
  const c = { plan: 0, prog: 0, done: 0, late: 0, miss: 0, cancel: 0 };
  recs.forEach(x => c[x.st]++);
  const bad = recs.filter(x => x.st === 'done' && x.h === 2).length, tot = recs.length;
  document.getElementById('dkpi').innerHTML = [
    ['계획', tot, '', `수혜자 ${new Set(recs.map(x => x.rid)).size}명`],
    ['완료', c.done, 'var(--st-done)', `${pct(c.done, tot - c.cancel)}%`],
    ['진행중', c.prog, 'var(--st-prog)', '현재 방문 중'],
    ['예정', c.plan, 'var(--st-plan)', '시작 전'],
    ['지연', c.late, 'var(--st-late)', '예정 30분 경과'],
    ['미수행', c.miss, 'var(--st-miss)', '마감 후 미완료'],
    ['취소', c.cancel, 'var(--st-cancel)', '입원·부재 등'],
    ['건강이상', bad, 'var(--h2)', '상태 나쁨 보고']].map(([k, v, col, dd]) => `<div class="kpi"><span class="k">${col ? `<i class="dot" style="--c:${col}"></i>` : ''}${k}</span><span class="v">${fmt(v)}</span><span class="d">${dd}</span></div>`).join('');
  document.getElementById('dsvc').innerHTML = SV.map(s => {
    const o = { plan: 0, done: 0, prog: 0, late: 0, miss: 0, cancel: 0 }; recs.forEach(x => { if (x.sid === s.id) { o.plan++; if (x.st !== 'plan') o[x.st]++; } }); const p = o.plan || 1;
    return `<div class="sb"><div class="t"><span><i class="dot" style="--c:${sc(s.id)}"></i> ${s.name}</span><span><b>${o.done}</b> / ${o.plan}</span></div>
    <div class="hbar"><i style="width:${o.done / p * 100}%;background:var(--st-done)"></i><i style="width:${o.prog / p * 100}%;background:var(--st-prog)"></i><i style="width:${o.late / p * 100}%;background:var(--st-late)"></i><i style="width:${o.miss / p * 100}%;background:var(--st-miss)"></i><i style="width:${o.cancel / p * 100}%;background:var(--st-cancel)"></i></div></div>`;
  }).join('');
  document.getElementById('dfilters').hidden = VS.dsub === 'tl';
  document.getElementById('dbody').innerHTML = VS.dsub === 'tl' ? timeline(recs) : peopleTable(recs);
  renderSide(recs);
}
function chipFor(x) {
  const s = x.st, sv = svc(x.sid), shown = (s === 'prog' || s === 'done') && x.start != null ? x.start : x.t;
  const warn = s === 'done' && x.h === 2;
  const tip = `${sv.name} · 담당 ${x.w ? x.w.name : ''}\n예정 ${hm(x.t)}${x.start != null ? ` · 시작 ${hm(x.start)}` : ''}${x.end != null ? ` · 종료 ${hm(x.end)}` : ''}\n상태 ${STL[s]}${s === 'done' && x.h != null ? ` · 건강 ${HL[x.h]}` : ''}${x.flags.length ? ` (${x.flags.join(', ')})` : ''}${x.reason ? ` · 사유 ${x.reason}` : ''}${x.note ? `\n메모: ${x.note}` : ''}`;
  return `<span class="chip st-${s}${warn ? ' warn' : ''}" title="${esc(tip)}"><i class="dot"></i><span class="tm">${hm(shown)}</span>${s === 'done' ? (x.h != null ? `<i class="hd" style="--hc:var(--h${x.h})"></i>` : '완료') : s === 'plan' ? '' : STL[s]}${warn ? '<span class="ex">!</span>' : ''}</span>`;
}
function peopleTable(recs) {
  const f = VS.f, by = new Map();
  recs.forEach(x => { let a = by.get(x.rid); if (!a) { a = {}; by.set(x.rid, a); } a[x.sid] = x; });
  let rows = f.all ? [...R.values()] : [...R.values()].filter(r => by.has(r.id));
  const q = f.q.trim().toLowerCase();
  rows = rows.filter(r => {
    if (q && !(r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))) return false;
    if (f.emd !== '' && r.e !== +f.emd) return false;
    if (f.svc !== '' && !r.svc[+f.svc]) return false;
    const a = by.get(r.id) || {};
    const cells = f.svc !== '' ? [a[+f.svc]].filter(Boolean) : Object.values(a);
    if (f.st === 'issue' && !cells.some(x => x.st === 'late' || x.st === 'miss')) return false;
    if (f.st === 'bad' && !cells.some(x => x.st === 'done' && x.h === 2)) return false;
    if (f.st === 'prog' && !cells.some(x => x.st === 'prog')) return false;
    if (f.st === 'open' && !cells.some(x => x.st === 'plan' || x.st === 'late' || x.st === 'prog')) return false;
    return true;
  });
  const pri = r => { let p = rkOf(r.id).level * 10; Object.values(by.get(r.id) || {}).forEach(x => { if (x.st === 'late' || x.st === 'miss') p += 40; if (x.st === 'done' && x.h === 2) p += 30; }); return p; };
  if (f.sort === 'risk') { const pm = new Map(rows.map(r => [r.id, pri(r)])); rows.sort((a, b) => pm.get(b.id) - pm.get(a.id) || a.id - b.id); }
  else if (f.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  else rows.sort((a, b) => a.e - b.e || a.id - b.id);
  const legend = `<div class="legend" style="margin-bottom:8px">${Object.entries(STL).map(([k, l]) => `<span><i class="dot st-${k}"></i>${l}</span>`).join('')}<span>· 건강</span>${HL.map((l, i) => `<span><i class="dot" style="--c:var(--h${i})"></i>${l}</span>`).join('')}<span><b style="color:var(--h2)">!</b> 이상 보고</span><span style="color:var(--faint)">· 다른 요일 이용</span></div>`;
  return `${legend}<div class="ptbl"><table><thead><tr><th>수혜자 <span style="font-weight:400">(${rows.length}명)</span></th><th>읍·면</th>${SV.map(s => `<th><i class="dot" style="--c:${sc(s.id)}"></i> ${s.short}</th>`).join('')}</tr></thead><tbody>
  ${rows.map(r => { const a = by.get(r.id) || {}, l = rkOf(r.id).level; return `<tr class="pr" data-act="open" data-rid="${r.id}"><td><div class="pname"><span><b>${esc(r.name)}</b> <small style="color:var(--muted)">${r.age}·${r.sex}</small>${r.house === 0 ? '<em class="tag">독거</em>' : ''}${riskBadge(l)}</span><small>${r.code}</small></div></td><td>${EMD[r.e]}</td>
    ${SV.map(s => a[s.id] ? `<td>${chipFor(a[s.id])}</td>` : r.svc[s.id] ? '<td class="none">·</td>' : '<td></td>').join('')}</tr>`; }).join('') || `<tr><td colspan="9" class="empty-note">조건에 맞는 수혜자가 없습니다. 필터를 바꿔 보세요.</td></tr>`}
  </tbody></table></div>`;
}
function timeline(recs) {
  const sid = VS.wsvc, ws = [...W.values()].filter(w => w.sid === sid), T0 = 480, span = 660, isT = DAY.date === TODAY;
  const by = new Map(); recs.forEach(x => { if (x.sid !== sid) return; let a = by.get(x.wid); if (!a) { a = []; by.set(x.wid, a); } a.push(x); });
  const ax = []; for (let h = 8; h <= 19; h++) ax.push(`<span style="left:${(h * 60 - T0) / span * 100}%">${h}시</span>`);
  return `<div class="seg" style="margin-bottom:10px">${SV.map(s => `<button data-act="wsvc" data-k="${s.id}" aria-pressed="${s.id === sid}">${s.short}</button>`).join('')}</div>
  <div class="legend" style="margin-bottom:8px">${Object.entries(STL).map(([k, l]) => `<span><i class="dot st-${k}"></i>${l}</span>`).join('')}<span>빨간 테두리: 건강 이상</span></div>
  <div class="tblwrap"><div class="tl"><div class="tlr"><span></span><div class="axis">${ax.join('')}</div></div>
  ${ws.map(w => { const a = by.get(w.id) || []; return `<div class="tlr"><span class="wl"><span>${esc(w.name)}</span><small>${EMD[w.e]} · ${a.length}건</small></span><div class="track">
    ${a.map(x => { const st0 = x.start != null ? x.start : x.t; const en = x.end != null ? x.end : x.st === 'prog' ? Math.max(NOW, st0 + 2) : st0 + x.d; return `<span class="seg2 st-${x.st}${x.st === 'done' && x.h === 2 ? ' w' : ''}" data-act="open" data-rid="${x.rid}" style="left:${Math.max(0, st0 - T0) / span * 100}%;width:${Math.max(en - st0, 4) / span * 100}%" title="${esc(x.r ? x.r.name : '')} · ${hm(st0)} ${STL[x.st]}${x.st === 'done' && x.h != null ? ' · 건강 ' + HL[x.h] : ''}"></span>`; }).join('')}
    ${isT && NOW >= T0 && NOW <= T0 + span ? `<span class="nowl" style="left:${(NOW - T0) / span * 100}%"></span>` : ''}</div></div>`; }).join('')}
  </div></div>`;
}
function renderSide(recs) {
  const d = DAY.date, isT = d === TODAY, al = [];
  recs.forEach(x => {
    const s = svc(x.sid), nm = esc(x.r ? x.r.name : ''), wn = esc(x.w ? x.w.name : '');
    if (x.st === 'late') al.push({ sev: 2, rid: x.rid, c: 'var(--st-late)', t: `<b>${nm}</b> · ${s.short} 지연`, d: `예정 ${hm(x.t)}, 아직 시작 전 · 담당 ${wn}` });
    if (x.st === 'miss') al.push({ sev: 2, rid: x.rid, c: 'var(--st-miss)', t: `<b>${nm}</b> · ${s.short} 미수행`, d: `예정 ${hm(x.t)} · 담당 ${wn}` });
    if (x.st === 'done' && x.h === 2) al.push({ sev: rkOf(x.rid).level >= 2 ? 3 : 1, rid: x.rid, c: 'var(--h2)', t: `<b>${nm}</b> · ${s.short} 건강이상`, d: `${esc(x.flags.join(', ') || '상태 나쁨')} · ${hm(x.end)} 보고` });
  });
  if (isT) Object.entries(DAY.risk).forEach(([rid, o]) => { rid = +rid; if (o.level === 3 && !al.some(a => a.rid === rid)) { const r = R.get(rid); if (r) al.push({ sev: 2.5, rid, c: 'var(--st-miss)', t: `<b>${esc(r.name)}</b> · 위험군`, d: esc(o.reasons.slice(0, 2).join(' · ')) }); } });
  al.sort((a, b) => b.sev - a.sev);
  document.getElementById('dalerts').innerHTML = `<h3>주의 필요 <small>${al.length}건</small></h3>${al.slice(0, 14).map(a => `<div class="al" data-act="open" data-rid="${a.rid}"><span class="sev" style="--c:${a.c}"></span><span class="tx">${a.t}<small>${a.d}</small></span></div>`).join('') || '<p class="empty-note">확인이 필요한 항목이 없습니다.</p>'}${al.length > 14 ? `<p class="empty-note">외 ${al.length - 14}건은 표에서 '주의 필요 순'으로 확인</p>` : ''}`;
  const fe = document.getElementById('dfeed');
  if (d > TODAY) { fe.innerHTML = '<h3>수행 기록</h3><p class="empty-note">아직 오지 않은 날입니다. 계획된 일정만 표시됩니다.</p>'; return; }
  const ev = []; recs.forEach(x => { if (x.start != null) ev.push({ t: x.start, x, k: 'start' }); if (x.end != null) ev.push({ t: x.end, x, k: 'end' }); });
  ev.sort((a, b) => b.t - a.t);
  fe.innerHTML = `<h3>${isT ? '실시간 수행 기록' : '수행 기록'} <small>현장 앱 입력</small></h3><div class="feed">${ev.slice(0, 30).map(e => `<div class="fe"><span class="tm">${hm(e.t)}</span><span><b>${esc(e.x.r ? e.x.r.name : '')}</b> · ${svc(e.x.sid).short} ${e.k === 'start' ? '시작' : '완료'}${e.k === 'end' && e.x.h != null ? ` · 건강 <span style="color:var(--h${e.x.h});font-weight:600">${HL[e.x.h]}</span>` : ''}<br><small style="color:var(--muted)">${esc(e.x.w ? e.x.w.name : '')} · ${e.x.r ? EMD[e.x.r.e] : ''}</small></span></div>`).join('') || '<p class="empty-note">아직 기록이 없습니다.</p>'}</div>`;
}

/* ---------- 수혜자 상세 ---------- */
async function renderDrawer() {
  const box = document.getElementById('drawerbox');
  if (VS.drawer == null) { box.innerHTML = ''; return; }
  const id = VS.drawer, r = R.get(id);
  if (!r) return;
  const date = VS.tab === 'day' ? VS.date : TODAY;
  let j;
  try { j = await api('recipient', { id, date }); } catch (e) { toast(e.message); return; }
  if (VS.drawer !== id) return;
  const o = j.risk, care = j.care;
  const days = []; for (let d = j.from; d <= TODAY; d = addDays(d, 1)) days.push(d);
  const rowsH = r.en.map(en => {
    const g = j.grid[en.sid] || {};
    return `<span>${svc(en.sid).short}</span>` + days.map(d => { const c = g[d]; if (!c) return '<i></i>'; const cl = c.st === 'done' ? 'g' + c.h : c.st === 'miss' ? 'gm' : c.st === 'cancel' ? 'gc' : 'gp'; return `<i class="${cl}" title="${sdate(d)} ${svc(en.sid).short} ${STL[c.st]}${c.st === 'done' && c.h != null ? ' · ' + HL[c.h] : ''}"></i>`; }).join('');
  }).join('');
  const recs = j.recs.map(wrap).sort((a, b) => a.t - b.t);
  box.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-label="${esc(r.name)} 상세">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><span class="label">${r.code}</span><h2>${esc(r.name)} ${riskBadge(o.level)}</h2></div><button class="btn" data-act="close" aria-label="닫기">닫기</button></div>
    <div class="facts"><div><span>나이</span>${r.age}세 · ${r.sex}</div><div><span>거주</span>${EMD[r.e]}</div><div><span>가구</span>${HOUSE[r.house]}</div><div><span>위험 점수</span>${o.score}점 (${LV[o.level] || '정상'})</div></div>
    ${o.reasons.length ? `<div><span class="label">위험 판단 근거</span><ul class="reasons">${o.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${ROLE() === 'central' || ROLE() === 'admin' ? `<button class="btn ${care ? '' : 'pri'}" data-act="caretoggle" data-rid="${id}" data-on="${care ? 1 : 0}">${care ? '집중관리 해제' : '집중관리 대상 지정'}</button>` : ''}<button class="btn" data-act="toperson" data-rid="${id}">월간 달력 보기</button></div>
    ${care ? `<div class="empty-note">집중관리 처리 상태: <b>${esc(care.status)}</b>${care.memo ? ` · ${esc(care.memo)}` : ''}</div>` : ''}
    <div><span class="label">이용 서비스</span><div class="svl" style="margin-top:6px">${r.en.map(en => { const w = W.get(en.wid), s = svc(en.sid); return `<div class="it"><i class="dot" style="--c:${sc(en.sid)}"></i><span>${s.name} <small>${esc(en.text)} · ${esc(s.vendor)}</small></span><span style="font-size:12px;color:var(--muted)">${esc(w ? w.name : '')} ${esc(s.role)}</span></div>`; }).join('')}</div></div>
    <div><span class="label">${dlabel(date)} 일정</span><div class="tline" style="margin-top:6px">${recs.length ? recs.map(x => `<div class="ti"><span class="num" style="color:var(--muted)">${hm(x.t)}</span><span>${chipFor(x)} ${svc(x.sid).name}${x.st === 'done' ? ` · ${hm(x.start)}~${hm(x.end)}${x.h != null ? ` · 건강 ${HL[x.h]}` : ''}` : ''}${x.flags.length ? ` · <b style="color:var(--h2)">${esc(x.flags.join(', '))}</b>` : ''}${x.reason ? ` · ${esc(x.reason)}` : ''}${x.note ? `<br><small style="color:var(--muted)">메모: ${esc(x.note)}</small>` : ''}</span></div>`).join('') : '<p class="empty-note">이 날은 일정이 없습니다.</p>'}</div></div>
    <div><span class="label">최근 30일 건강상태</span><div class="hgrid" style="grid-template-columns:44px repeat(${days.length},minmax(0,1fr));margin-top:6px">${rowsH}<span></span>${days.map((d, i) => `<span style="text-align:center">${i % 7 === 2 || d === TODAY ? sdate(d) : ''}</span>`).join('')}</div>
      <div class="legend" style="margin-top:6px"><span><i class="dot" style="--c:var(--h0)"></i>좋음</span><span><i class="dot" style="--c:var(--h1)"></i>보통</span><span><i class="dot" style="--c:var(--h2)"></i>나쁨</span><span><i class="dot" style="--c:var(--st-miss)"></i>테두리: 미수행</span></div></div>
    <div><span class="label">담당자 이상 보고</span>${j.notes.length ? `<ul class="reasons" style="margin-top:6px">${j.notes.map(x => { const w = W.get(x.wid); return `<li><b>${sdate(x.date)}</b> ${svc(x.sid).short} · ${esc(w ? w.name : '')}: ${esc(x.flags.join(', ') || '상태 나쁨')}${x.note ? ` (${esc(x.note)})` : ''}</li>`; }).join('')}</ul>` : '<p class="empty-note">최근 30일 이상 보고가 없습니다.</p>'}</div>
  </aside>`;
}

/* ---------- 집중관리·발굴 ---------- */
async function renderCare() {
  loading();
  const C = await api('care');
  if (VS.tab !== 'care') return;
  setCareCount(C.counts[3]);
  view.innerHTML = `
  <section class="vhead"><h2>집중관리 대상 · 발굴신고</h2><span class="sub">최근 ${RULE.WINDOW_DAYS}일 현장 기록으로 자동 판정</span></section>
  <div class="kpis">
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-miss)"></i>위험</span><span class="v">${C.counts[3]}</span><span class="d">총괄 담당자 즉시 알림</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-late)"></i>주의</span><span class="v">${C.counts[2]}</span><span class="d">주간 점검</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-plan)"></i>관심</span><span class="v">${C.counts[1]}</span><span class="d">추이 관찰</span></div>
    <div class="kpi"><span class="k">수동 지정</span><span class="v">${C.manual}</span><span class="d">담당자가 직접 지정</span></div>
    <div class="kpi"><span class="k">발굴신고 처리 중</span><span class="v">${C.reports.filter(x => x.status !== '종결').length}</span><span class="d">전체 ${C.reports.length}건</span></div>
  </div>
  <div class="clay">
    <div class="panel"><h3>집중관리 대상 <small>위험·주의 등급 + 지정 ${C.list.length}명 · 이름을 누르면 상세</small></h3>
      <div class="tblwrap" style="max-height:72vh"><table class="ctbl"><thead><tr><th>등급</th><th>수혜자</th><th>판단 근거</th><th>처리</th></tr></thead><tbody>
      ${C.list.map(o => { const r = R.get(o.rid); if (!r) return ''; const c = o.care || {}; return `<tr><td>${riskBadge(o.level) || '<em class="tag">지정</em>'}<div class="num" style="font-size:11px;color:var(--muted);margin-top:3px">${o.score}점</div></td>
        <td><a href="#care" data-act="open" data-rid="${r.id}" style="color:var(--ink);font-weight:600">${esc(r.name)}</a><div style="font-size:11.5px;color:var(--muted)">${r.age}세 · ${EMD[r.e]} · ${HOUSE[r.house]}</div></td>
        <td style="font-size:12.5px;min-width:200px">${o.reasons.slice(0, 3).map(esc).join('<br>') || '수동 지정'}</td>
        <td style="min-width:150px"><select data-care="status" data-rid="${r.id}" aria-label="처리 상태">${['미확인', '전화 확인', '방문 조치', '서비스 연계', '종결'].map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <input type="text" data-care="memo" data-rid="${r.id}" value="${esc(c.memo || '')}" placeholder="조치 메모" style="margin-top:4px;width:100%" aria-label="조치 메모"></td></tr>`; }).join('') || '<tr><td colspan="4" class="empty-note">집중관리 대상이 없습니다.</td></tr>'}
      </tbody></table></div></div>
    <div class="rail">
      <div class="panel"><h3>발굴신고 접수함</h3><div style="display:flex;flex-direction:column;gap:8px">
        ${C.reports.map(x => `<div class="rep"><div class="h"><b>${esc(x.name)} (${esc(x.age || '-')}세) · ${esc(x.emd || '')}</b><select data-rep="${x.id}" aria-label="처리 단계">${['접수', '현장확인', '서비스연계', '종결'].map(s => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="needs">${(x.needs || []).map(n => `<em class="tag" style="margin:0">${esc(n)}</em>`).join('')}</div><span>${esc(x.reason)}</span><small style="color:var(--muted)">${esc(x.created_at.slice(0, 16))} · 신고 ${esc(x.reporter)}</small></div>`).join('') || '<p class="empty-note">접수된 신고가 없습니다.</p>'}
      </div></div>
      <div class="panel"><h3>새 발굴신고 <small>현장 앱에서도 같은 양식으로 접수됩니다</small></h3>${reportForm()}</div>
      <div class="panel"><h3>적용 중인 위험 판정 규칙 <small>config.php에서 조정</small></h3><ol class="rules">
        <li>건강상태 '나쁨' 1회당 ${RULE.BAD_POINT}점</li><li>서로 다른 서비스 2곳 이상에서 이상 보고 시 ${RULE.MULTI_SVC_POINT}점</li><li>미수행 1회당 ${RULE.MISS_POINT}점, 오늘 지연·미시작 ${RULE.LATE_POINT}점, 독거이면서 이상 보고 ${RULE.ALONE_POINT}점</li><li>합계 ${RULE.LEVEL_DANGER}점 이상 위험, ${RULE.LEVEL_WARN}점 이상 주의, ${RULE.LEVEL_WATCH}점 이상 관심</li></ol></div>
    </div>
  </div>`;
}
function reportForm() {
  return `<form class="form" id="repform">
    <label>대상자 이름<input id="rn" required placeholder="예: 홍○동"></label>
    <label>나이<input id="ra" type="number" min="40" max="110" placeholder="80"></label>
    <label>읍·면<select id="re">${EMD.map(e => `<option>${e}</option>`).join('')}</select></label>
    <label>신고자<input id="rb" placeholder="이름 (소속)"></label>
    <div class="full"><span style="font-size:12px;color:var(--muted)">필요해 보이는 서비스</span><div class="checks">${SV.map(s => `<label><input type="checkbox" name="rneed" value="${s.name}">${s.name}</label>`).join('')}</div></div>
    <label class="full">발굴 사유<textarea id="rw" rows="3" required placeholder="현장에서 본 상황을 적어 주세요"></textarea></label>
    <div class="full"><button class="btn pri" type="submit">신고 접수</button></div>
  </form>`;
}

/* ---------- 공통: 계획 상태 표시, 모달 ---------- */
const PLC = { '작성중': 'var(--st-plan)', '제출': 'var(--st-prog)', '승인': 'var(--st-done)', '반려': 'var(--st-miss)' };
const planPill = st => st ? `<span class="pill" style="--c:${PLC[st] || 'var(--st-plan)'}">${st}</span>` : '';
const ymLabel = ym => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;
const addMonths = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthEnd = ym => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0); return toS(d); };
function modal(html, locked) {
  document.getElementById('modalbox').innerHTML = `<div class="scrim" ${locked ? '' : 'data-act="mclose"'}></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const f = document.querySelector('.modal input, .modal textarea, .modal select'); if (f) f.focus();
}
function mclose() { document.getElementById('modalbox').innerHTML = ''; }
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
function pwModal(forced) {
  modal(`<h2>${forced ? '처음 로그인했습니다. 비밀번호를 바꿔 주세요' : '비밀번호 변경'}</h2>
    <form class="form" id="pwform"><label class="full">지금 비밀번호<input id="pw0" type="password" autocomplete="current-password" required></label>
    <label class="full">새 비밀번호 <small>영문과 숫자를 섞어 8자 이상</small><input id="pw1" type="password" autocomplete="new-password" required></label>
    <label class="full">새 비밀번호 확인<input id="pw2" type="password" autocomplete="new-password" required></label>
    <div class="full mact">${forced ? '' : '<button type="button" class="btn" data-act="mclose">닫기</button>'}<button class="btn pri" type="submit">바꾸기</button></div></form>`, forced);
}
function showTempPw(title, login, pw) {
  modal(`<h2>${esc(title)}</h2><p>아래 처음 비밀번호를 당사자에게 전달하세요. <b>이 창을 닫으면 다시 볼 수 없습니다.</b> 당사자는 첫 로그인 때 비밀번호를 바꾸게 됩니다.</p>
    <div class="tempw"><span>아이디 <b>${esc(login)}</b></span><span>처음 비밀번호 <b class="num" id="tpw">${esc(pw)}</b></span><button class="btn sm" data-act="copy" data-v="${esc(pw)}">복사</button></div>
    <div class="mact"><button class="btn pri" data-act="mclose">확인했어요</button></div>`);
}

/* ---------- 긴급 알림 띠 + 탭 숫자 ---------- */
async function loadAlerts() {
  try {
    const A = await api('alerts');
    const canHandle = ROLE() !== 'viewer';
    document.getElementById('banner').innerHTML = A.emergencies.map(m => `<div class="emg" role="alert"><b>긴급</b><span>${esc(m.at.slice(11, 16))} · ${esc(m.rname)} (${esc(m.emd)}) · ${esc(m.kind)}${m.note ? ` — ${esc(m.note)}` : ''}<small>신고 ${esc(m.uname || '')}${m.status === '확인중' ? ` · 확인 중: ${esc(m.memo || '')}` : ''}</small></span><span class="emg-a"><button class="btn sm" data-act="open" data-rid="${m.recipient_id}">어르신 보기</button>${canHandle ? `<button class="btn sm pri" data-act="emg" data-id="${m.id}">조치 입력</button>` : ''}</span></div>`).join('');
    if (ROLE() === 'central' || ROLE() === 'admin') setBadge('approve', A.pending_plans + A.change_requests);
    if (ROLE() === 'org') { const st = A.my_plan && A.my_plan.status; setBadge('plan', st === '작성중' || st === '반려' ? '!' : 0); }
  } catch (e) { console.error(e); }
}

/* ---------- 월간 계획 (수행기관 관리자) ---------- */
function workerOpts(sel) { return [...W.values()].filter(w => w.sid === SV[0].id && w.active).map(w => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${esc(w.name)} · ${EMD[w.e]}</option>`).join(''); }
async function renderPlan() {
  loading();
  if (!VS.pym) VS.pym = addMonths(TODAY.slice(0, 7), 1);
  const ym = VS.pym, sid = SV[0].id;
  const [P, M] = await Promise.all([api('plans', { ym }), api('month', { y: +ym.slice(0, 4), m: +ym.slice(5, 7), svc: sid })]);
  if (VS.tab !== 'plan') return;
  const p = P.list[0], st = p.status, editable = st === '작성중' || st === '반려';
  const days = []; for (let d = M.from; d <= M.to; d = addDays(d, 1)) days.push(d);
  const ws = [...W.values()].filter(w => w.sid === sid && (w.active || days.some(d => M.workers[w.id + '_' + d])));
  const dleft = Math.round((toD(P.deadline) - toD(TODAY)) / 864e5);
  const due = `제출 마감 ${sdate(P.deadline)}${dleft >= 0 ? ` (D-${dleft})` : ' (지남)'}`;
  const msg = {
    '작성중': p.total ? `초안이 준비되었습니다. 공휴일·휴가 등 바뀐 부분만 고치고, 점검 결과를 확인한 뒤 제출하세요. ${due}.` : '아직 일정이 없습니다. [초안 만들기]를 누르면 어르신별 이용 규칙대로 한 달 일정이 만들어집니다.',
    '반려': `반려되었습니다. 사유: ${p.note || '-'} 고친 뒤 다시 제출하세요. ${due}.`,
    '제출': `${(p.submitted_at || '').slice(0, 16)}에 제출했습니다. 총괄 담당자의 승인을 기다리는 중이며, 그동안은 일정을 고칠 수 없습니다.`,
    '승인': '승인되어 일정이 확정되었습니다. 바꿀 일정이 있으면 표에서 날짜를 눌러 해당 일정의 [변경 요청]을 올리세요.',
  }[st];
  const step = !p.total ? 1 : st === '제출' ? 4 : st === '승인' ? 5 : 2;
  const steps = ['초안 만들기', '고치기', '점검 확인', '제출', '승인'];
  const chk = (ok, label, detail) => `<div class="chk ${ok ? 'ok' : 'warn'}"><b>${ok ? '이상 없음' : '확인 필요'}</b><span>${label}</span>${detail || ''}</div>`;
  const recips = [...R.values()];
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="pprev" aria-label="이전 달">◀</button><h2>${ymLabel(ym)} 계획</h2><button class="btn" data-act="pnext" aria-label="다음 달">▶</button></div>${planPill(st)}<span class="sub">${esc(SV[0].vendor)} · 일정 ${fmt(p.total)}건</span></section>
  <div class="panel planbox">
    <ol class="stepper">${steps.map((s, i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''}"><span>${i + 1}</span>${s}</li>`).join('')}</ol>
    <p class="planmsg ${st === '반려' ? 'bad' : ''}">${esc(msg)}</p>
    <div class="ctl">${editable ? `<button class="btn" data-act="plan-draft">${p.total ? '빠진 일정 규칙대로 채우기' : '초안 만들기'}</button><button class="btn pri" data-act="plan-submit" ${p.total ? '' : 'disabled'}>점검 확인하고 제출하기</button>` : ''}</div>
  </div>
  <div class="grid2">
    <div class="panel"><h3>제출 전 자동 점검</h3>
      ${chk(!p.shortfall.length, `계약 횟수 미달 ${p.shortfall.length}명`, p.shortfall.length ? `<ul>${p.shortfall.slice(0, 12).map(x => `<li>${esc(x.name)}: ${x.expected}회 중 ${x.planned}회 계획</li>`).join('')}${p.shortfall.length > 12 ? `<li>외 ${p.shortfall.length - 12}명</li>` : ''}</ul>` : '')}
      ${chk(!p.overlaps.length, `같은 담당자 시간 겹침 ${p.overlaps.length}건`, p.overlaps.length ? `<ul>${p.overlaps.slice(0, 10).map(x => `<li>${sdate(x.date)} ${esc(x.worker)}: ${esc(x.a)} / ${esc(x.b)}</li>`).join('')}</ul>` : '')}
      ${chk(!p.sundays, `일요일 일정 ${p.sundays}건`, '')}
    </div>
    <div class="panel"><h3>한꺼번에 고치기 ${editable ? '' : '<small>제출·승인된 달은 쓸 수 없습니다</small>'}</h3>
      <fieldset class="tools" ${editable ? '' : 'disabled'}>
        <div class="tool"><b>날짜 일괄 이동</b><small>공휴일 등 하루 일정을 다른 날로 옮깁니다</small><div class="ctl"><input type="date" id="bm-from" min="${M.from}" max="${M.to}" aria-label="옮길 날"> → <input type="date" id="bm-to" aria-label="옮겨 갈 날"><button class="btn sm" data-act="bulk-move">옮기기</button></div></div>
        <div class="tool"><b>담당자 일괄 이관</b><small>휴가·퇴사한 담당자의 일정을 다른 담당자에게 넘깁니다</small><div class="ctl"><select id="bt-from" aria-label="보내는 담당자">${workerOpts(null)}</select> → <select id="bt-to" aria-label="받는 담당자">${workerOpts(null)}</select></div>
          <div class="ctl"><input type="date" id="bt-d1" value="${M.from > TODAY ? M.from : addDays(TODAY, 1)}" aria-label="시작일"> ~ <input type="date" id="bt-d2" value="${M.to}" aria-label="종료일"><label><input type="checkbox" id="bt-perm"> 앞으로도 계속 담당</label><button class="btn sm" data-act="bulk-transfer">넘기기</button></div></div>
        <div class="tool"><b>일정 추가</b><small>이동 지원 요청 등 규칙에 없는 방문을 넣습니다</small><div class="ctl"><input type="search" id="sa-r" list="sa-list" placeholder="어르신 이름 또는 번호" style="width:180px" aria-label="어르신"><datalist id="sa-list">${recips.map(r => `<option value="${esc(r.name)} (${r.code})">${EMD[r.e]}</option>`).join('')}</datalist><input type="date" id="sa-d" min="${M.from}" max="${M.to}" aria-label="날짜"><input type="time" id="sa-t" value="10:00" step="300" aria-label="시각"><button class="btn sm" data-act="sched-add">추가</button></div></div>
      </fieldset>
    </div>
  </div>
  <div class="mlay">
    <div class="panel" style="padding:10px"><h3>담당자 × 날짜 <small>숫자는 방문 건수 · 칸을 누르면 오른쪽에서 일정을 고칩니다</small></h3>
      <div class="tblwrap"><table class="wgrid"><thead><tr><th style="text-align:left;position:sticky;left:0;background:var(--surface)">담당자</th>${days.map(d => { const dt = toD(d); return `<th style="${dt.getDay() === 0 ? 'color:var(--st-miss)' : dt.getDay() === 6 ? 'color:var(--st-prog)' : ''}">${dt.getDate()}<br><small>${WD[dt.getDay()]}</small></th>`; }).join('')}<th class="r">합계</th></tr></thead><tbody>
      ${ws.map(w => { let t = 0; return `<tr><td class="wn">${esc(w.name)}${w.active ? '' : ' <em class="tag">정지</em>'} <small style="color:var(--muted)">${EMD[w.e]}</small></td>${days.map(d => { const o = M.workers[w.id + '_' + d]; const selc = VS.pcell && VS.pcell.wid === w.id && VS.pcell.date === d; if (!o) return `<td><span class="wc ${selc ? 'sel' : ''}" data-act="pcell" data-w="${w.id}" data-d="${d}" style="color:transparent">0</span></td>`; t += o.n; return `<td><span class="wc ${d <= TODAY ? 'ok' : 'pl'} ${selc ? 'sel' : ''}" data-act="pcell" data-w="${w.id}" data-d="${d}" title="${sdate(d)} ${o.n}건">${o.n}</span></td>`; }).join('')}<td class="r num">${t}</td></tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="rail"><div class="panel" id="pday"><h3>일정 고치기</h3><p class="empty-note">왼쪽 표에서 담당자와 날짜 칸을 누르세요.</p></div></div>
  </div>`;
  if (VS.pcell) loadPlanDay();
}
async function loadPlanDay() {
  const el = document.getElementById('pday'); if (!el || !VS.pcell) return;
  const { wid, date } = VS.pcell;
  let j; try { j = await api('plan_day', { wid, date }); } catch (e) { toast(e.message); return; }
  const w = W.get(wid);
  el.innerHTML = `<h3>${sdate(date)}(${WD[toD(date).getDay()]}) ${esc(w ? w.name : '')} <small>${j.recs.length}건</small></h3>` + (j.recs.map(x => {
    wrap(x);
    const lock = x.lock, canReq = x.date >= TODAY && !(lock && lock.includes('수행기록'));
    return `<div class="pd" data-id="${x.id}"><div><b>${esc(x.r ? x.r.name : '')}</b> <small style="color:var(--muted)">${x.r ? EMD[x.r.e] : ''}</small> ${x.st !== 'plan' ? `<span class="chip st-${x.st}"><i class="dot"></i>${STL[x.st]}</span>` : ''}</div>
      ${lock ? `<div class="ctl"><span class="num">${hm(x.t)}</span>${canReq ? `<button class="btn sm" data-act="reqchange" data-id="${x.id}" data-date="${x.date}" data-time="${hm(x.t)}">변경 요청</button>` : ''}</div><small class="empty-note">${esc(lock)}</small>`
      : `<div class="ctl"><input type="date" value="${x.date}" data-f="date" aria-label="날짜"><input type="time" value="${hm(x.t)}" data-f="time" step="300" aria-label="시각"><select data-f="wid" aria-label="담당자">${workerOpts(x.wid)}</select></div><div class="ctl"><button class="btn sm pri" data-act="sched-save" data-id="${x.id}">저장</button><button class="btn sm" data-act="sched-del" data-id="${x.id}">이 날 방문 빼기</button></div>`}</div>`;
  }).join('') || '<p class="empty-note">이 날은 일정이 없습니다. 위의 [일정 추가]로 넣을 수 있습니다.</p>');
}
function reqModal(id, date, time) {
  modal(`<h2>일정 변경 요청</h2><p>확정된 일정은 총괄 담당자가 승인해야 바뀝니다.</p>
    <form class="form" id="reqform" data-id="${id}"><label>바꿀 날짜<input type="date" id="rq-d" value="${date}" min="${TODAY}" required></label><label>바꿀 시각<input type="time" id="rq-t" value="${time}" step="300" required></label>
    <label class="full">이유<textarea id="rq-w" rows="3" required placeholder="예: 어르신 병원 진료와 겹침"></textarea></label>
    <div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">요청 올리기</button></div></form>`);
}

/* ---------- 계획 승인 (총괄 담당자) ---------- */
async function renderApprove() {
  loading();
  if (!VS.aym) VS.aym = addMonths(TODAY.slice(0, 7), 1);
  const [P, C] = await Promise.all([api('plans', { ym: VS.aym }), api('change_requests')]);
  if (VS.tab !== 'approve') return;
  const cnt = s => P.list.filter(p => p.status === s).length;
  const svcName = sid => (svc(sid) || {}).short || '';
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="aprev" aria-label="이전 달">◀</button><h2>${ymLabel(VS.aym)} 계획 승인</h2><button class="btn" data-act="anext" aria-label="다음 달">▶</button></div><span class="sub">제출 마감 ${sdate(P.deadline)}</span></section>
  <div class="kpis">${['제출', '작성중', '반려', '승인'].map(s => `<div class="kpi"><span class="k"><i class="dot" style="--c:${PLC[s]}"></i>${s === '제출' ? '승인 대기' : s}</span><span class="v">${cnt(s)}</span><span class="d">7개 기관 중</span></div>`).join('')}
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-late)"></i>변경 요청 대기</span><span class="v">${C.list.filter(c => c.status === '대기').length}</span><span class="d">아래 목록</span></div></div>
  <div class="panel"><h3>기관별 계획</h3><div class="tblwrap"><table class="ctbl"><thead><tr><th>서비스 · 수행기관</th><th>상태</th><th>제출</th><th class="r">일정</th><th>자동 점검</th><th>처리</th></tr></thead><tbody>
    ${P.list.map(p => `<tr><td><i class="dot" style="--c:${sc(p.sid)}"></i> <b>${esc(svcName(p.sid))}</b><div style="font-size:12px;color:var(--muted)">${esc(p.vendor)}</div></td>
      <td>${planPill(p.status)}${p.status === '반려' && p.note ? `<div style="font-size:12px;color:var(--muted);max-width:220px">${esc(p.note)}</div>` : ''}</td>
      <td style="font-size:12.5px">${p.submitted_at ? `${esc(p.submitted_at.slice(5, 16))}<div style="color:var(--muted)">${esc(p.submitted_by || '')}</div>` : '-'}</td>
      <td class="r num">${fmt(p.total)}</td>
      <td style="font-size:12.5px;min-width:200px">${p.shortfall.length ? `<span class="warnx">횟수 미달 ${p.shortfall.length}명</span>` : '<span class="okx">횟수 이상 없음</span>'} · ${p.overlaps.length ? `<span class="warnx">겹침 ${p.overlaps.length}</span>` : '겹침 없음'}${p.sundays ? ` · 일요일 ${p.sundays}` : ''}
        ${p.shortfall.length || p.overlaps.length ? `<details><summary>자세히</summary><ul>${p.shortfall.slice(0, 8).map(x => `<li>${esc(x.name)} ${x.expected}회 중 ${x.planned}회</li>`).join('')}${p.overlaps.slice(0, 5).map(x => `<li>${sdate(x.date)} ${esc(x.worker)} 겹침</li>`).join('')}</ul></details>` : ''}</td>
      <td><div class="ctl"><button class="btn sm" data-act="plancal" data-s="${p.sid}">달력 보기</button>${p.status === '제출' ? `<button class="btn sm pri" data-act="approve" data-s="${p.sid}">승인</button><button class="btn sm" data-act="reject" data-s="${p.sid}">반려</button>` : ''}</div></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="panel"><h3>일정 변경 요청 <small>확정된 일정을 바꾸려는 요청 · 승인하면 바로 일정에 반영됩니다</small></h3><div class="tblwrap"><table class="ctbl"><thead><tr><th>요청</th><th>어르신 · 서비스</th><th>현재 → 변경</th><th>이유</th><th>처리</th></tr></thead><tbody>
    ${C.list.map(c => `<tr><td style="font-size:12.5px">${esc(c.requested_at.slice(5, 16))}<div style="color:var(--muted)">${esc(c.uname || '')}</div></td><td><b>${esc(c.rname)}</b><div style="font-size:12px;color:var(--muted)">${esc(svcName(+c.service_id))}</div></td>
      <td class="num" style="font-size:12.5px">${sdate(c.date)} ${hm(+c.planned_min)} → <b>${sdate(c.new_date)} ${hm(+c.new_min)}</b></td><td style="font-size:12.5px;max-width:260px">${esc(c.reason || '')}</td>
      <td>${c.status === '대기' ? `<div class="ctl"><button class="btn sm pri" data-act="cr-ok" data-id="${c.id}">승인</button><button class="btn sm" data-act="cr-no" data-id="${c.id}">반려</button></div>` : `${planPill(c.status)}<div style="font-size:12px;color:var(--muted)">${esc(c.dname || '')}${c.note ? ` · ${esc(c.note)}` : ''}</div>`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-note">변경 요청이 없습니다.</td></tr>'}
  </tbody></table></div></div>`;
}
function reasonModal(title, act, attrs) {
  modal(`<h2>${esc(title)}</h2><form class="form" id="reasonform" data-act2="${act}" ${attrs}><label class="full">사유 <small>수행기관에 그대로 전달됩니다</small><textarea id="rs-w" rows="3" required></textarea></label>
    <div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">반려하기</button></div></form>`);
}

/* ---------- 계정 관리 ---------- */
async function renderAccounts() {
  loading();
  const U = await api('users');
  if (VS.tab !== 'accounts') return;
  const creatable = { admin: ['org', 'central', 'viewer', 'admin'], central: ['org', 'viewer'], org: ['worker'] }[ROLE()] || [];
  const q = (VS.uq || '').toLowerCase();
  const rows = U.list.filter(u => !q || u.login_id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  const allSv = ROLE() === 'org' ? SV : SV;
  view.innerHTML = `
  <section class="vhead"><h2>${ROLE() === 'org' ? '수행자 계정' : '계정 관리'}</h2><span class="sub">${rows.length}개 계정</span></section>
  <div class="clay">
    <div class="panel"><h3>계정 목록</h3><div class="ctl" style="margin-bottom:8px"><input type="search" id="uq" placeholder="아이디·이름 검색" value="${esc(VS.uq || '')}" aria-label="검색"></div>
      <div class="tblwrap" style="max-height:70vh"><table class="ctbl"><thead><tr><th>이름 · 아이디</th><th>역할 · 소속</th><th>마지막 로그인</th><th>관리</th></tr></thead><tbody>
      ${rows.map(u => `<tr${+u.active ? '' : ' style="opacity:.55"'}><td><b>${esc(u.name)}</b><div class="num" style="font-size:12px;color:var(--muted)">${esc(u.login_id)}${u.phone ? ` · ${esc(u.phone)}` : ''}</div></td>
        <td style="font-size:12.5px">${esc(U.roles[u.role] || u.role)}<div style="color:var(--muted)">${esc(u.short || '')}${u.emd ? ` · ${esc(u.emd)}` : ''}${u.role === 'worker' ? ` · 담당 ${u.n}명` : ''}</div></td>
        <td class="num" style="font-size:12.5px">${u.last_login ? esc(u.last_login.slice(0, 16)) : '없음'}${u.locked_until && u.locked_until > new Date().toISOString().slice(0, 19).replace('T', ' ') ? '<div style="color:var(--st-miss)">잠김</div>' : ''}</td>
        <td><div class="ctl"><button class="btn sm" data-act="user-reset" data-id="${u.id}" data-l="${esc(u.login_id)}">비밀번호 초기화</button><button class="btn sm" data-act="user-toggle" data-id="${u.id}" data-on="${+u.active}">${+u.active ? '사용 정지' : '다시 사용'}</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="empty-note">계정이 없습니다.</td></tr>'}
      </tbody></table></div></div>
    <div class="panel"><h3>새 계정 만들기</h3>
      <form class="form" id="uform">
        <label>역할<select id="u-role">${creatable.map(r => `<option value="${r}">${esc(U.roles[r])}</option>`).join('')}</select></label>
        <label>아이디 <small>영문·숫자</small><input id="u-login" required pattern="[A-Za-z0-9_.\\-]{3,30}" placeholder="${ROLE() === 'org' ? 'w211' : 'org8'}"></label>
        <label>이름<input id="u-name" required></label>
        <label>휴대폰<input id="u-phone" inputmode="tel" placeholder="010-0000-0000"></label>
        ${ROLE() === 'org' ? `<label>담당 읍·면<select id="u-emd">${EMD.map(e => `<option>${e}</option>`).join('')}</select></label>` : `<label id="u-orgw">기관 <small>수행기관 관리자일 때</small><select id="u-org">${allSv.map(s => `<option value="${s.id}">${esc(s.vendor)}</option>`).join('')}</select></label>`}
        <div class="full"><button class="btn pri" type="submit">계정 만들기</button></div>
      </form>
      <p class="empty-note">처음 비밀번호는 자동으로 만들어지고 한 번만 보입니다. ${ROLE() === 'org' ? '새 수행자에게 어르신을 배정하려면 월간 계획의 "담당자 일괄 이관"을 쓰세요.' : ''}</p>
    </div>
  </div>`;
}

/* ---------- 접속기록 (시스템 관리자) ---------- */
const ACTION_LABEL = { login: '로그인', login_fail: '로그인 실패', logout: '로그아웃', view_recipient: '어르신 정보 조회', visit_start: '방문 시작', visit_end: '방문 종료', visit_cancel: '방문 취소',
  emergency: '긴급 신고', emergency_handle: '긴급 조치', change_request: '변경 요청', change_decide: '변경 요청 처리', plan_draft: '초안 생성', plan_submit: '계획 제출', plan_decide: '계획 승인·반려',
  schedule_update: '일정 수정', schedule_delete: '일정 삭제', schedule_add: '일정 추가', bulk_move: '일괄 이동', bulk_transfer: '일괄 이관', care_update: '집중관리 처리', care_remove: '집중관리 해제',
  report: '발굴신고', report_status: '발굴신고 처리', user_create: '계정 생성', user_reset: '비밀번호 초기화', user_activate: '계정 사용', user_deactivate: '계정 정지', password_change: '비밀번호 변경' };
async function renderAudit() {
  loading();
  const A = await api('audit', { q: VS.aq || '', action: VS.aa || '' });
  if (VS.tab !== 'audit') return;
  view.innerHTML = `<section class="vhead"><h2>접속기록</h2><span class="sub">최근 300건</span></section>
  <div class="panel"><div class="ctl" style="margin-bottom:10px"><input type="search" id="aq" placeholder="아이디·대상 검색" value="${esc(VS.aq || '')}" aria-label="검색"><select id="aa" aria-label="종류"><option value="">모든 종류</option>${A.actions.map(x => `<option value="${esc(x)}" ${VS.aa === x ? 'selected' : ''}>${esc(ACTION_LABEL[x] || x)}</option>`).join('')}</select><button class="btn sm" data-act="audit-search">찾기</button></div>
  <div class="tblwrap" style="max-height:72vh"><table><thead><tr><th>일시</th><th>아이디</th><th>종류</th><th>대상</th><th>내용</th><th>IP</th></tr></thead><tbody>
  ${A.list.map(l => `<tr><td class="num">${esc(l.at)}</td><td>${esc(l.login_id || '')}</td><td>${esc(ACTION_LABEL[l.action] || l.action)}</td><td>${esc(l.target || '')}</td><td style="white-space:normal;max-width:320px">${esc(l.detail || '')}</td><td class="num">${esc(l.ip || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-note">기록이 없습니다.</td></tr>'}
  </tbody></table></div></div>`;
}

/* ---------- 새 기능 이벤트 ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  const run = async (fn, okMsg, after) => { b.disabled = true; try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); if (after) await after(r); } catch (err) { toast(err.message); } finally { b.disabled = false; } };
  switch (a) {
    case 'hidehelp': try { localStorage.setItem('jd-help-' + b.dataset.k, '1'); } catch (er) { } b.closest('.help').remove(); break;
    case 'mypw': pwModal(false); break;
    case 'mclose': mclose(); break;
    case 'copy': try { await navigator.clipboard.writeText(b.dataset.v); toast('복사했습니다'); } catch (er) { const t = document.getElementById('tpw'); if (t) { const rg = document.createRange(); rg.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); } toast('선택된 비밀번호를 직접 복사하세요'); } break;
    case 'emg': modal(`<h2>긴급 상황 조치</h2><form class="form" id="emgform" data-id="${b.dataset.id}"><div class="full checks"><label><input type="radio" name="emst" value="확인중" checked> 확인 중 (계속 대응)</label><label><input type="radio" name="emst" value="조치완료"> 조치 완료</label></div>
        <label class="full">조치 내용<textarea id="em-memo" rows="3" required placeholder="예: 보호자 통화, 119 출동 확인, 병원 이송"></textarea></label><div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">저장</button></div></form>`); break;
    // 월간 계획
    case 'pprev': VS.pym = addMonths(VS.pym, -1); VS.pcell = null; render(); break;
    case 'pnext': VS.pym = addMonths(VS.pym, 1); VS.pcell = null; render(); break;
    case 'pcell': VS.pcell = { wid: +b.dataset.w, date: b.dataset.d }; document.querySelectorAll('.wc.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); loadPlanDay(); break;
    case 'plan-draft': run(() => api('plan_draft', {}, { ym: VS.pym }), '이용 규칙대로 일정을 채웠습니다', render); break;
    case 'plan-submit': {
      const box = view.querySelectorAll('.chk.warn').length;
      modal(`<h2>${ymLabel(VS.pym)} 계획을 제출할까요?</h2><p>${box ? `<b style="color:var(--st-late)">점검에서 확인이 필요한 항목이 ${box}개 있습니다.</b> 이유가 있는 경우(어르신 요청 등)에만 그대로 제출하세요.` : '자동 점검에서 문제가 없었습니다.'}</p><p>제출하면 총괄 담당자가 승인할 때까지 일정을 고칠 수 없습니다.</p><div class="mact"><button class="btn" data-act="mclose">더 고칠게요</button><button class="btn pri" data-act="plan-submit-go">제출하기</button></div>`); break;
    }
    case 'plan-submit-go': run(() => api('plan_submit', {}, { ym: VS.pym }), '제출했습니다. 승인 결과는 이 화면에서 확인하세요', () => { mclose(); loadAlerts(); return render(); }); break;
    case 'sched-save': { const box = b.closest('.pd'); const g = f => box.querySelector(`[data-f="${f}"]`).value; run(() => api('schedule_update', {}, { id: +b.dataset.id, date: g('date'), time: g('time'), wid: +g('wid') }), '일정을 고쳤습니다', render); break; }
    case 'sched-del': run(() => api('schedule_delete', {}, { id: +b.dataset.id }), '이 날 방문을 뺐습니다', render); break;
    case 'bulk-move': { const f = val('bm-from'), t = val('bm-to'); if (!f || !t) { toast('두 날짜를 모두 골라 주세요'); break; } run(() => api('bulk_move', {}, { from: f, to: t }), r => `${r.moved}건을 옮겼습니다${r.skipped ? ` (같은 날 일정이 있어 ${r.skipped}건은 그대로 둠)` : ''}`, render); break; }
    case 'bulk-transfer': run(() => api('bulk_transfer', {}, { from_wid: +val('bt-from'), to_wid: +val('bt-to'), from: val('bt-d1'), to: val('bt-d2'), permanent: document.getElementById('bt-perm').checked }), r => `${r.moved}건을 넘겼습니다${r.locked ? ` (확정된 달 ${r.locked}건 제외)` : ''}`, async () => { const M = await api('meta'); M.workers.forEach(w => W.set(w.id, w)); await render(); }); break;
    case 'sched-add': { const m = val('sa-r').match(/JD-\d+/); const r = m ? [...R.values()].find(x => x.code === m[0]) : [...R.values()].find(x => x.name === val('sa-r')); if (!r) { toast('목록에서 어르신을 골라 주세요'); break; } run(() => api('schedule_add', {}, { rid: r.id, date: val('sa-d'), time: val('sa-t') }), '일정을 추가했습니다', render); break; }
    case 'reqchange': reqModal(+b.dataset.id, b.dataset.date, b.dataset.time); break;
    // 계획 승인
    case 'aprev': VS.aym = addMonths(VS.aym, -1); render(); break;
    case 'anext': VS.aym = addMonths(VS.aym, 1); render(); break;
    case 'plancal': VS.year = +VS.aym.slice(0, 4); VS.month = +VS.aym.slice(5, 7); VS.mmode = 'worker'; VS.msvc = +b.dataset.s; setTab('month'); break;
    case 'approve': run(() => api('plan_decide', {}, { sid: +b.dataset.s, ym: VS.aym, decision: '승인' }), '승인했습니다', () => { loadAlerts(); return render(); }); break;
    case 'reject': reasonModal(`${svc(+b.dataset.s).short} ${ymLabel(VS.aym)} 계획 반려`, 'plan', `data-s="${b.dataset.s}"`); break;
    case 'cr-ok': run(() => api('change_decide', {}, { id: +b.dataset.id, decision: '승인' }), '승인하고 일정에 반영했습니다', () => { loadAlerts(); return render(); }); break;
    case 'cr-no': reasonModal('일정 변경 요청 반려', 'cr', `data-id="${b.dataset.id}"`); break;
    // 계정
    case 'user-reset': run(() => api('user_update', {}, { id: +b.dataset.id, reset: true }), null, r => showTempPw('비밀번호를 초기화했습니다', b.dataset.l, r.temp_password)); break;
    case 'user-toggle': { const on = b.dataset.on === '1'; run(() => api('user_update', {}, { id: +b.dataset.id, active: !on }), r => on ? `사용을 정지했습니다${r.remaining ? `. 남은 일정 ${r.remaining}건은 월간 계획에서 다른 담당자에게 넘기세요` : ''}` : '다시 사용하도록 했습니다', render); break; }
    case 'audit-search': VS.aq = val('aq'); VS.aa = val('aa'); render(); break;
  }
});
document.addEventListener('submit', async e => {
  const f = e.target, id = f.id;
  if (!['pwform', 'reqform', 'reasonform', 'uform', 'emgform'].includes(id)) return;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (id === 'pwform') {
      if (val('pw1') !== val('pw2')) throw new Error('새 비밀번호 두 칸이 서로 다릅니다.');
      await api('my_password', {}, { current: document.getElementById('pw0').value, new: document.getElementById('pw1').value });
      mclose(); toast('비밀번호를 바꿨습니다'); if (ME) ME.must_change = false;
    } else if (id === 'reqform') {
      await api('change_request', {}, { schedule_id: +f.dataset.id, date: val('rq-d'), time: val('rq-t'), reason: val('rq-w') });
      mclose(); toast('변경 요청을 올렸습니다. 총괄 담당자가 승인하면 반영됩니다');
    } else if (id === 'reasonform') {
      if (f.dataset.act2 === 'plan') await api('plan_decide', {}, { sid: +f.dataset.s, ym: VS.aym, decision: '반려', note: val('rs-w') });
      else await api('change_decide', {}, { id: +f.dataset.id, decision: '반려', note: val('rs-w') });
      mclose(); toast('반려했습니다'); loadAlerts(); render();
    } else if (id === 'uform') {
      const role = val('u-role'), login = val('u-login');
      const r = await api('user_create', {}, { role, login_id: login, name: val('u-name'), phone: val('u-phone'), org_id: +val('u-org') || null, emd: val('u-emd') });
      if (role === 'worker') { const M = await api('meta'); M.workers.forEach(w => W.set(w.id, w)); }
      await render(); showTempPw('계정을 만들었습니다', login, r.temp_password);
    } else if (id === 'emgform') {
      const st = (f.querySelector('input[name="emst"]:checked') || {}).value;
      await api('emergency_handle', {}, { id: +f.dataset.id, status: st, memo: val('em-memo') });
      mclose(); toast(st === '조치완료' ? '조치 완료로 기록했습니다' : '확인 중으로 기록했습니다'); loadAlerts();
    }
  } catch (err) { toast(err.message); }
  finally { if (btn) btn.disabled = false; }
});
document.addEventListener('input', e => { if (e.target.id === 'uq') { VS.uq = e.target.value; clearTimeout(window.__uqT); window.__uqT = setTimeout(() => { render().then(() => { const el = document.getElementById('uq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); }, 300); } });

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (b.tagName === 'A') e.preventDefault();
  switch (a) {
    case 'tab': setTab(b.dataset.tab); break;
    case 'refresh': render(); break;
    case 'yprev': VS.year--; render(); break;
    case 'ynext': VS.year++; render(); break;
    case 'ymonth': VS.month = +b.dataset.m; VS.mmode = 'all'; setTab('month'); break;
    case 'heat': VS.month = +b.dataset.m; VS.msvc = +b.dataset.s; VS.mmode = 'svc'; setTab('month'); break;
    case 'mprev': if (VS.month === 1) { VS.month = 12; VS.year--; } else VS.month--; render(); break;
    case 'mnext': if (VS.month === 12) { VS.month = 1; VS.year++; } else VS.month++; render(); break;
    case 'mmode': VS.mmode = b.dataset.k; render(); break;
    case 'mday':
      VS.date = b.dataset.d;
      if (VS.mmode === 'svc' || VS.mmode === 'worker') { VS.f.svc = String(VS.msvc); VS.wsvc = VS.msvc; } else VS.f.svc = '';
      VS.f.q = VS.mmode === 'person' ? R.get(VS.mperson).code : '';
      setTab('day'); break;
    case 'dprev': VS.date = addDays(VS.date, -1); drawDayHead(); loadDay().catch(showError); break;
    case 'dnext': VS.date = addDays(VS.date, 1); drawDayHead(); loadDay().catch(showError); break;
    case 'dtoday': VS.date = TODAY; drawDayHead(); loadDay().catch(showError); break;
    case 'dsub': VS.dsub = b.dataset.k; document.querySelectorAll('[data-act="dsub"]').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === VS.dsub)); drawDay(); break;
    case 'wsvc': VS.wsvc = +b.dataset.k; drawDay(); break;
    case 'open': VS.drawer = +b.dataset.rid; renderDrawer(); break;
    case 'close': VS.drawer = null; renderDrawer(); break;
    case 'caretoggle': {
      const rid = +b.dataset.rid, on = b.dataset.on === '1';
      try { await api('care', {}, on ? { rid, remove: true } : { rid, status: '미확인', manual: 1 }); toast(on ? '집중관리 지정을 해제했습니다' : '집중관리 대상으로 지정했습니다'); }
      catch (err) { toast(err.message); }
      renderDrawer(); if (VS.tab === 'care') renderCare(); break;
    }
    case 'toperson': VS.mperson = +b.dataset.rid; VS.mmode = 'person'; VS.drawer = null; renderDrawer(); { const d = toD(TODAY); VS.year = d.getFullYear(); VS.month = d.getMonth() + 1; } setTab('month'); break;
  }
});
function drawDayHead() { const t = document.getElementById('dtitle'); if (t) t.textContent = `${toD(VS.date).getFullYear()}년 ${dlabel(VS.date)}`; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && VS.drawer != null) { VS.drawer = null; renderDrawer(); } });
document.addEventListener('input', e => { if (e.target.id === 'fq') { VS.f.q = e.target.value; drawDay(); } });
document.addEventListener('change', async e => {
  const t = e.target, f = VS.f;
  if (t.id === 'femd') { f.emd = t.value; drawDay(); }
  else if (t.id === 'fsvc') { f.svc = t.value; drawDay(); }
  else if (t.id === 'fst') { f.st = t.value; drawDay(); }
  else if (t.id === 'fsort') { f.sort = t.value; drawDay(); }
  else if (t.id === 'fall') { f.all = t.checked; drawDay(); }
  else if (t.id === 'msvc') { VS.msvc = +t.value; render(); }
  else if (t.id === 'mperson') {
    const m = t.value.match(/JD-\d+/); const r = [...R.values()].find(x => m ? x.code === m[0] : x.name === t.value.trim());
    if (r) { VS.mperson = r.id; render(); }
  }
  else if (t.dataset.care) {
    try { await api('care', {}, { rid: +t.dataset.rid, [t.dataset.care]: t.value }); if (t.dataset.care === 'status') toast(`처리 상태: ${t.value}`); else toast('메모를 저장했습니다'); }
    catch (err) { toast(err.message); }
  }
  else if (t.dataset.rep != null) {
    try { await api('report_status', {}, { id: +t.dataset.rep, status: t.value }); toast(`발굴신고 단계: ${t.value}`); } catch (err) { toast(err.message); }
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'repform') return; e.preventDefault();
  const v = id => document.getElementById(id).value.trim();
  const needs = [...document.querySelectorAll('input[name="rneed"]:checked')].map(x => x.value);
  try { await api('report', {}, { reporter: v('rb'), name: v('rn'), age: v('ra'), emd: v('re'), needs, reason: v('rw') }); toast('발굴신고를 접수했습니다'); renderCare(); }
  catch (err) { toast(err.message); }
});

/* ---------- 시작 ---------- */
(async function init() {
  try {
    ME = (await api('me')).user;
    const M = await api('meta');
    SV = M.services; SV.forEach((s, i) => { SVI[s.id] = i; });
    EMD = M.emd; HOUSE = M.house; DEMO = M.demo; RULE = M.risk_rule;
    M.recipients.forEach(r => { r.svc = {}; r.en.forEach(en => { r.svc[en.sid] = en; }); R.set(r.id, r); });
    M.workers.forEach(w => W.set(w.id, w));
    document.getElementById('brandsub').textContent = ROLE() === 'org'
      ? `${SV[0].vendor} · 어르신 ${R.size}명 · 수행자 ${[...W.values()].filter(w => w.active).length}명`
      : `${SV.length}개 서비스 · 수혜자 ${R.size}명 · 담당자 ${W.size}명`;
    document.getElementById('livedot').classList.toggle('off', false);
    VS.date = TODAY; VS.year = +TODAY.slice(0, 4); VS.month = +TODAY.slice(5, 7);
    VS.msvc = VS.wsvc = SV[1] ? SV[1].id : SV[0].id;
    drawTabs();
    setTab((location.hash || '').slice(1) || 'day');
    loadAlerts();
    if (ME.must_change) pwModal(true);
  } catch (e) { console.error(e); showError(e); }
})();
setInterval(() => { if (!document.hidden) loadAlerts(); }, 30000);
setInterval(updateClock, 30000);
setInterval(() => { if (!document.hidden && VS.tab === 'day' && VS.date === TODAY) loadDay().catch(console.error); }, 30000);

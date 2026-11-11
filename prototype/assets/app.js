'use strict';
/* =====================================================================
 * 진도군 통합돌봄 모니터링 — 전체 시제품 (브라우저만으로 동작)
 * 데이터: 가상 예시 600명·210명을 규칙으로 생성 + 사용자가 바꾼 내용은 이 브라우저에 저장
 * ===================================================================== */

/* ---------- 유틸 ---------- */
const pad = n => String(n).padStart(2, '0');
const dayNum = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const fromDN = n => { const u = new Date(n * 864e5); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };
const dkey = dn => { const d = fromDN(dn); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dnOf = s => dayNum(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
const hm = m => m == null ? '' : `${pad(Math.floor(m / 60))}:${pad(Math.round(m) % 60)}`;
const parseHM = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : 0;
const fmt = n => Number(n || 0).toLocaleString('ko-KR');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const T0 = new Date();
const TODAY = new Date(T0.getFullYear(), T0.getMonth(), T0.getDate());
const TODAYN = dayNum(TODAY), YEAR = TODAY.getFullYear(), YEAR0N = dayNum(new Date(YEAR, 0, 1)), YEAREN = dayNum(new Date(YEAR, 11, 31));
const dlabel = dn => { const d = fromDN(dn); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
const sdate = dn => { const d = fromDN(dn); return `${d.getMonth() + 1}/${d.getDate()}`; };
const ymOf = dn => dkey(dn).slice(0, 7);
const addMonths = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ymLabel = ym => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;
const monthDNs = ym => { const a = []; const n = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); for (let d = 1; d <= n; d++) a.push(dayNum(new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, d))); return a; };
const CUR_YM = ymOf(TODAYN), NEXT_YM = addMonths(CUR_YM, 1);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261110);
const pick = a => a[Math.floor(rnd() * a.length)];
function hash(a, b, c, d) { let h = Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA77); h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h ^= Math.imul(c + 13, 0xC2B2AE3D); h = Math.imul(h ^ (h >>> 12), 0x297A2D39); h ^= Math.imul(d + 29, 0x27D4EB2F); h = Math.imul(h ^ (h >>> 15), 0x165667B1); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
function nice(max) { if (max <= 0) return 1; const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

/* ---------- 서비스·수혜자·담당자 (가상 예시) ---------- */
const SV = [
  { id: 'bath', name: '목욕', short: '목욕', vendor: '진도행복재가센터', role: '요양보호사', start: 540, dur: 60, gap: 30, p: .24, flags: ['피부 발적', '거동 불편', '통증 호소'] },
  { id: 'house', name: '가사', short: '가사', vendor: '진도가사돌봄협동조합', role: '가사관리사', start: 540, dur: 90, gap: 15, p: .38, flags: ['기운 없음', '식사량 저하', '우울감 호소', '집안 위생 악화'] },
  { id: 'meal', name: '식사(도시락)', short: '식사', vendor: '진도나눔도시락', role: '배달원', start: 630, dur: 5, gap: 12, p: .45, flags: ['지난 도시락 남김', '응답 지연', '식사량 저하'] },
  { id: 'beauty', name: '미용', short: '미용', vendor: '진도이·미용봉사단', role: '미용사', start: 600, dur: 40, gap: 20, p: .15, flags: ['기운 없음', '어지럼 호소'] },
  { id: 'move', name: '이동', short: '이동', vendor: '진도이동지원센터', role: '이동지원 기사', start: 540, dur: 90, gap: 30, p: .18, flags: ['거동 불편', '통증 호소'] },
  { id: 'smart', name: '스마트돌봄', short: '스마트', vendor: '진도스마트케어센터', role: '관제요원', start: 540, dur: 3, gap: 2, p: .35, flags: ['장시간 무활동', '야간 활동 이상'] },
  { id: 'medical', name: '방문의료', short: '의료', vendor: '진도방문의료협력의원', role: '방문간호사', start: 600, dur: 40, gap: 30, p: .24, flags: ['혈압 상승', '혈당 이상', '복약 미이행'] },
];
SV.forEach((s, i) => { s.i = i; s.c = `var(--s${i})`; });
const EMD = ['진도읍', '고군면', '군내면', '의신면', '임회면', '지산면', '조도면'];
const EMDW = [.34, .11, .10, .13, .13, .10, .09];
const HOUSE = ['독거', '부부', '자녀 동거'];
const SUR = ['김', '김', '김', '이', '이', '박', '박', '박', '최', '정', '조', '강', '윤', '장', '임', '한', '오', '서', '신', '권', '허', '곽', '문', '양'];
const GF = ['순', '자', '례', '덕', '님', '엽', '분', '옥', '단', '금', '심', '녀', '희', '애', '임'];
const GM = ['수', '철', '석', '남', '길', '동', '식', '봉', '환', '배', '용', '춘'];
const WN = ['희', '정', '숙', '영', '미', '경', '진', '선', '연', '현', '호', '민'];
function pickW(w) { let x = rnd(), a = 0; for (let i = 0; i < w.length; i++) { a += w[i]; if (x < a) return i; } return w.length - 1; }
const R = [];
function addEn(r, si) { const wd1 = 1 + Math.floor(rnd() * 5); const en = { s: si, wd1, wd2: ((wd1 - 1 + 2 + Math.floor(rnd() * 2)) % 5) + 1, wk: si === 3 ? 1 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 2), mwf: rnd() < .2, from: rnd() < .82 ? 0 : Math.floor(rnd() * 300), w: -1 }; r.en.push(en); r.svc[si] = en; }
for (let i = 0; i < 600; i++) {
  const sex = rnd() < .68 ? '여' : '남';
  const name = pick(SUR) + '○' + (sex === '여' ? pick(GF) : pick(GM));
  const age = Math.min(99, 65 + Math.floor(rnd() * 14 + Math.pow(rnd(), .8) * 20));
  const e = pickW(EMDW), hv = rnd(), house = hv < .58 ? 0 : hv < .88 ? 1 : 2;
  const rv = rnd(), risk = rv < .88 ? .02 : rv < .97 ? .07 : .2;
  const trend = risk > .15 || (risk > .06 && rnd() < .45);
  const r = { id: i, code: 'JD-' + (1001 + i), name, sex, age, e, house, alone: house === 0, risk, trend, en: [], svc: new Array(7).fill(null) };
  SV.forEach((S, si) => { let p = S.p; if (age >= 85 && (S.id === 'bath' || S.id === 'medical')) p *= 1.45; if (age >= 85 && S.id === 'move') p *= 1.2; if (r.alone && (S.id === 'meal' || S.id === 'smart')) p *= 1.25; if (rnd() < p) addEn(r, si); });
  if (!r.en.length) addEn(r, rnd() < .6 ? 2 : 1);
  R.push(r);
}
const W = [];
SV.forEach((S, si) => {
  const list = R.filter(r => r.svc[si]).sort((a, b) => a.e - b.e || a.id - b.id);
  const per = Math.ceil(list.length / 30);
  for (let k = 0; k < 30; k++) {
    const w = { id: W.length, s: si, k, name: pick(SUR) + '○' + pick(WN), slack: Math.pow(rnd(), 3), rs: list.slice(k * per, (k + 1) * per), active: true };
    w.rs.forEach(r => { r.svc[si].w = w.id; });
    w.e = w.rs.length ? w.rs[0].e : 0;
    W.push(w);
  }
});
function schedText(en) { const d1 = WD[en.wd1]; switch (SV[en.s].id) {
  case 'bath': return `매주 ${d1}요일`; case 'house': return `매주 ${[en.wd1, en.wd2].sort().map(x => WD[x]).join('·')}`;
  case 'meal': return en.mwf ? '매주 월·수·금' : '평일 매일'; case 'beauty': return `매월 ${en.wk}째 ${d1}요일`;
  case 'smart': return '매일 자동 안부확인'; default: return `매월 ${en.wk}·${en.wk + 2}째 ${d1}요일`; } }
function matches(en, dow, wom) { switch (SV[en.s].id) {
  case 'bath': return dow === en.wd1; case 'house': return dow === en.wd1 || dow === en.wd2;
  case 'meal': return en.mwf ? (dow === 1 || dow === 3 || dow === 5) : (dow >= 1 && dow <= 5);
  case 'beauty': return dow === en.wd1 && wom === en.wk; case 'smart': return true;
  default: return dow === en.wd1 && (wom === en.wk || wom === en.wk + 2); } }
const CANCEL = ['병원 입원', '가족 방문', '본인 거절', '외출 부재'];
function mkRec(r, w, S, t, dn) {
  const si = S.i, id = r.id, x = hash(id, si, dn, 1), mp = .004 + w.slack * .045;
  const rec = { k: `${dn}_${id}_${si}`, r, w, s: si, t, dn, d: Math.max(2, Math.round(S.dur * (.85 + hash(id, si, dn, 2) * .3))), cancel: x < .012, miss: x >= .012 && x < .012 + mp, delay: 0, h: -1, flags: [] };
  const lateB = x >= .012 + mp && x < .042 + mp;
  rec.delay = lateB ? 35 + Math.floor(hash(id, si, dn, 3) * 55) : Math.floor(hash(id, si, dn, 4) * 14);
  if (rec.cancel) rec.reason = CANCEL[Math.floor(hash(id, si, dn, 5) * 4)];
  else if (!rec.miss) {
    const p = r.risk * (r.trend && dn > TODAYN - 12 ? 1.6 : 1) * (S.id === 'smart' ? .4 : 1);
    const y = hash(id, si, dn, 6);
    rec.h = y < p ? 2 : y < p + .24 ? 1 : 0;
    if (rec.h === 2) { const fl = S.flags, a = Math.floor(hash(id, si, dn, 7) * fl.length); rec.flags = [fl[a]]; if (fl.length > 1 && hash(id, si, dn, 8) < .3) rec.flags.push(fl[(a + 1) % fl.length]); }
  }
  return rec;
}
const cache = new Map();
function genDay(dn, keep = true) {
  if (cache.has(dn)) return cache.get(dn);
  const date = fromDN(dn), dow = date.getDay(), wom = Math.ceil(date.getDate() / 7), doy = dn - YEAR0N;
  const byW = new Map();
  for (const r of R) for (const en of r.en) {
    if (en.from > 0 && doy < en.from) continue;
    if (!matches(en, dow, wom)) continue;
    let l = byW.get(en.w); if (!l) { l = []; byW.set(en.w, l); } l.push(r);
  }
  const recs = [];
  for (const [wid, list] of byW) { const w = W[wid], S = SV[w.s]; list.forEach((r, i) => recs.push(mkRec(r, w, S, S.start + i * (S.dur + S.gap), dn))); }
  if (keep) { cache.set(dn, recs); if (cache.size > 200) cache.delete(cache.keys().next().value); }
  return recs;
}

/* ---------- 시뮬레이션 시각 ---------- */
const SIM = { now: (() => { const m = T0.getHours() * 60 + T0.getMinutes(); return (m < 600 || m > 1080) ? 14 * 60 + 20 : m; })(), play: true };
const nowStr = () => `${dkey(TODAYN)} ${hm(SIM.now)}`;

/* ---------- 저장 상태 (이 브라우저에만 저장) ---------- */
const SKEY = 'jd-proto-v2';
const DEMO_PW = 'jindo1234';
const wLogin = wid => 'w' + pad3(wid + 1);
function pad3(n) { return String(n).padStart(3, '0'); }
/* ---------- 통합돌봄 퇴원환자 지원 신청 ---------- */
const DC_STEPS = ['접수', '상담·욕구조사', '서비스연계', '종결'];
const DC_KINDS = ['병원', '보호자', '본인', '수행기관', '기타'];
const dcNo = (dn, n) => `DC-${dkey(dn).replace(/-/g, '')}-${pad3(n)}`;
function seedReports() {
  let n = 0;
  const rep = (d, kind, by, name, age, emd, hosp, dd, needs, why, st) => ({ id: 'r' + d + name, no: dcNo(TODAYN - d, ++n), via: kind === '본인' ? '방문 접수' : kind === '수행기관' ? '담당자 대리 접수' : '온라인 신청', at: dkey(TODAYN - d) + ' 10:00', kind, by, name, age, emd, hosp, ddn: TODAYN + dd, needs, why, st, memo: '' });
  return [
    rep(0, '병원', '목포○○병원 의료사회복지사', '정○례', 81, '의신면', '목포○○병원', 3, ['방문의료', '식사(도시락)', '가사'], '고관절 수술 후 퇴원 예정. 혼자 살고 거동이 어려워 퇴원 직후부터 식사와 집안일 도움이 필요함.', '접수'),
    rep(1, '보호자', '자녀 김○영', '김○수', 77, '진도읍', '진도○○병원', -2, ['가사', '방문의료'], '뇌경색으로 2주 입원 후 퇴원. 한쪽 팔이 불편해 집안일과 복약 관리 도움이 필요함.', '상담·욕구조사'),
    rep(3, '수행기관', wLogin(150) + ' (관제요원)', '박○님', 86, '조도면', '목포○○병원', -5, ['이동', '방문의료', '스마트돌봄'], '폐렴 치료 후 퇴원. 섬 지역이라 외래 통원이 어렵고 야간 안부 확인이 필요함.', '서비스연계'),
    rep(5, '본인', '(군청 방문 접수)', '이○자', 79, '임회면', '광주○○대학병원', 7, ['목욕', '식사(도시락)'], '무릎 인공관절 수술 예정. 퇴원 후 한 달간 목욕과 식사 지원을 미리 신청함.', '접수'),
    rep(9, '병원', '진도○○병원 간호부', '최○식', 83, '군내면', '진도○○병원', -12, ['스마트돌봄', '방문의료'], '낙상으로 입원 후 퇴원. 다시 넘어질 위험이 있어 응급호출 장비와 방문간호를 연계함.', '종결'),
  ];
}
const ddLabel = dn => dn == null ? '' : dn > TODAYN ? `퇴원 예정 ${sdate(dn)} (D-${dn - TODAYN})` : dn === TODAYN ? '오늘 퇴원' : `${sdate(dn)} 퇴원 (${TODAYN - dn}일 지남)`;
function freshState() {
  const plans = {};
  for (let m = 1; m <= 12; m++) { const ym = `${YEAR}-${pad(m)}`; if (ym > CUR_YM) break; SV.forEach(S => { plans[S.i + '_' + ym] = { st: '승인', at: ym + '-01 10:00', by: 'central' }; }); }
  const ns = ['제출', '작성중', '제출', '반려', '작성중', '승인', '제출'];
  const y = dkey(TODAYN - 1) + ' 17:20';
  SV.forEach(S => { const s = ns[S.i]; plans[S.i + '_' + NEXT_YM] = { st: s, note: s === '반려' ? '셋째 주 화요일 일정이 빠진 어르신이 있습니다. 확인 후 다시 제출해 주세요.' : null, at: s === '작성중' ? null : y, by: s === '작성중' ? null : 'org' + (S.i + 1), dat: s === '승인' || s === '반려' ? dkey(TODAYN) + ' 09:30' : null }; });
  const crs = [];
  const findRec = sidx => { for (let d = TODAYN + 1; d <= TODAYN + 7; d++) { const x = genDay(d).find(z => z.s === sidx); if (x) return x; } return null; };
  const c1 = findRec(0), c2 = findRec(1);
  if (c1) crs.push({ id: 1, k: c1.k, rid: c1.r.id, s: 0, odn: c1.dn, ot: c1.t, nd: c1.dn + 1, nt: c1.t, reason: '어르신 병원 정기 진료와 겹친다고 하셔서 다음 날로 옮기고 싶습니다.', by: wLogin(c1.w.id), at: dkey(TODAYN) + ' 09:12', st: '대기' });
  if (c2) crs.push({ id: 2, k: c2.k, rid: c2.r.id, s: 1, odn: c2.dn, ot: c2.t, nd: c2.dn, nt: c2.t + 60, reason: '어르신 요청으로 한 시간 늦게 방문하려고 합니다.', by: wLogin(c2.w.id), at: dkey(TODAYN) + ' 10:03', st: '대기' });
  const e0 = genDay(TODAYN).filter(x => x.s === 1).sort((a, b) => a.t - b.t)[0];
  const emgs = e0 ? [{ id: 1, at: hm(Math.max(560, SIM.now - 12)), k: e0.k, rid: e0.r.id, s: 1, by: wLogin(e0.w.id), kind: '응답 없음·부재', note: '방문했으나 문이 잠겨 있고 응답이 없습니다. 보호자에게 연락 중입니다.', st: '접수' }] : [];
  const reports = seedReports();
  // 반려된 미용 계획: 셋째 주 화요일 방문 1건이 빠진 상태로 시작 (점검에 '횟수 미달'로 보이도록)
  const mods = {};
  const miss3 = monthDNs(NEXT_YM).filter(dn => fromDN(dn).getDay() === 2 && Math.ceil(fromDN(dn).getDate() / 7) === 3).flatMap(dn => genDay(dn)).find(x => x.s === 3);
  if (miss3) mods[miss3.k] = { del: true };
  return { v: 3, rev: 0, visits: {}, mods, adds: [], reassign: {}, plans, crs, emgs, newUsers: [], newWorkers: [], userMods: {}, audit: [], care: {}, reports, help: {}, session: null, nextId: 100 };
}
let STATE;
try { STATE = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { STATE = null; }
if (STATE && STATE.v === 2) { STATE.reports = seedReports(); STATE.v = 3; } // 이전 판(이웃 발굴신고) → 퇴원환자 지원 신청
if (!STATE || STATE.v !== 3) STATE = freshState();
STATE.reports.forEach((x, i) => { if (!x.no) x.no = dcNo(dnOf(x.at.slice(0, 10)), 100 + i); if (!x.via) x.via = '온라인 신청'; });
STATE.newWorkers.forEach(nw => { if (!W[nw.id]) W[nw.id] = { id: nw.id, s: nw.s, k: 99, name: nw.name, slack: 0, rs: [], active: true, e: nw.e }; });
Object.entries(STATE.userMods).forEach(([l, m]) => {
  if (m.active !== false) return;
  const nu = STATE.newUsers.find(n => n.login === l), wid = nu ? nu.wid : (/^w\d{3}$/.test(l) ? +l.slice(1) - 1 : null);
  if (wid != null && W[wid]) W[wid].active = false;
});
function save() { STATE.rev++; RK.at = -1; try { localStorage.setItem(SKEY, JSON.stringify(STATE)); } catch (e) { } }
function audit(action, target = '', detail = '') { STATE.audit.unshift({ at: nowStr(), login: STATE.session || '-', action, target, detail }); if (STATE.audit.length > 500) STATE.audit.length = 500; }
const nid = () => ++STATE.nextId;

/* ---------- 계정 ---------- */
const ROLE_LABEL = { admin: '시스템 관리자', central: '총괄 담당자', org: '수행기관 관리자', worker: '현장 수행자', viewer: '조회 전용' };
function allUsers() {
  const u = [{ login: 'admin', name: '군 전산 담당', role: 'admin' }, { login: 'central', name: '통합돌봄 총괄 담당', role: 'central' }, { login: 'viewer', name: '보건소 조회 담당', role: 'viewer' }];
  SV.forEach(S => u.push({ login: 'org' + (S.i + 1), name: S.vendor + ' 관리자', role: 'org', sid: S.i }));
  W.forEach(w => { if (w.k !== 99) u.push({ login: wLogin(w.id), name: w.name, role: 'worker', sid: w.s, wid: w.id }); });
  STATE.newUsers.forEach(n => u.push({ ...n }));
  return u.map(x => { const m = STATE.userMods[x.login] || {}; return { ...x, active: m.active !== false, pw: m.pw || x.pw || DEMO_PW, must: !!m.must, last: m.last || null }; });
}
const findUser = login => allUsers().find(u => u.login === login);
let _meKey = null, _me = null;
const ME = () => { const key = STATE.session + '|' + STATE.rev; if (key !== _meKey) { _meKey = key; _me = STATE.session ? findUser(STATE.session) : null; } return _me; };
const ROLE = () => (ME() || {}).role;
const ORG = () => { const m = ME(); return m && m.role === 'org' ? m.sid : null; };
const VSV = () => ORG() == null ? SV : [SV[ORG()]];
const visS = s => ORG() == null || s === ORG();
function setUserMod(login, f) { STATE.userMods[login] = { ...(STATE.userMods[login] || {}), ...f }; }
function tempPw() { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

/* ---------- 일정 (기본 규칙 + 수정·추가·이관 반영) ---------- */
function baseRec(k) { const dn0 = +k.split('_')[0]; return genDay(dn0).find(x => x.k === k); }
function daySched(dn) {
  const out = [];
  for (const x of genDay(dn)) {
    const m = STATE.mods[x.k];
    if (m && (m.del || m.dn !== dn)) continue;
    if (m) { out.push({ ...x, t: m.t, w: W[m.wid], moved: m.t !== x.t || m.wid !== x.w.id, cancel: false, miss: false }); continue; }
    const ra = STATE.reassign[x.r.id + '_' + x.s];
    out.push(ra && dn >= ra.from ? { ...x, w: W[ra.wid] } : x);
  }
  for (const k in STATE.mods) { const m = STATE.mods[k]; if (m.del || m.dn !== dn || m.from === dn) continue; const b = baseRec(k); if (b) out.push({ ...b, dn, t: m.t, w: W[m.wid], moved: true, cancel: false, miss: false }); }
  for (const a of STATE.adds) if (a.dn === dn) out.push({ k: a.k, r: R[a.rid], w: W[a.wid], s: a.s, t: a.t, d: a.d, dn, cancel: false, miss: false, delay: 0, h: -1, flags: [], add: true });
  return out;
}
function st(x) {
  const v = STATE.visits[x.k]; if (v) return v.st;
  if (x.moved || x.add) { if (x.dn < TODAYN) return 'miss'; if (x.dn > TODAYN) return 'plan'; return SIM.now - x.t >= 30 ? 'late' : 'plan'; }
  if (x.cancel) return 'cancel';
  if (x.dn < TODAYN) return x.miss ? 'miss' : 'done';
  if (x.dn > TODAYN) return 'plan';
  const n = SIM.now;
  if (x.miss) return n - x.t >= 30 ? 'late' : 'plan';
  const s = x.t + x.delay, e = s + x.d;
  if (n >= e) return 'done'; if (n >= s) return 'prog'; if (n - x.t >= 30) return 'late'; return 'plan';
}
function info(x) {
  const s = st(x), v = STATE.visits[x.k];
  if (v) return { s, start: v.start ?? null, end: v.end ?? null, h: v.h ?? -1, flags: v.flags || [], note: v.note || '', reason: v.reason || '' };
  const base = !(x.moved || x.add);
  return { s, start: (s === 'prog' || s === 'done') && base ? x.t + x.delay : null, end: s === 'done' && base ? x.t + x.delay + x.d : null, h: s === 'done' ? x.h : -1, flags: s === 'done' ? x.flags : [], note: '', reason: s === 'cancel' ? (x.reason || '') : '' };
}
const STL = { plan: '예정', prog: '진행중', done: '완료', late: '지연', miss: '미수행', cancel: '취소' };
const HL = ['좋음', '보통', '나쁨'];
function visDay(dn) { const o = ORG(); const a = daySched(dn); return o == null ? a : a.filter(x => x.s === o); }
function dayAgg(dn) {
  const a = SV.map(() => ({ plan: 0, done: 0, prog: 0, late: 0, miss: 0, cancel: 0, bad: 0 }));
  for (const x of visDay(dn)) { const o = a[x.s], i = info(x); o.plan++; if (i.s !== 'plan') o[i.s]++; if (i.s === 'done' && i.h === 2) o.bad++; }
  return a;
}

/* ---------- 연간 집계 (규칙 기준) ---------- */
let YA = null;
function yearAgg() {
  if (YA) return YA;
  const z = () => ({ plan: 0, pplan: 0, done: 0, miss: 0, cancel: 0 });
  const months = Array.from({ length: 12 }, () => SV.map(z)), emd = SV.map(() => EMD.map(() => 0));
  for (let dn = YEAR0N; dn <= YEAREN; dn++) {
    const recs = (dn >= TODAYN - 35 && dn <= TODAYN + 40) ? genDay(dn) : genDay(dn, false);
    const m = fromDN(dn).getMonth();
    for (const x of recs) { const a = months[m][x.s]; a.plan++; if (dn >= TODAYN) continue; a.pplan++; if (x.cancel) a.cancel++; else if (x.miss) a.miss++; else { a.done++; emd[x.s][x.r.e]++; } }
  }
  YA = { months, emd }; return YA;
}

/* ---------- 위험도 ---------- */
let RK = { at: -1, map: null };
const RULE = { BAD: 2, MULTI: 4, MISS: 1, LATE: 2, ALONE: 1, DANGER: 10, WARN: 6, WATCH: 3, DAYS: 14 };
function risk() {
  const key = SIM.now * 10 + (ORG() ?? 9);
  if (RK.at === key && RK.map) return RK.map;
  const m = new Map();
  for (const r of R) m.set(r.id, { bad: 0, miss: 0, late: 0, svc: new Set(), flags: new Map(), score: 0, level: 0, reasons: [] });
  for (let dn = TODAYN - RULE.DAYS + 1; dn <= TODAYN; dn++) for (const x of visDay(dn)) {
    const o = m.get(x.r.id), i = info(x);
    if (i.s === 'done' && i.h === 2) { o.bad++; o.svc.add(x.s); i.flags.forEach(f => o.flags.set(f, (o.flags.get(f) || 0) + 1)); }
    else if (i.s === 'miss') o.miss++; else if (i.s === 'late') o.late++;
  }
  for (const r of R) {
    const o = m.get(r.id);
    o.score = o.bad * RULE.BAD + (o.svc.size >= 2 ? RULE.MULTI : 0) + o.miss * RULE.MISS + o.late * RULE.LATE + (r.alone && o.bad ? RULE.ALONE : 0);
    o.level = o.score >= RULE.DANGER ? 3 : o.score >= RULE.WARN ? 2 : o.score >= RULE.WATCH ? 1 : 0;
    if (o.bad) o.reasons.push(`최근 14일 건강상태 '나쁨' ${o.bad}회`);
    if (o.svc.size >= 2) o.reasons.push(`${[...o.svc].map(i => SV[i].short).join('·')} 등 ${o.svc.size}개 서비스에서 이상 보고`);
    const tf = [...o.flags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (tf.length) o.reasons.push('주요 징후: ' + tf.map(([f, n]) => `${f}(${n})`).join(', '));
    if (o.miss) o.reasons.push(`미수행 ${o.miss}회`);
    if (o.late) o.reasons.push('오늘 방문 지연·미시작');
    if (r.alone && o.bad) o.reasons.push('독거 가구');
  }
  RK = { at: key, map: m }; return m;
}
const LV = ['', '관심', '주의', '위험'], LVC = ['', 'var(--st-plan)', 'var(--st-late)', 'var(--st-miss)'];
const riskBadge = l => l ? `<em class="risk" style="--c:${LVC[l]}">${LV[l]}</em>` : '';

/* ---------- 월간 계획 상태·점검 ---------- */
const planOf = (s, ym) => STATE.plans[s + '_' + ym] || { st: '작성중' };
const planEditable = (s, ym) => ['작성중', '반려'].includes(planOf(s, ym).st);
const PLC = { '작성중': 'var(--st-plan)', '제출': 'var(--st-prog)', '승인': 'var(--st-done)', '반려': 'var(--st-miss)', '대기': 'var(--st-late)', '접수': 'var(--st-miss)', '확인중': 'var(--st-late)', '조치완료': 'var(--st-done)' };
const pill = s => s ? `<span class="pill" style="--c:${PLC[s] || 'var(--st-plan)'}">${s}</span>` : '';
const deadlineOf = ym => dnOf(addMonths(ym, -1) + '-20');
function planCheck(s, ym) {
  const exp = {}, cur = {}, byWD = {}; let total = 0, sun = 0;
  for (const dn of monthDNs(ym)) {
    for (const x of genDay(dn)) if (x.s === s) exp[x.r.id] = (exp[x.r.id] || 0) + 1;
    for (const x of daySched(dn)) if (x.s === s) { total++; cur[x.r.id] = (cur[x.r.id] || 0) + 1; if (SV[s].id !== 'smart' && fromDN(dn).getDay() === 0) sun++; (byWD[x.w.id + '_' + dn] = byWD[x.w.id + '_' + dn] || []).push(x); }
  }
  const short = []; for (const rid in exp) { const p = cur[rid] || 0; if (p < exp[rid]) short.push({ rid: +rid, name: R[rid].name, expected: exp[rid], planned: p }); }
  const ov = []; for (const k in byWD) { const a = byWD[k].sort((p, q) => p.t - q.t); for (let i = 1; i < a.length; i++) if (a[i].t < a[i - 1].t + a[i - 1].d) ov.push({ dn: a[i].dn, worker: a[i].w.name, a: a[i - 1].r.name + ' ' + hm(a[i - 1].t), b: a[i].r.name + ' ' + hm(a[i].t) }); }
  return { total, shortfall: short, overlaps: ov, sundays: sun };
}
function lockReason(x) {
  if (!planEditable(x.s, ymOf(x.dn))) return '이 달 계획은 제출 또는 승인되어 바로 고칠 수 없습니다. 변경 요청을 올려 주세요.';
  if (x.dn <= TODAYN) return '오늘과 지난 날짜의 일정은 고칠 수 없습니다.';
  if (STATE.visits[x.k]) return '이미 수행기록이 있는 일정입니다.';
  return null;
}
function hasSched(dn, rid, s, exceptK) { return daySched(dn).some(x => x.r.id === rid && x.s === s && x.k !== exceptK); }
function moveRec(x, dn, t, wid) {
  if (x.add) { const a = STATE.adds.find(z => z.k === x.k); if (a) { a.dn = dn; a.t = t; a.wid = wid; } return; }
  STATE.mods[x.k] = { from: +x.k.split('_')[0], dn, t, wid };
}
function delRec(x) { if (x.add) STATE.adds = STATE.adds.filter(z => z.k !== x.k); else STATE.mods[x.k] = { del: true }; }
function findSched(k, dnHint) { for (const dn of [dnHint, +k.split('_')[0]]) { const x = daySched(dn).find(z => z.k === k); if (x) return x; } return null; }

/* ---------- 화면 상태 ---------- */
const VS = { tab: 'day', month: TODAY.getMonth(), mmode: 'all', msvc: 1, mperson: null, date: TODAYN, dsub: 'people', wsvc: 1, drawer: null, pym: NEXT_YM, aym: NEXT_YM, pcell: null, uq: '', aq: '', aa: '', f: { q: '', emd: '', svc: '', st: '', all: false, sort: 'risk' } };
const view = document.getElementById('view');
const TABS = {
  admin: [['day', '일간'], ['month', '월간'], ['year', '연간'], ['care', '집중관리'], ['discharge', '퇴원지원'], ['approve', '계획 승인'], ['accounts', '계정 관리'], ['audit', '접속기록']],
  central: [['day', '일간'], ['month', '월간'], ['year', '연간'], ['care', '집중관리'], ['discharge', '퇴원지원'], ['approve', '계획 승인'], ['accounts', '계정 관리']],
  viewer: [['day', '일간'], ['month', '월간'], ['year', '연간'], ['care', '집중관리'], ['discharge', '퇴원지원']],
  org: [['day', '오늘 현황'], ['plan', '월간 계획'], ['month', '월간 실적'], ['year', '연간'], ['accounts', '수행자 계정']],
  worker: [['field', '오늘 방문']],
};
const HELP = {
  day: { central: '오늘 모든 서비스의 진행 상황입니다. 오른쪽 "주의 필요"부터 확인하고, 어르신 이름을 누르면 상세 기록이 열립니다.', org: '우리 기관의 오늘 방문 현황입니다. 지연(주황)·미수행(빨강)이 보이면 담당자에게 연락해 주세요.' },
  month: { central: '달력의 날짜를 누르면 그날의 상세 현황으로 이동합니다. 위의 보기 버튼으로 서비스별·담당자별·개인별로 바꿔 볼 수 있습니다.' },
  year: { central: '막대나 표의 칸을 누르면 해당 월 화면으로 이동합니다. 이행률은 어제까지의 계획 기준입니다.' },
  care: { central: '위험 점수가 높은 어르신부터 보입니다. 전화·방문 등 조치를 한 뒤 처리 상태와 메모를 남겨 주세요.' },
  discharge: { central: '퇴원일이 가까운 신청부터 보입니다. 신청인에게 연락해 상담하고, 단계를 "상담·욕구조사 → 서비스연계 → 종결"로 바꿔 가며 기록하세요. 전화로 받은 신청은 오른쪽에서 대리 접수합니다.' },
  plan: { org: '① 초안을 만들고 ② 공휴일·휴가 등 바뀐 부분만 고친 뒤 ③ 점검 결과를 확인하고 ④ 매월 20일까지 제출하세요. 승인되면 일정이 잠기고, 이후 변경은 "변경 요청"으로 올립니다.' },
  approve: { central: '수행기관이 제출한 계획을 확인하고 승인하거나 사유를 적어 반려합니다. 아래에서 확정된 일정의 변경 요청도 처리합니다.' },
  accounts: { central: '수행기관 관리자와 조회 전용 계정을 만듭니다. 처음 비밀번호는 한 번만 보이니 당사자에게 전달하세요.', org: '우리 기관 현장 수행자 계정을 만들고 관리합니다. 퇴사한 수행자는 "사용 정지"하고, 남은 일정은 월간 계획의 "담당자 일괄 이관"으로 넘기세요.' },
  audit: { admin: '누가 언제 어떤 정보를 보고 바꿨는지 기록입니다. 건강정보 열람 기록은 2년 이상 보관합니다.' },
  field: { worker: '방문하면 [방문 시작], 끝나면 [종료·상태 입력]을 누르세요. 위급하면 먼저 119에 신고한 뒤 [긴급]을 눌러 알려 주세요.' },
};
function helpStrip(tab) {
  const h = HELP[tab]; if (!h) return ''; const t = h[ROLE()] || h.central || h.admin || h.worker; if (!t || STATE.help[tab]) return '';
  return `<div class="help" role="note"><span><b>이 화면에서 할 일</b>${esc(t)}</span><button class="btn sm" data-act="hidehelp" data-k="${tab}">알겠어요</button></div>`;
}

/* ---------- 머리말·탭·알림 ---------- */
function drawChrome() {
  const me = ME();
  document.getElementById('tabs').hidden = !me || onApply();
  document.getElementById('who').hidden = false;
  document.getElementById('tabs').innerHTML = me ? (TABS[me.role] || []).map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${VS.tab === k}">${l}<span class="cnt" id="cnt-${k}" hidden></span></button>`).join('') : '';
  document.getElementById('who').innerHTML = me ? `<span class="userchip"><b>${esc(me.name)}</b> · ${ROLE_LABEL[me.role]}</span><button class="btn sm" data-act="mypw">비밀번호</button><button class="btn sm" data-act="logout">로그아웃</button>` : '';
  document.getElementById('brandsub').textContent = !me ? '로그인하세요' : me.role === 'org' ? `${SV[me.sid].vendor}` : me.role === 'worker' ? `${SV[me.sid].name} · ${SV[me.sid].role}` : '7개 서비스 · 수혜자 600명 · 담당자 210명';
  drawBanner();
}
function setBadge(tab, n) { const el = document.getElementById('cnt-' + tab); if (el) { el.textContent = n || ''; el.hidden = !n; } }
const onApply = () => location.hash === '#apply';
const SEEN = new Set(STATE.reports.map(x => x.id)); // 이 화면을 연 뒤 새로 들어온 신청만 알림(토스트)을 냄
const FLASH = new Map(); // 새로 들어온 신청 알림을 5초 동안 깜빡이게 표시
const dcSoon = () => STATE.reports.filter(x => x.st !== '종결' && x.ddn != null && x.ddn - TODAYN <= 3).length;
function drawBanner() {
  const me = ME(), b = document.getElementById('banner');
  if (!me || me.role === 'worker' || onApply()) { b.innerHTML = ''; return; }
  setBadge('discharge', STATE.reports.filter(x => x.st === '접수').length);
  const list = STATE.emgs.filter(m => m.st !== '조치완료' && visS(m.s));
  // 새 퇴원환자 지원 신청 알림 (총괄·관리자·조회 전용): '접수' 단계인 동안 표시
  const dcNew = me.role === 'org' ? [] : STATE.reports.filter(x => x.st === '접수').sort((a, c) => (a.ddn ?? 1e9) - (c.ddn ?? 1e9));
  const fresh = dcNew.filter(x => !SEEN.has(x.id));
  if (fresh.length) { fresh.forEach(x => { SEEN.add(x.id); FLASH.set(x.id, Date.now()); }); toast(`새 퇴원환자 지원 신청 ${fresh.length}건이 들어왔습니다`); }
  const isNew = x => FLASH.has(x.id) && Date.now() - FLASH.get(x.id) < 5000;
  const dcHtml = dcNew.map(x => `<div class="dcal${isNew(x) ? ' new' : ''}" role="status"><b>퇴원지원 신청</b><span>${esc(x.name)} (${esc(x.age)}세, ${esc(x.emd)}) · ${esc(x.hosp || '')} · ${ddLabel(x.ddn)}<small>${esc(x.at)} · ${esc(x.via)} · ${esc(x.kind || '')} ${esc(x.by)} · ${esc(x.needs.join(', '))}</small></span><span class="emg-a">${me.role !== 'viewer' ? `<button class="btn sm pri" data-act="dc-open" data-id="${esc(x.id)}">처리하기</button>` : `<button class="btn sm" data-act="dc-open" data-id="${esc(x.id)}">보기</button>`}</span></div>`).join('');
  b.innerHTML = dcHtml + list.map(m => { const r = R[m.rid]; return `<div class="emg" role="alert"><b>긴급</b><span>${esc(m.at)} · ${esc(r.name)} (${EMD[r.e]}) · ${esc(SV[m.s].short)} · ${esc(m.kind)}${m.note ? ` — ${esc(m.note)}` : ''}<small>신고 ${esc((findUser(m.by) || {}).name || m.by)}${m.st === '확인중' ? ` · 확인 중: ${esc(m.memo || '')}` : ''}</small></span><span class="emg-a"><button class="btn sm" data-act="open" data-rid="${m.rid}">어르신 보기</button>${me.role !== 'viewer' ? `<button class="btn sm pri" data-act="emg" data-id="${m.id}">조치 입력</button>` : ''}</span></div>`; }).join('');
  if (me.role === 'central' || me.role === 'admin') setBadge('approve', Object.values(STATE.plans).filter(p => p.st === '제출').length + STATE.crs.filter(c => c.st === '대기').length);
  if (me.role === 'org') { const s = planOf(me.sid, NEXT_YM).st; setBadge('plan', s === '작성중' || s === '반려' ? '!' : 0); }
  if (me.role !== 'org' && me.role !== 'worker') setBadge('care', [...risk().values()].filter(o => o.level === 3).length);
}
function updateClock() {
  document.getElementById('clk').innerHTML = `${dlabel(TODAYN)} <b class="num">${hm(SIM.now)}</b>`;
  document.getElementById('livedot').classList.toggle('off', !SIM.play);
  document.getElementById('playbtn').textContent = SIM.play ? '시간 멈춤' : '시간 흐름';
}
function setTab(t) {
  const allowed = (TABS[ROLE()] || []).map(x => x[0]);
  if (!allowed.includes(t)) t = allowed[0];
  VS.tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) { }
  render(); window.scrollTo(0, 0);
}
function render() {
  if (onApply()) { renderApply(); return; }
  if (!ME()) { renderLogin(); return; }
  ({ year: renderYear, month: renderMonth, day: renderDay, care: renderCare, discharge: renderDischarge, plan: renderPlan, approve: renderApprove, accounts: renderAccounts, audit: renderAudit, field: renderField })[VS.tab]();
  const hs = helpStrip(VS.tab); if (hs) view.insertAdjacentHTML('afterbegin', hs);
  if (ROLE() === 'viewer') view.querySelectorAll('select[data-care],input[data-care],select[data-rep],input[data-repmemo]').forEach(el => { el.disabled = true; });
  updateClock(); drawBanner();
}
function modal(html, locked) { document.getElementById('modalbox').innerHTML = `<div class="scrim" ${locked ? '' : 'data-act="mclose"'}></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`; const f = document.querySelector('.modal input:not([type=radio]), .modal textarea'); if (f) f.focus(); }
const mclose = () => { document.getElementById('modalbox').innerHTML = ''; };
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

/* ---------- 로그인 ---------- */
let FAILS = {};
/** 체험용 현장 수행자: 오늘 아직 남은 방문이 있는 가사 담당자 */
function demoWorker() {
  const today = daySched(TODAYN);
  const ok = W.filter(w => w.s === 1 && w.active).find(w => today.some(x => x.w.id === w.id && ['plan', 'late'].includes(st(x))));
  return ok || W[30];
}
function renderLogin(err) {
  document.getElementById('tabs').innerHTML = ''; document.getElementById('tabs').hidden = true;
  document.getElementById('brandsub').textContent = '직원 로그인';
  const dw = demoWorker();
  const demo = [['central', '총괄 담당자', '군 사업관리 부서 · 전체 현황, 계획 승인, 집중관리'], ['org2', '수행기관 관리자', '진도가사돌봄협동조합 · 월간 계획 작성·제출, 수행자 관리'], [wLogin(dw.id), '현장 수행자', `가사 ${dw.name} · 휴대폰으로 방문 기록 (오늘 남은 방문 있음)`], ['admin', '시스템 관리자', '군 전산 담당 · 계정 전체, 접속기록'], ['viewer', '조회 전용', '보건소 · 현황 보기만']];
  view.innerHTML = `<div class="lwrap"><div class="lbox">
    <div class="panel"><h3>로그인</h3><form class="lform" id="loginform">${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
      <label>아이디<input id="lg-id" autocomplete="username" required></label><label>비밀번호<input id="lg-pw" type="password" autocomplete="current-password" required></label>
      <button class="btn pri" type="submit">로그인</button><p class="empty-note" style="margin:0">비밀번호를 잊었으면 소속 기관 관리자(기관 관리자는 군 총괄 담당자)에게 초기화를 요청하세요.</p></form></div>
    <div class="panel"><h3>체험용 계정으로 바로 들어가기</h3><div class="demo">${demo.map(([l, r, d]) => `<button data-act="demo" data-l="${l}"><b>${r} <small>(${l})</small></b><span>${esc(d)}</span></button>`).join('')}</div>
      <p class="empty-note" style="margin:8px 0 0">체험 계정 비밀번호는 모두 <b>${DEMO_PW}</b>입니다. 역할을 바꿔 가며 같은 내용이 어떻게 이어지는지 보세요(예: 수행기관이 제출 → 총괄이 승인).</p></div>
    <div class="panel applylink"><h3>통합돌봄 퇴원환자 지원 신청</h3><p>퇴원했거나 퇴원 예정인 어르신의 본인·보호자·병원 담당자는 로그인 없이 신청할 수 있습니다.</p><button class="btn pri" data-act="go-apply">신청 페이지로 가기</button></div>
  </div></div>`;
}
function doLogin(login, pw) {
  const u = findUser(login);
  if (!u || !u.active) { audit('login_fail', login, '없는 계정 또는 정지된 계정'); save(); renderLogin('아이디 또는 비밀번호가 맞지 않습니다.'); return; }
  if ((FAILS[login] || 0) >= 5) { renderLogin('비밀번호를 5회 틀려 잠겼습니다. 관리자에게 초기화를 요청하세요.'); return; }
  if (pw !== u.pw) { FAILS[login] = (FAILS[login] || 0) + 1; STATE.session = null; audit('login_fail', login, `비밀번호 오류 ${FAILS[login]}회`); save(); renderLogin(`아이디 또는 비밀번호가 맞지 않습니다. (${FAILS[login]}/5)`); return; }
  FAILS[login] = 0; STATE.session = login; setUserMod(login, { last: nowStr() }); audit('login', login, ROLE_LABEL[u.role]); save();
  VS.tab = (TABS[u.role] || [['day']])[0][0]; VS.pcell = null; VS.drawer = null;
  if (u.role === 'org') { VS.msvc = VS.wsvc = u.sid; VS.f.svc = ''; } else { VS.msvc = VS.wsvc = 1; }
  drawChrome(); setTab(VS.tab);
  if (u.must) pwModal(true);
}

/* ---------- 연간 ---------- */
function renderYear() {
  const ya = yearAgg(), cm = TODAY.getMonth(), vs = VSV();
  const td = dayAgg(TODAYN);
  const mon = ya.months.map((M, m) => M.map((a, i) => { const o = { ...a }; if (m === cm) o.done += td[i].done; return o; }));
  const tot = SV.map(() => ({ plan: 0, pplan: 0, done: 0, pdone: 0, miss: 0, cancel: 0 }));
  ya.months.forEach((M, m) => M.forEach((a, i) => { const T = tot[i]; T.plan += a.plan; T.pplan += a.pplan; T.pdone += a.done; T.done += a.done + (m === cm ? td[i].done : 0); T.miss += a.miss; T.cancel += a.cancel; }));
  const sum = k => vs.reduce((s, S) => s + tot[S.i][k], 0);
  const rate = T => pct(T.pdone, T.pplan - T.cancel);
  const users = SV.map((S, i) => R.filter(r => r.svc[i] && r.svc[i].from <= TODAYN - YEAR0N).length);
  const mtot = m => vs.reduce((s, S) => s + mon[m][S.i].plan, 0);
  const mx = Math.max(...mon.map((_, m) => mtot(m))), step = nice(mx), top = Math.max(step, Math.ceil(mx / step) * step);
  const Wd = 780, H = 270, ml = 52, mr = 10, mt = 12, mb = 30, iw = Wd - ml - mr, ih = H - mt - mb, bw = iw / 12 * .62, y = v => mt + ih - v / top * ih;
  let g = ''; for (let v = 0; v <= top; v += step) g += `<line class="gridl" x1="${ml}" x2="${Wd - mr}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  let bars = '';
  mon.forEach((M, m) => { const x = ml + iw / 12 * m + (iw / 12 - bw) / 2; let acc = 0, parts = '', dm = 0;
    vs.forEach(S => { const a = M[S.i], solid = a.done, light = Math.max(0, a.plan - a.done - a.miss - a.cancel); dm += solid;
      if (solid) { parts += `<rect x="${x}" y="${y(acc + solid)}" width="${bw}" height="${ih * solid / top}" style="fill:${S.c}"/>`; acc += solid; }
      if (light) { parts += `<rect x="${x}" y="${y(acc + light)}" width="${bw}" height="${ih * light / top}" style="fill:${S.c};opacity:.28"/>`; acc += light; } });
    bars += `<g class="bar" data-act="ymonth" data-m="${m}"><title>${m + 1}월 · 계획 ${fmt(mtot(m))}건 · 제공 ${fmt(dm)}건</title>${parts}<rect x="${x - 4}" y="${mt}" width="${bw + 8}" height="${ih}" fill="transparent"/></g><text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" style="${m === cm ? 'font-weight:700;fill:var(--ink)' : ''}">${m + 1}월</text>`; });
  const heat = vs.map(S => `<tr><th>${S.short}</th>${ya.months.map((M, m) => { const a = M[S.i], den = a.pplan - a.cancel; if (den <= 0) return `<td class="hc" data-act="heat" data-m="${m}" data-s="${S.i}" style="color:var(--faint)">–</td>`;
    const rt = pct(a.done, den), c = rt >= 99 ? 'var(--st-done)' : rt >= 98 ? 'color-mix(in srgb,var(--st-done) 55%,var(--st-late))' : rt >= 97 ? 'var(--st-late)' : 'var(--st-miss)';
    return `<td class="hc num" data-act="heat" data-m="${m}" data-s="${S.i}" style="background:color-mix(in srgb,${c} ${rt >= 99 ? 22 : 34}%,transparent)" title="${S.name} ${m + 1}월 이행률 ${rt}%">${rt.toFixed(1)}</td>`; }).join('')}</tr>`).join('');
  const emdDone = EMD.map((_, e) => vs.reduce((s, S) => s + ya.emd[S.i][e], 0)), emdMax = Math.max(1, ...emdDone);
  const emdN = EMD.map((_, e) => R.filter(r => r.e === e && vs.some(S => r.svc[S.i])).length);
  const nRec = R.filter(r => vs.some(S => r.svc[S.i])).length;
  view.innerHTML = `
  <section class="vhead"><h2>${YEAR}년 서비스 제공 현황</h2><span class="sub">1월 1일 ~ ${dlabel(TODAYN)} 누적 · 이행률은 어제까지 기준</span></section>
  <div class="kpis">
    <div class="kpi"><span class="k">누적 제공</span><span class="v">${fmt(sum('done'))}</span><span class="d">연간 계획 ${fmt(sum('plan'))}건</span></div>
    <div class="kpi"><span class="k">계획 대비 이행률</span><span class="v">${pct(sum('pdone'), sum('pplan') - sum('cancel'))}%</span><span class="d">취소 제외</span></div>
    <div class="kpi"><span class="k">이용 수혜자</span><span class="v">${fmt(nRec)}</span><span class="d">${ORG() == null ? `2개 이상 이용 ${R.filter(r => r.en.length >= 2).length}명` : esc(SV[ORG()].name)}</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-miss)"></i>미수행</span><span class="v">${fmt(sum('miss'))}</span><span class="d">취소 ${fmt(sum('cancel'))}건</span></div>
    <div class="kpi"><span class="k">담당자</span><span class="v">${W.filter(w => w.active && visS(w.s)).length}</span><span class="d">${vs.length}개 수행기관</span></div>
  </div>
  <div class="svccards" style="${vs.length === 1 ? 'grid-template-columns:minmax(0,320px)' : ''}">${vs.map(S => `<div class="svccard" style="--c:${S.c}"><span class="n">${S.name}</span><span class="vd">${S.vendor}</span><span class="v">${fmt(tot[S.i].done)}<small style="font-size:12px;font-weight:500;color:var(--muted)"> 건</small></span>
    <span class="row">이행률 <b>${rate(tot[S.i])}%</b></span><span class="row">이용자 <b>${users[S.i]}명</b></span><span class="row">미수행 <b>${tot[S.i].miss}</b></span></div>`).join('')}</div>
  <div class="panel"><h3>월별 서비스 제공 추이 <small>진한 색: 제공 완료 · 옅은 색: 남은 계획 · 막대를 누르면 월간 화면</small></h3>
    <div class="legend" style="margin-bottom:6px">${vs.map(S => `<span><i class="dot" style="--c:${S.c}"></i>${S.name}</span>`).join('')}</div>
    <div class="chartwrap"><svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="월별 서비스 제공 건수">${g}${bars}</svg></div></div>
  <div class="panel"><h3>서비스 × 월 이행률 (%) <small>낮은 칸일수록 붉게 · 칸을 누르면 해당 월로 이동</small></h3>
    <div class="tblwrap"><table class="heat"><thead><tr><th></th>${Array.from({ length: 12 }, (_, m) => `<th style="text-align:center">${m + 1}월</th>`).join('')}</tr></thead><tbody>${heat}</tbody></table></div></div>
  <div class="grid2">
    <div class="panel"><h3>읍·면별 현황 <small>수혜자 수 · 누적 제공</small></h3>${EMD.map((n, e) => `<div class="emdrow"><span>${n}</span><div class="hbar"><i style="width:${emdDone[e] / emdMax * 100}%;background:var(--accent)"></i></div><span class="r">${emdN[e]}명 · ${fmt(emdDone[e])}건</span></div>`).join('')}</div>
    <div class="panel"><h3>수행기관별 실적</h3><div class="tblwrap"><table><thead><tr><th>서비스</th><th>수행기관</th><th class="r">대상자</th><th class="r">연간 계획</th><th class="r">누적 제공</th><th class="r">이행률</th></tr></thead><tbody>
      ${vs.map(S => `<tr><td><i class="dot" style="--c:${S.c}"></i> ${S.short}</td><td>${S.vendor}</td><td class="r">${users[S.i]}</td><td class="r">${fmt(tot[S.i].plan)}</td><td class="r">${fmt(tot[S.i].done)}</td><td class="r"><b>${rate(tot[S.i])}%</b></td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
}

/* ---------- 월간 ---------- */
function monthDays(m) { return monthDNs(`${YEAR}-${pad(m + 1)}`); }
function renderMonth() {
  const m = VS.month, days = monthDays(m), first = fromDN(days[0]).getDay(), vs = VSV();
  const visR = R.filter(r => vs.some(S => r.svc[S.i]));
  if (VS.mperson == null || !visR.includes(R[VS.mperson])) { const rk = risk(); VS.mperson = [...visR].sort((a, b) => rk.get(b.id).score - rk.get(a.id).score)[0].id; }
  if (!vs.some(S => S.i === VS.msvc)) VS.msvc = vs[0].i;
  const modes = [['all', '전체'], ['svc', '서비스별'], ['worker', '담당자별'], ['person', '개인별']];
  const svcSel = vs.length > 1 ? `<select id="msvc" aria-label="서비스">${vs.map(S => `<option value="${S.i}" ${S.i === VS.msvc ? 'selected' : ''}>${S.name}</option>`).join('')}</select>` : '';
  const P = R[VS.mperson];
  const personSel = `<input type="search" id="mperson" list="plist" placeholder="이름 또는 번호" value="${P.name} (${P.code})" style="width:200px" aria-label="수혜자 선택"><datalist id="plist">${visR.map(r => `<option value="${r.name} (${r.code})">${EMD[r.e]} · ${r.age}세</option>`).join('')}</datalist>`;
  const aggs = new Map(days.map(dn => [dn, dayAgg(dn)]));
  const sm = SV.map(() => ({ plan: 0, done: 0, miss: 0, cancel: 0 }));
  days.forEach(dn => aggs.get(dn).forEach((o, i) => { sm[i].plan += o.plan; sm[i].done += o.done; sm[i].miss += o.miss; sm[i].cancel += o.cancel; }));
  let body = '';
  if (VS.mmode === 'worker') body = workerGrid(days);
  else { let cells = WD.map((w, i) => `<div class="wh ${i === 0 ? 'sun' : ''}">${w}</div>`).join(''); for (let i = 0; i < first; i++) cells += '<div class="cday empty"></div>'; for (const dn of days) cells += dayCell(dn, aggs.get(dn)); body = `<div class="tblwrap"><div class="cal">${cells}</div></div>`; }
  const ym = `${YEAR}-${pad(m + 1)}`, nym = addMonths(ym, 1);
  const legend = VS.mmode === 'worker' ? '<span><i class="wc ok" style="width:14px;min-width:0">&nbsp;</i>모두 완료</span><span><i class="wc lt" style="width:14px;min-width:0">&nbsp;</i>지연 있음</span><span><i class="wc bad" style="width:14px;min-width:0">&nbsp;</i>미수행 있음</span><span><i class="wc pl" style="width:14px;min-width:0">&nbsp;</i>계획</span> · 숫자는 방문 건수'
    : VS.mmode === 'person' ? Object.entries(STL).map(([k, l]) => `<span><i class="dot st-${k}"></i>${l}</span>`).join('') + '<span><b style="color:var(--h2)">!</b> 건강 나쁨</span>'
    : '지난 날: 완료/계획 · 오늘: 실시간 · 이후: 계획 건수 · <b style="color:var(--st-miss)">빨간 숫자</b>: 미수행 · 날짜를 누르면 일간 화면';
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="mprev" aria-label="이전 달" ${m === 0 ? 'disabled' : ''}>◀</button><h2>${YEAR}년 ${m + 1}월</h2><button class="btn" data-act="mnext" aria-label="다음 달" ${m === 11 ? 'disabled' : ''}>▶</button></div>
    <div class="seg" role="group" aria-label="보기">${modes.map(([k, l]) => `<button data-act="mmode" data-k="${k}" aria-pressed="${VS.mmode === k}">${l}</button>`).join('')}</div>
    <div class="ctl">${VS.mmode === 'svc' || VS.mmode === 'worker' ? svcSel : ''}${VS.mmode === 'person' ? personSel : ''}</div></section>
  ${VS.mmode === 'person' ? `<div class="panel" style="display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center"><b style="font-size:16px">${P.name}</b><span>${P.age}세 · ${P.sex} · ${EMD[P.e]} · ${HOUSE[P.house]}</span>${riskBadge(risk().get(P.id).level)}<span style="color:var(--muted)">${P.en.filter(en => visS(en.s)).map(en => `${SV[en.s].short}(${schedText(en)})`).join(' · ')}</span><button class="btn sm" data-act="open" data-rid="${P.id}" style="margin-left:auto">상세 보기</button></div>` : ''}
  <div class="mlay"><div class="panel" style="padding:10px">${body}<div class="legend" style="margin-top:10px">${legend}</div></div>
    <div class="rail">
      <div class="panel"><h3>${m + 1}월 서비스별 실적</h3>${vs.map(S => { const o = sm[S.i], r = pct(o.done, o.plan - o.cancel); return `<div class="sb" style="margin-bottom:8px"><div class="t"><span><i class="dot" style="--c:${S.c}"></i> ${S.name}</span><span><b>${fmt(o.done)}</b> / ${fmt(o.plan)}</span></div><div class="hbar"><i style="width:${r}%;background:${S.c}"></i></div><div class="t"><span>진척 ${r}%</span><span>${o.miss ? `<span style="color:var(--st-miss)">미수행 ${o.miss}</span> · ` : ''}취소 ${o.cancel}</span></div></div>`; }).join('')}</div>
      <div class="panel"><h3>계획 승인 상태 <small>${m + 1}월 / ${+nym.slice(5)}월</small></h3>${vs.map(S => `<div class="cl" style="font-size:12.5px;padding:4px 0;gap:6px"><i class="sw" style="--c:${S.c}"></i>${S.short}<span style="margin-left:auto;display:flex;gap:4px">${pill(planOf(S.i, ym).st)}${pill(planOf(S.i, nym).st)}</span></div>`).join('')}
        ${ROLE() === 'central' || ROLE() === 'admin' ? '<button class="btn sm" data-act="tab" data-tab="approve" style="margin-top:8px">계획 승인 화면으로</button>' : ROLE() === 'org' ? '<button class="btn sm" data-act="tab" data-tab="plan" style="margin-top:8px">월간 계획 화면으로</button>' : ''}</div>
    </div></div>`;
}
function dayCell(dn, a) {
  const d = fromDN(dn), dow = d.getDay(), fut = dn > TODAYN, isT = dn === TODAYN, vs = VSV();
  const cls = `cday${isT ? ' today' : ''}${fut ? ' fut' : ''}`;
  const dh = extra => `<div class="dh"><span class="${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}">${d.getDate()}${isT ? ' · 오늘' : ''}</span>${extra || ''}</div>`;
  if (VS.mmode === 'person') {
    const recs = daySched(dn).filter(x => x.r.id === VS.mperson && visS(x.s)).sort((p, q) => p.s - q.s);
    return `<button class="${cls}" data-act="mday" data-dn="${dn}">${dh()}${recs.map(x => { const i = info(x); return `<span class="pchip st-${i.s}"><i class="dot"></i>${SV[x.s].short}${i.s === 'done' && i.h === 2 ? ' <b style="color:var(--h2)">!</b>' : ''}</span>`; }).join('')}</button>`;
  }
  if (VS.mmode === 'svc') {
    const o = a[VS.msvc], S = SV[VS.msvc]; if (!o.plan) return `<button class="${cls}" data-act="mday" data-dn="${dn}">${dh()}<span class="empty-note">일정 없음</span></button>`;
    const r = pct(o.done, o.plan - o.cancel);
    return `<button class="${cls}" data-act="mday" data-dn="${dn}">${dh(fut ? '' : `<span class="rate" style="--c:${r >= 98 ? 'var(--st-done)' : 'var(--st-late)'}">${r}%</span>`)}<span class="big">${fut ? o.plan : `${o.done}<small style="font-size:13px;color:var(--muted)">/${o.plan}</small>`}</span><div class="hbar"><i style="width:${fut ? 0 : r}%;background:${S.c}"></i></div><span class="cl">${fut ? '계획' : `${o.miss ? `<span class="mx">미수행 ${o.miss}</span>` : ''}${o.late ? ` <span class="mx" style="color:var(--st-late)">지연 ${o.late}</span>` : ''}${o.cancel ? ` 취소 ${o.cancel}` : ''}`}</span></button>`;
  }
  const tp = vs.reduce((s, S) => s + a[S.i].plan, 0), tdn = vs.reduce((s, S) => s + a[S.i].done, 0), tc = vs.reduce((s, S) => s + a[S.i].cancel, 0), r = pct(tdn, tp - tc);
  if (!tp) return `<button class="${cls}" data-act="mday" data-dn="${dn}">${dh()}<span class="empty-note">일정 없음</span></button>`;
  return `<button class="${cls}" data-act="mday" data-dn="${dn}">${dh(fut ? `<span class="rate" style="--c:var(--st-plan)">계획 ${tp}</span>` : `<span class="rate" style="--c:${r >= 98 ? 'var(--st-done)' : isT ? 'var(--st-prog)' : 'var(--st-late)'}">${r}%</span>`)}
    ${vs.map(S => { const o = a[S.i]; return o.plan ? `<span class="cl"><i class="sw" style="--c:${S.c}"></i>${S.short}${o.miss ? ` <span class="mx">${o.miss}</span>` : ''}${o.late ? ` <span class="mx" style="color:var(--st-late)">${o.late}</span>` : ''}<b>${fut ? o.plan : `${o.done}/${o.plan}`}</b></span>` : ''; }).join('')}</button>`;
}
function workerGrid(days) {
  const si = VS.msvc, ws = W.filter(w => w.s === si), map = new Map();
  for (const dn of days) for (const x of daySched(dn)) if (x.s === si) { const k = x.w.id + '_' + dn; let o = map.get(k); if (!o) { o = { n: 0, miss: 0, late: 0, fut: dn > TODAYN }; map.set(k, o); } o.n++; const s = st(x); if (s === 'miss') o.miss++; if (s === 'late') o.late++; }
  return `<div class="tblwrap"><table class="wgrid"><thead><tr><th style="text-align:left;position:sticky;left:0;background:var(--surface)">담당자 (${SV[si].role})</th>${days.map(dn => { const d = fromDN(dn); return `<th style="${dn === TODAYN ? 'color:var(--accent)' : d.getDay() === 0 ? 'color:var(--st-miss)' : ''}">${d.getDate()}</th>`; }).join('')}<th class="r">합계</th></tr></thead><tbody>
  ${ws.map(w => { let t = 0; return `<tr><td class="wn">${w.name}${w.active ? '' : ' <em class="tag">정지</em>'} <small style="color:var(--muted)">${EMD[w.e]}</small></td>${days.map(dn => { const o = map.get(w.id + '_' + dn); if (!o) return '<td></td>'; t += o.n; const c = o.fut ? 'pl' : o.miss ? 'bad' : o.late ? 'lt' : 'ok'; return `<td><span class="wc ${c}" data-act="mday" data-dn="${dn}" title="${sdate(dn)} ${o.n}건${o.miss ? ` · 미수행 ${o.miss}` : ''}">${o.n}</span></td>`; }).join('')}<td class="r num">${t}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

/* ---------- 일간 ---------- */
function renderDay() {
  const f = VS.f, vs = VSV();
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="dprev" aria-label="이전 날">◀</button><h2 id="dtitle"></h2><button class="btn" data-act="dnext" aria-label="다음 날">▶</button><button class="btn sm" data-act="dtoday">오늘</button></div>
    <span class="sub" id="dsubt"></span>
    <div class="seg" role="group" aria-label="보기" style="margin-left:auto"><button data-act="dsub" data-k="people" aria-pressed="${VS.dsub === 'people'}">수혜자별</button><button data-act="dsub" data-k="tl" aria-pressed="${VS.dsub === 'tl'}">담당자 타임라인</button></div></section>
  <div class="kpis" id="dkpi"></div>
  <div class="panel"><h3>서비스별 진행 <small>완료 / 계획</small></h3><div class="svcbars" id="dsvc"></div></div>
  <div class="dlay">
    <div class="panel" id="dmain">
      <div class="ctl" id="dfilters" style="margin-bottom:10px">
        <input type="search" id="fq" placeholder="이름·번호 검색" value="${esc(f.q)}" style="width:150px" aria-label="검색">
        <select id="femd" aria-label="읍면"><option value="">전체 읍·면</option>${EMD.map((e, i) => `<option value="${i}" ${String(i) === f.emd ? 'selected' : ''}>${e}</option>`).join('')}</select>
        ${vs.length > 1 ? `<select id="fsvc" aria-label="서비스"><option value="">전체 서비스</option>${vs.map(S => `<option value="${S.i}" ${String(S.i) === f.svc ? 'selected' : ''}>${S.name}</option>`).join('')}</select>` : ''}
        <select id="fst" aria-label="상태"><option value="">전체 상태</option>${[['issue', '지연·미수행'], ['bad', '건강이상'], ['prog', '진행중'], ['open', '미완료']].map(([k, l]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="fsort" aria-label="정렬">${[['risk', '주의 필요 순'], ['name', '이름순'], ['emd', '읍·면순']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label><input type="checkbox" id="fall" ${f.all ? 'checked' : ''}> 일정 없는 대상자 포함</label>
      </div>
      <div id="dbody"></div>
    </div>
    <aside class="rail"><div class="panel" id="dalerts"></div><div class="panel" id="dfeed"></div></aside>
  </div>`;
  updateDay();
}
function updateDay() {
  if (VS.tab !== 'day' || !document.getElementById('dkpi')) return;
  const dn = VS.date, recs = visDay(dn), rk = risk(), isT = dn === TODAYN, fut = dn > TODAYN, vs = VSV();
  const inf = new Map(recs.map(x => [x, info(x)]));
  document.getElementById('dtitle').textContent = `${fromDN(dn).getFullYear()}년 ${dlabel(dn)}`;
  document.getElementById('dsubt').textContent = isT ? `${hm(SIM.now)} 기준 실시간` : fut ? '계획만 등록된 날' : '지난 날의 기록';
  const c = { plan: 0, prog: 0, done: 0, late: 0, miss: 0, cancel: 0 }; let bad = 0;
  recs.forEach(x => { const i = inf.get(x); c[i.s]++; if (i.s === 'done' && i.h === 2) bad++; });
  const tot = recs.length;
  document.getElementById('dkpi').innerHTML = [['계획', tot, '', `수혜자 ${new Set(recs.map(x => x.r.id)).size}명`], ['완료', c.done, 'var(--st-done)', `${pct(c.done, tot - c.cancel)}%`], ['진행중', c.prog, 'var(--st-prog)', '현재 방문 중'], ['예정', c.plan, 'var(--st-plan)', '시작 전'], ['지연', c.late, 'var(--st-late)', '예정 30분 경과'], ['미수행', c.miss, 'var(--st-miss)', '마감 후 미완료'], ['취소', c.cancel, 'var(--st-cancel)', '입원·부재 등'], ['건강이상', bad, 'var(--h2)', '상태 나쁨 보고']]
    .map(([k, v, col, d]) => `<div class="kpi"><span class="k">${col ? `<i class="dot" style="--c:${col}"></i>` : ''}${k}</span><span class="v">${fmt(v)}</span><span class="d">${d}</span></div>`).join('');
  document.getElementById('dsvc').innerHTML = vs.map(S => { const o = { plan: 0, done: 0, prog: 0, late: 0, miss: 0, cancel: 0 }; recs.forEach(x => { if (x.s === S.i) { o.plan++; const s = inf.get(x).s; if (s !== 'plan') o[s]++; } }); const p = o.plan || 1;
    return `<div class="sb"><div class="t"><span><i class="dot" style="--c:${S.c}"></i> ${S.name}</span><span><b>${o.done}</b> / ${o.plan}</span></div><div class="hbar"><i style="width:${o.done / p * 100}%;background:var(--st-done)"></i><i style="width:${o.prog / p * 100}%;background:var(--st-prog)"></i><i style="width:${o.late / p * 100}%;background:var(--st-late)"></i><i style="width:${o.miss / p * 100}%;background:var(--st-miss)"></i><i style="width:${o.cancel / p * 100}%;background:var(--st-cancel)"></i></div></div>`; }).join('');
  document.getElementById('dfilters').hidden = VS.dsub === 'tl';
  document.getElementById('dbody').innerHTML = VS.dsub === 'tl' ? timeline(recs, inf) : peopleTable(recs, inf, rk);
  renderSide(recs, inf, rk);
  if (VS.drawer != null) renderDrawer();
}
function chipFor(x, i) {
  const S = SV[x.s], s = i.s, tm = (s === 'prog' || s === 'done') && i.start != null ? i.start : x.t, warn = s === 'done' && i.h === 2;
  const tip = `${S.name} · 담당 ${x.w.name}\n예정 ${hm(x.t)}${i.start != null ? ` · 시작 ${hm(i.start)}` : ''}${i.end != null ? ` · 종료 ${hm(i.end)}` : ''}\n상태 ${STL[s]}${s === 'done' && i.h >= 0 ? ` · 건강 ${HL[i.h]}` : ''}${i.flags.length ? ` (${i.flags.join(', ')})` : ''}${i.reason ? ` · 사유 ${i.reason}` : ''}${i.note ? `\n메모: ${i.note}` : ''}`;
  return `<span class="chip st-${s}${warn ? ' warn' : ''}" title="${esc(tip)}"><i class="dot"></i><span class="tm">${hm(tm)}</span>${s === 'done' ? (i.h >= 0 ? `<i class="hd" style="--hc:var(--h${i.h})"></i>` : '완료') : s === 'plan' ? '' : STL[s]}${warn ? '<span class="ex">!</span>' : ''}</span>`;
}
function peopleTable(recs, inf, rk) {
  const f = VS.f, by = new Map(), vs = VSV();
  recs.forEach(x => { let a = by.get(x.r.id); if (!a) { a = new Array(7).fill(null); by.set(x.r.id, a); } a[x.s] = x; });
  let rows = f.all ? R.filter(r => vs.some(S => r.svc[S.i])) : R.filter(r => by.has(r.id));
  const q = f.q.trim();
  rows = rows.filter(r => {
    if (q && !(r.name.includes(q) || r.code.toLowerCase().includes(q.toLowerCase()))) return false;
    if (f.emd !== '' && r.e !== +f.emd) return false;
    if (f.svc !== '' && !r.svc[+f.svc]) return false;
    const a = by.get(r.id) || [];
    const cells = (f.svc !== '' ? [a[+f.svc]] : a).filter(Boolean).map(x => ({ x, i: inf.get(x) }));
    if (f.st === 'issue' && !cells.some(c => c.i.s === 'late' || c.i.s === 'miss')) return false;
    if (f.st === 'bad' && !cells.some(c => c.i.s === 'done' && c.i.h === 2)) return false;
    if (f.st === 'prog' && !cells.some(c => c.i.s === 'prog')) return false;
    if (f.st === 'open' && !cells.some(c => ['plan', 'late', 'prog'].includes(c.i.s))) return false;
    return true;
  });
  const pri = r => { let p = rk.get(r.id).level * 10; (by.get(r.id) || []).filter(Boolean).forEach(x => { const s = inf.get(x); if (s.s === 'late' || s.s === 'miss') p += 40; if (s.s === 'done' && s.h === 2) p += 30; }); return p; };
  if (f.sort === 'risk') { const pm = new Map(rows.map(r => [r.id, pri(r)])); rows.sort((a, b) => pm.get(b.id) - pm.get(a.id) || a.id - b.id); }
  else if (f.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'ko')); else rows.sort((a, b) => a.e - b.e || a.id - b.id);
  const legend = `<div class="legend" style="margin-bottom:8px">${Object.entries(STL).map(([k, l]) => `<span><i class="dot st-${k}"></i>${l}</span>`).join('')}<span>· 건강</span>${HL.map((l, i) => `<span><i class="dot" style="--c:var(--h${i})"></i>${l}</span>`).join('')}<span><b style="color:var(--h2)">!</b> 이상 보고</span></div>`;
  return `${legend}<div class="ptbl"><table><thead><tr><th>수혜자 <span style="font-weight:400">(${rows.length}명)</span></th><th>읍·면</th>${vs.map(S => `<th><i class="dot" style="--c:${S.c}"></i> ${S.short}</th>`).join('')}</tr></thead><tbody>
  ${rows.map(r => { const a = by.get(r.id) || []; return `<tr class="pr" data-act="open" data-rid="${r.id}"><td><div class="pname"><span><b>${r.name}</b> <small style="color:var(--muted)">${r.age}·${r.sex}</small>${r.alone ? '<em class="tag">독거</em>' : ''}${riskBadge(rk.get(r.id).level)}</span><small>${r.code}</small></div></td><td>${EMD[r.e]}</td>
    ${vs.map(S => a[S.i] ? `<td>${chipFor(a[S.i], inf.get(a[S.i]))}</td>` : r.svc[S.i] ? '<td class="none">·</td>' : '<td></td>').join('')}</tr>`; }).join('') || `<tr><td colspan="9" class="empty-note">조건에 맞는 수혜자가 없습니다.</td></tr>`}
  </tbody></table></div>`;
}
function timeline(recs, inf) {
  const vs = VSV(); if (!vs.some(S => S.i === VS.wsvc)) VS.wsvc = vs[0].i;
  const si = VS.wsvc, ws = W.filter(w => w.s === si), T0m = 480, span = 660, isT = VS.date === TODAYN;
  const by = new Map(); recs.forEach(x => { if (x.s !== si) return; let a = by.get(x.w.id); if (!a) { a = []; by.set(x.w.id, a); } a.push(x); });
  const ax = []; for (let h = 8; h <= 19; h++) ax.push(`<span style="left:${(h * 60 - T0m) / span * 100}%">${h}시</span>`);
  return `${vs.length > 1 ? `<div class="seg" style="margin-bottom:10px">${vs.map(S => `<button data-act="wsvc" data-k="${S.i}" aria-pressed="${S.i === si}">${S.short}</button>`).join('')}</div>` : ''}
  <div class="legend" style="margin-bottom:8px">${Object.entries(STL).map(([k, l]) => `<span><i class="dot st-${k}"></i>${l}</span>`).join('')}<span>빨간 테두리: 건강 이상</span></div>
  <div class="tblwrap"><div class="tl"><div class="tlr"><span></span><div class="axis">${ax.join('')}</div></div>
  ${ws.map(w => { const a = by.get(w.id) || []; return `<div class="tlr"><span class="wl"><span>${w.name}</span><small>${EMD[w.e]} · ${a.length}건</small></span><div class="track">
    ${a.map(x => { const i = inf.get(x), s0 = i.start != null ? i.start : x.t, e0 = i.end != null ? i.end : i.s === 'prog' ? Math.max(SIM.now, s0 + 2) : s0 + x.d; return `<span class="seg2 st-${i.s}${i.s === 'done' && i.h === 2 ? ' w' : ''}" data-act="open" data-rid="${x.r.id}" style="left:${Math.max(0, s0 - T0m) / span * 100}%;width:${Math.max(e0 - s0, 4) / span * 100}%" title="${x.r.name} · ${hm(s0)} ${STL[i.s]}"></span>`; }).join('')}
    ${isT ? `<span class="nowl" style="left:${(SIM.now - T0m) / span * 100}%"></span>` : ''}</div></div>`; }).join('')}</div></div>`;
}
function renderSide(recs, inf, rk) {
  const dn = VS.date, isT = dn === TODAYN, al = [];
  recs.forEach(x => { const i = inf.get(x), S = SV[x.s];
    if (i.s === 'late') al.push({ sev: 2, rid: x.r.id, c: 'var(--st-late)', t: `<b>${x.r.name}</b> · ${S.short} 지연`, d: `예정 ${hm(x.t)}, 아직 시작 전 · 담당 ${x.w.name}` });
    if (i.s === 'miss') al.push({ sev: 2, rid: x.r.id, c: 'var(--st-miss)', t: `<b>${x.r.name}</b> · ${S.short} 미수행`, d: `예정 ${hm(x.t)} · 담당 ${x.w.name}` });
    if (i.s === 'done' && i.h === 2) al.push({ sev: rk.get(x.r.id).level >= 2 ? 3 : 1, rid: x.r.id, c: 'var(--h2)', t: `<b>${x.r.name}</b> · ${S.short} 건강이상`, d: `${esc(i.flags.join(', ') || '상태 나쁨')} · ${hm(i.end)} 보고` }); });
  if (isT) R.forEach(r => { const o = rk.get(r.id); if (o.level === 3 && !al.some(a => a.rid === r.id) && VSV().some(S => r.svc[S.i])) al.push({ sev: 2.5, rid: r.id, c: 'var(--st-miss)', t: `<b>${r.name}</b> · 위험군`, d: o.reasons.slice(0, 2).join(' · ') }); });
  al.sort((a, b) => b.sev - a.sev);
  document.getElementById('dalerts').innerHTML = `<h3>주의 필요 <small>${al.length}건</small></h3>${al.slice(0, 14).map(a => `<div class="al" data-act="open" data-rid="${a.rid}"><span class="sev" style="--c:${a.c}"></span><span class="tx">${a.t}<small>${a.d}</small></span></div>`).join('') || '<p class="empty-note">확인이 필요한 항목이 없습니다.</p>'}${al.length > 14 ? `<p class="empty-note">외 ${al.length - 14}건은 표에서 '주의 필요 순'으로 확인</p>` : ''}`;
  const fe = document.getElementById('dfeed');
  if (dn > TODAYN) { fe.innerHTML = '<h3>수행 기록</h3><p class="empty-note">아직 오지 않은 날입니다. 계획된 일정만 표시됩니다.</p>'; return; }
  const ev = []; recs.forEach(x => { const i = inf.get(x); if (i.start != null) ev.push({ t: i.start, x, i, k: 'start' }); if (i.end != null) ev.push({ t: i.end, x, i, k: 'end' }); });
  ev.sort((a, b) => b.t - a.t);
  fe.innerHTML = `<h3>${isT ? '실시간 수행 기록' : '수행 기록'} <small>현장 앱 입력</small></h3><div class="feed">${ev.slice(0, 30).map(e => `<div class="fe"><span class="tm">${hm(e.t)}</span><span><b>${e.x.r.name}</b> · ${SV[e.x.s].short} ${e.k === 'start' ? '시작' : '완료'}${e.k === 'end' && e.i.h >= 0 ? ` · 건강 <span style="color:var(--h${e.i.h});font-weight:600">${HL[e.i.h]}</span>` : ''}${STATE.visits[e.x.k] ? ' <em class="tag">앱 입력</em>' : ''}<br><small style="color:var(--muted)">${e.x.w.name} · ${EMD[e.x.r.e]}</small></span></div>`).join('') || '<p class="empty-note">아직 기록이 없습니다.</p>'}</div>`;
}

/* ---------- 개인 상세 ---------- */
function renderDrawer() {
  const box = document.getElementById('drawerbox');
  if (VS.drawer == null) { box.innerHTML = ''; return; }
  const r = R[VS.drawer], o = risk().get(r.id), dn = VS.tab === 'day' ? VS.date : TODAYN;
  const recs = daySched(dn).filter(x => x.r.id === r.id && visS(x.s)).sort((a, b) => a.t - b.t);
  const care = STATE.care[r.id], ens = r.en.filter(en => visS(en.s));
  const days = []; for (let d = TODAYN - 29; d <= TODAYN; d++) days.push(d);
  const rowsH = ens.map(en => `<span>${SV[en.s].short}</span>` + days.map(d => { const x = daySched(d).find(y => y.r.id === r.id && y.s === en.s); if (!x) return '<i></i>'; const i = info(x); const cl = i.s === 'done' ? 'g' + Math.max(0, i.h) : i.s === 'miss' ? 'gm' : i.s === 'cancel' ? 'gc' : 'gp'; return `<i class="${cl}" title="${sdate(d)} ${SV[en.s].short} ${STL[i.s]}${i.s === 'done' && i.h >= 0 ? ' · ' + HL[i.h] : ''}"></i>`; }).join('')).join('');
  const notes = []; for (let d = TODAYN; d >= TODAYN - 29 && notes.length < 6; d--) for (const x of daySched(d)) if (x.r.id === r.id && visS(x.s)) { const i = info(x); if (i.s === 'done' && i.h === 2) notes.push(`<li><b>${sdate(d)}</b> ${SV[x.s].short} · ${x.w.name}: ${esc(i.flags.join(', ') || '상태 나쁨')}${i.note ? ` (${esc(i.note)})` : ''}</li>`); }
  const canCare = ROLE() === 'central' || ROLE() === 'admin';
  box.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-label="${r.name} 상세">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><span class="label">${r.code}</span><h2>${r.name} ${riskBadge(o.level)}</h2></div><button class="btn" data-act="close">닫기</button></div>
    <div class="facts"><div><span>나이</span>${r.age}세 · ${r.sex}</div><div><span>거주</span>${EMD[r.e]}</div><div><span>가구</span>${HOUSE[r.house]}</div><div><span>위험 점수</span>${o.score}점 (${LV[o.level] || '정상'})</div></div>
    ${o.reasons.length ? `<div><span class="label">위험 판단 근거</span><ul class="reasons">${o.reasons.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${canCare ? `<button class="btn ${care ? '' : 'pri'}" data-act="caretoggle" data-rid="${r.id}">${care ? '집중관리 해제' : '집중관리 대상 지정'}</button>` : ''}<button class="btn" data-act="toperson" data-rid="${r.id}">월간 달력 보기</button></div>
    <div><span class="label">이용 서비스</span><div class="svl" style="margin-top:6px">${ens.map(en => { const w = W[en.w], S = SV[en.s]; return `<div class="it"><i class="dot" style="--c:${S.c}"></i><span>${S.name} <small>${schedText(en)} · ${S.vendor}</small></span><span style="font-size:12px;color:var(--muted)">${w.name} ${S.role}</span></div>`; }).join('')}</div></div>
    <div><span class="label">${dlabel(dn)} 일정</span><div class="tline" style="margin-top:6px">${recs.length ? recs.map(x => { const i = info(x); return `<div class="ti"><span class="num" style="color:var(--muted)">${hm(x.t)}</span><span>${chipFor(x, i)} ${SV[x.s].name}${i.s === 'done' && i.start != null ? ` · ${hm(i.start)}~${hm(i.end)}${i.h >= 0 ? ` · 건강 ${HL[i.h]}` : ''}` : ''}${i.flags.length ? ` · <b style="color:var(--h2)">${esc(i.flags.join(', '))}</b>` : ''}${i.reason ? ` · ${esc(i.reason)}` : ''}${i.note ? `<br><small style="color:var(--muted)">메모: ${esc(i.note)}</small>` : ''}</span></div>`; }).join('') : '<p class="empty-note">이 날은 일정이 없습니다.</p>'}</div></div>
    <div><span class="label">최근 30일 건강상태</span><div class="hgrid" style="grid-template-columns:44px repeat(30,minmax(0,1fr));margin-top:6px">${rowsH}<span></span>${days.map((d, i) => `<span style="text-align:center">${i % 7 === 2 || d === TODAYN ? sdate(d) : ''}</span>`).join('')}</div>
      <div class="legend" style="margin-top:6px"><span><i class="dot" style="--c:var(--h0)"></i>좋음</span><span><i class="dot" style="--c:var(--h1)"></i>보통</span><span><i class="dot" style="--c:var(--h2)"></i>나쁨</span><span><i class="dot" style="--c:var(--st-miss)"></i>테두리: 미수행</span></div></div>
    <div><span class="label">담당자 이상 보고</span>${notes.length ? `<ul class="reasons" style="margin-top:6px">${notes.join('')}</ul>` : '<p class="empty-note">최근 30일 이상 보고가 없습니다.</p>'}</div>
  </aside>`;
}

/* ---------- 집중관리·발굴 ---------- */
function renderCare() {
  const rk = risk(), list = R.filter(r => rk.get(r.id).level >= 2 || STATE.care[r.id]).sort((a, b) => rk.get(b.id).score - rk.get(a.id).score);
  const cnt = [3, 2, 1].map(l => R.filter(r => rk.get(r.id).level === l).length), ro = ROLE() === 'viewer';
  view.innerHTML = `
  <section class="vhead"><h2>집중관리 대상</h2><span class="sub">최근 14일 현장 기록으로 자동 판정</span></section>
  <div class="kpis">
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-miss)"></i>위험</span><span class="v">${cnt[0]}</span><span class="d">총괄 담당자 즉시 알림</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-late)"></i>주의</span><span class="v">${cnt[1]}</span><span class="d">주간 점검</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-plan)"></i>관심</span><span class="v">${cnt[2]}</span><span class="d">추이 관찰</span></div>
    <div class="kpi"><span class="k">수동 지정</span><span class="v">${Object.values(STATE.care).filter(c => c.manual).length}</span><span class="d">담당자가 직접 지정</span></div>
  </div>
  <div class="clay">
    <div class="panel"><h3>집중관리 대상 <small>위험·주의 + 지정 ${list.length}명 · 이름을 누르면 상세</small></h3>
      <div class="tblwrap" style="max-height:72vh"><table class="ctbl"><thead><tr><th>등급</th><th>수혜자</th><th>판단 근거</th><th>처리</th></tr></thead><tbody>
      ${list.map(r => { const o = rk.get(r.id), c = STATE.care[r.id] || {}; return `<tr><td>${riskBadge(o.level) || '<em class="tag">지정</em>'}<div class="num" style="font-size:11px;color:var(--muted);margin-top:3px">${o.score}점</div></td>
        <td><a href="#care" data-act="open" data-rid="${r.id}" style="color:var(--ink);font-weight:600">${r.name}</a><div style="font-size:11.5px;color:var(--muted)">${r.age}세 · ${EMD[r.e]} · ${HOUSE[r.house]}</div></td>
        <td style="font-size:12.5px;min-width:200px">${o.reasons.slice(0, 3).join('<br>') || '수동 지정'}</td>
        <td style="min-width:150px"><select data-care="st" data-rid="${r.id}" aria-label="처리 상태">${['미확인', '전화 확인', '방문 조치', '서비스 연계', '종결'].map(s => `<option ${c.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select><input type="text" data-care="memo" data-rid="${r.id}" value="${esc(c.memo || '')}" placeholder="조치 메모" style="margin-top:4px;width:100%" aria-label="조치 메모"></td></tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="rail">
      <div class="panel"><h3>퇴원환자 지원 <small>${STATE.reports.filter(x => x.st !== '종결').length}건 처리 중 · 3일 안 퇴원 ${dcSoon()}명</small></h3><p class="empty-note" style="margin:0 0 8px">퇴원환자 지원 신청은 별도 화면에서 처리합니다.</p><button class="btn sm" data-act="tab" data-tab="discharge">퇴원지원 화면으로</button></div>
      <div class="panel"><h3>적용 중인 위험 판정 규칙</h3><ol class="rules"><li>건강상태 '나쁨' 1회당 2점</li><li>서로 다른 서비스 2곳 이상에서 이상 보고 시 4점</li><li>미수행 1점, 오늘 지연·미시작 2점, 독거이면서 이상 보고 1점</li><li>합계 10점 이상 위험, 6점 이상 주의, 3점 이상 관심</li></ol></div>
    </div></div>`;
}
/** 신청서: mode 'public' = 누구나 쓰는 신청 페이지, 'staff' = 담당자 대리 접수 */
function reportForm(id, mode) {
  const pub = mode === 'public', kind0 = pub ? '보호자' : '병원';
  return `<form class="form" id="${id}"><label>환자 이름<input id="rn" required placeholder="예: 홍○동"></label><label>나이<input id="ra" type="number" min="40" max="110" placeholder="80"></label>
    <label>사는 곳 (읍·면)<select id="re">${EMD.map(e => `<option>${e}</option>`).join('')}</select></label><label>연락받을 전화번호<input id="rp" inputmode="tel" placeholder="010-0000-0000" ${pub ? 'required' : ''}></label>
    <label>입원 병원<input id="rh" required placeholder="예: 진도○○병원"></label><label>퇴원일 (예정일)<input id="rd" type="date" required value="${dkey(TODAYN + 3)}"></label>
    <label>신청하는 분<select id="rk">${DC_KINDS.filter(k => pub ? k !== '수행기관' : true).map(k => `<option ${k === kind0 ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label>신청인 이름·관계<input id="rb" placeholder="${pub ? '예: 김○영 (딸)' : '예: ○○병원 의료사회복지사'}"></label>
    <div class="full"><span style="font-size:12px;color:var(--muted)">퇴원 후 필요한 서비스 (모르면 비워 두세요)</span><div class="checks">${SV.filter(S => !(pub && (S.id === 'smart' || S.id === 'medical'))).map(S => `<label><input type="checkbox" name="rneed" value="${S.name}">${S.name}</label>`).join('')}</div></div>
    <label class="full">퇴원 후 상황·도움이 필요한 이유<textarea id="rw" rows="3" required placeholder="예: 수술 후 거동이 어렵고 혼자 살아 식사 준비가 어려움"></textarea></label>
    ${pub ? '<label class="full consent"><span><input type="checkbox" id="rc" required> <b>(필수)</b> 신청 처리와 서비스 연계를 위해 이름·나이·연락처·건강 상황을 수집·이용하고, 서비스를 제공하는 수행기관에 제공하는 데 동의합니다.</span></label>' : ''}
    <div class="full"><button class="btn pri" type="submit">${pub ? '신청하기' : '대리 접수'}</button></div></form>`;
}
function dcCard(x, ro) {
  const soon = x.st !== '종결' && x.ddn != null && x.ddn - TODAYN <= 3, si = DC_STEPS.indexOf(x.st);
  return `<div class="rep${soon ? ' soon' : ''}"><div class="h"><b>${esc(x.name)} (${esc(x.age)}세) · ${esc(x.emd)}</b>${ro ? pill(x.st) : `<select data-rep="${esc(x.id)}" aria-label="처리 단계">${DC_STEPS.map(s => `<option ${x.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`}</div>
    <div class="dcrow"><span class="pill" style="--c:${soon ? 'var(--st-late)' : 'var(--st-plan)'}">${ddLabel(x.ddn)}</span><span>${esc(x.hosp || '')}</span><span class="num">${esc(x.no)}</span></div>
    <ol class="dcprog">${DC_STEPS.map((s, i) => `<li class="${i < si ? 'done' : i === si ? 'cur' : ''}">${s}</li>`).join('')}</ol>
    <div class="needs">${x.needs.map(n => `<em class="tag" style="margin:0">${esc(n)}</em>`).join('')}</div><span>${esc(x.why)}</span>
    ${ro ? (x.memo ? `<small>상담 메모: ${esc(x.memo)}</small>` : '') : `<input type="text" data-repmemo="${esc(x.id)}" value="${esc(x.memo || '')}" placeholder="상담 메모 (예: 11/11 보호자 통화, 방문의료·가사 연계 예정)" aria-label="상담 메모">`}
    <small style="color:var(--muted)">${esc(x.at)} · ${esc(x.via)} · ${esc(x.kind || '')} ${esc(x.by)}${x.phone ? ` · ${esc(x.phone)}` : ''}</small></div>`;
}

/* ---------- 퇴원지원 (총괄 담당자) ---------- */
function renderDischarge() {
  const ro = ROLE() === 'viewer', fl = VS.dcf || 'open', all = STATE.reports;
  const cnt = s => s === 'open' ? all.filter(x => x.st !== '종결').length : s === 'all' ? all.length : all.filter(x => x.st === s).length;
  const list = all.filter(x => fl === 'all' || (fl === 'open' ? x.st !== '종결' : x.st === fl)).sort((a, b) => (a.st === '종결') - (b.st === '종결') || (a.ddn ?? 1e9) - (b.ddn ?? 1e9));
  view.innerHTML = `
  <section class="vhead"><h2>통합돌봄 퇴원환자 지원</h2><span class="sub">본인·보호자·병원 신청과 담당자 대리 접수</span><button class="btn sm" data-act="go-apply" style="margin-left:auto">신청 페이지 보기</button></section>
  <div class="kpis">
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-miss)"></i>새 신청</span><span class="v">${cnt('접수')}</span><span class="d">아직 상담 전</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-late)"></i>3일 안 퇴원</span><span class="v">${dcSoon()}</span><span class="d">이미 퇴원한 미처리 포함</span></div>
    <div class="kpi"><span class="k">처리 중</span><span class="v">${cnt('open')}</span><span class="d">종결 전 전체</span></div>
    <div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-done)"></i>서비스 연계</span><span class="v">${cnt('서비스연계') + cnt('종결')}</span><span class="d">연계 중 + 종결</span></div>
    <div class="kpi"><span class="k">이번 달 접수</span><span class="v">${all.filter(x => x.at.slice(0, 7) === CUR_YM).length}</span><span class="d">전체 ${all.length}건</span></div>
  </div>
  <div class="seg" role="group" aria-label="단계 필터">${[['open', '처리 중'], ...DC_STEPS.map(s => [s, s]), ['all', '전체']].map(([k, l]) => `<button data-act="dcf" data-k="${k}" aria-pressed="${fl === k}">${l} ${cnt(k)}</button>`).join('')}</div>
  <div class="clay">
    <div class="panel"><h3>신청 목록 <small>퇴원일이 가까운 순 · 3일 안 퇴원은 주황 테두리</small></h3><div class="replist">${list.map(x => dcCard(x, ro)).join('') || '<p class="empty-note">이 단계의 신청이 없습니다.</p>'}</div></div>
    <div class="rail">
      ${ro ? '' : `<div class="panel"><h3>담당자 대리 접수</h3><p class="empty-note" style="margin:0 0 8px">전화나 방문으로 받은 신청을 대신 입력합니다.</p>${reportForm('repform', 'staff')}</div>`}
      <div class="panel"><h3>처리 단계</h3><ol class="rules"><li><b>접수</b> 신청 페이지·전화·방문으로 들어온 상태</li><li><b>상담·욕구조사</b> 신청인에게 연락해 퇴원 후 필요한 돌봄 확인</li><li><b>서비스연계</b> 수행기관에 이용 등록, 첫 방문 일정 잡기</li><li><b>종결</b> 서비스 시작 확인 또는 지원 불필요</li></ol></div>
    </div>
  </div>`;
}

/* ---------- 퇴원환자 지원 신청 페이지 (로그인 없이) ---------- */
function renderApply() {
  document.getElementById('tabs').innerHTML = ''; document.getElementById('tabs').hidden = true;
  document.getElementById('brandsub').textContent = '통합돌봄 퇴원환자 지원 신청';
  document.getElementById('who').hidden = true;
  document.getElementById('banner').innerHTML = '';
  const me = ME(), done = VS.applied;
  view.innerHTML = `<div class="apply">
    <div class="ahead"><span class="label">진도군 통합돌봄</span><h2>퇴원환자 지원 신청</h2>
      <p>병원에서 퇴원했거나 퇴원할 예정인 어르신이 집에서 지낼 수 있도록 방문의료, 가사, 식사(도시락), 목욕, 이동 등 돌봄 서비스를 연결해 드립니다. 본인, 보호자, 병원 담당자 누구나 신청할 수 있습니다.</p>
      <ol class="dcsteps"><li><b>1</b><span>신청</span></li><li><b>2</b><span>상담·욕구조사<small>담당자가 전화드림</small></span></li><li><b>3</b><span>서비스 연계</span></li><li><b>4</b><span>서비스 시작</span></li></ol></div>
    ${done ? `<div class="panel okcard" role="status"><h3>신청이 접수되었습니다</h3><p>접수번호 <b class="num">${esc(done)}</b></p><p>진행 상황을 확인할 때 필요하니 적어 두세요. 통합돌봄 담당자가 ${dlabel(TODAYN + 1)}까지 적어 주신 번호로 연락드립니다.</p><div class="ctl"><button class="btn" data-act="copy" data-v="${esc(done)}">접수번호 복사</button><button class="btn pri" data-act="apply-new">다른 신청 하기</button></div></div>`
      : `<div class="panel"><h3>신청서 작성</h3>${reportForm('pubform', 'public')}</div>`}
    <div class="panel"><h3>신청 진행 상황 확인</h3><form class="form" id="lookform"><label>접수번호<input id="lk-no" placeholder="DC-20261110-001" required value="${esc(done || '')}"></label><label>환자 이름<input id="lk-name" placeholder="예: 홍○동" required></label><div class="full"><button class="btn" type="submit">확인</button></div></form><div id="lk-out"></div></div>
    <p class="empty-note">문의: 진도군 통합돌봄 창구 (시제품이라 실제 전화번호는 넣지 않았습니다)</p>
    <div class="ctl"><button class="btn" data-act="go-login">${me ? '대시보드로 돌아가기' : '직원 로그인 화면으로'}</button></div>
  </div>`;
}

/* ---------- 월간 계획 (수행기관) ---------- */
const workerOpts = (s, sel) => W.filter(w => w.s === s && w.active).map(w => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${w.name} · ${EMD[w.e]}</option>`).join('');
function renderPlan() {
  const s = ORG(), ym = VS.pym, p = planOf(s, ym), stt = p.st, editable = planEditable(s, ym), chk = planCheck(s, ym), days = monthDNs(ym);
  const dl = deadlineOf(ym), dleft = dl - TODAYN, due = `제출 마감 ${sdate(dl)}${dleft >= 0 ? ` (D-${dleft})` : ' (지남)'}`;
  const msg = { '작성중': chk.total ? `초안이 준비되었습니다. 공휴일·휴가 등 바뀐 부분만 고치고, 점검 결과를 확인한 뒤 제출하세요. ${due}.` : '아직 일정이 없습니다. [초안 만들기]를 누르면 어르신별 이용 규칙대로 한 달 일정이 만들어집니다.',
    '반려': `반려되었습니다. 사유: ${p.note || '-'} 고친 뒤 다시 제출하세요. ${due}.`, '제출': `${p.at || ''}에 제출했습니다. 총괄 담당자의 승인을 기다리는 중이며, 그동안은 일정을 고칠 수 없습니다.`, '승인': '승인되어 일정이 확정되었습니다. 바꿀 일정이 있으면 표에서 날짜 칸을 눌러 [변경 요청]을 올리세요.' }[stt];
  const step = !chk.total ? 1 : stt === '제출' ? 4 : stt === '승인' ? 6 : 2;
  const steps = ['초안 만들기', '고치기', '점검 확인', '제출', '승인'];
  const ck = (ok, label, detail) => `<div class="chk ${ok ? 'ok' : 'warn'}"><b>${ok ? '이상 없음' : '확인 필요'}</b><span>${label}</span>${detail || ''}</div>`;
  const grid = new Map(); days.forEach(dn => daySched(dn).forEach(x => { if (x.s === s) { const k = x.w.id + '_' + dn; grid.set(k, (grid.get(k) || 0) + 1); } }));
  const ws = W.filter(w => w.s === s && (w.active || days.some(dn => grid.get(w.id + '_' + dn))));
  const visR = R.filter(r => r.svc[s]);
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="pprev" aria-label="이전 달">◀</button><h2>${ymLabel(ym)} 계획</h2><button class="btn" data-act="pnext" aria-label="다음 달">▶</button></div>${pill(stt)}<span class="sub">${SV[s].vendor} · 일정 ${fmt(chk.total)}건</span></section>
  <div class="panel planbox"><ol class="stepper">${steps.map((t, i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''}"><span>${i + 1}</span>${t}</li>`).join('')}</ol>
    <p class="planmsg ${stt === '반려' ? 'bad' : ''}">${esc(msg)}</p>
    <div class="ctl">${editable ? `<button class="btn" data-act="plan-draft">${chk.total ? '빠진 일정 규칙대로 채우기' : '초안 만들기'}</button><button class="btn pri" data-act="plan-submit" ${chk.total ? '' : 'disabled'}>점검 확인하고 제출하기</button>` : ''}</div></div>
  <div class="grid2">
    <div class="panel"><h3>제출 전 자동 점검</h3>
      ${ck(!chk.shortfall.length, `계약 횟수 미달 ${chk.shortfall.length}명`, chk.shortfall.length ? `<ul>${chk.shortfall.slice(0, 12).map(x => `<li>${x.name}: ${x.expected}회 중 ${x.planned}회 계획</li>`).join('')}${chk.shortfall.length > 12 ? `<li>외 ${chk.shortfall.length - 12}명</li>` : ''}</ul>` : '')}
      ${ck(!chk.overlaps.length, `같은 담당자 시간 겹침 ${chk.overlaps.length}건`, chk.overlaps.length ? `<ul>${chk.overlaps.slice(0, 10).map(x => `<li>${sdate(x.dn)} ${x.worker}: ${x.a} / ${x.b}</li>`).join('')}</ul>` : '')}
      ${ck(!chk.sundays, `일요일 일정 ${chk.sundays}건`, '')}</div>
    <div class="panel"><h3>한꺼번에 고치기 ${editable ? '' : '<small>제출·승인된 달은 쓸 수 없습니다</small>'}</h3>
      <fieldset class="tools" ${editable ? '' : 'disabled'}>
        <div class="tool"><b>날짜 일괄 이동</b><small>공휴일 등 하루 일정을 다른 날로 옮깁니다</small><div class="ctl"><input type="date" id="bm-from" min="${dkey(days[0])}" max="${dkey(days.at(-1))}" aria-label="옮길 날"> → <input type="date" id="bm-to" aria-label="옮겨 갈 날"><button class="btn sm" data-act="bulk-move">옮기기</button></div></div>
        <div class="tool"><b>담당자 일괄 이관</b><small>휴가·퇴사한 담당자의 일정을 다른 담당자에게 넘깁니다</small><div class="ctl"><select id="bt-from" aria-label="보내는 담당자">${workerOpts(s)}</select> → <select id="bt-to" aria-label="받는 담당자">${workerOpts(s)}</select></div>
          <div class="ctl"><input type="date" id="bt-d1" value="${dkey(Math.max(days[0], TODAYN + 1))}" aria-label="시작일"> ~ <input type="date" id="bt-d2" value="${dkey(days.at(-1))}" aria-label="종료일"><label><input type="checkbox" id="bt-perm"> 앞으로도 계속 담당</label><button class="btn sm" data-act="bulk-transfer">넘기기</button></div></div>
        <div class="tool"><b>일정 추가</b><small>이동 지원 요청 등 규칙에 없는 방문을 넣습니다</small><div class="ctl"><input type="search" id="sa-r" list="sa-list" placeholder="어르신 이름 또는 번호" style="width:180px" aria-label="어르신"><datalist id="sa-list">${visR.map(r => `<option value="${r.name} (${r.code})">${EMD[r.e]}</option>`).join('')}</datalist><input type="date" id="sa-d" min="${dkey(days[0])}" max="${dkey(days.at(-1))}" aria-label="날짜"><input type="time" id="sa-t" value="10:00" step="300" aria-label="시각"><button class="btn sm" data-act="sched-add">추가</button></div></div>
      </fieldset></div>
  </div>
  <div class="mlay">
    <div class="panel" style="padding:10px"><h3>담당자 × 날짜 <small>숫자는 방문 건수 · 칸을 누르면 오른쪽에서 일정을 고칩니다</small></h3>
      <div class="tblwrap"><table class="wgrid"><thead><tr><th style="text-align:left;position:sticky;left:0;background:var(--surface)">담당자</th>${days.map(dn => { const d = fromDN(dn); return `<th style="${d.getDay() === 0 ? 'color:var(--st-miss)' : d.getDay() === 6 ? 'color:var(--st-prog)' : ''}">${d.getDate()}<br><small>${WD[d.getDay()]}</small></th>`; }).join('')}<th class="r">합계</th></tr></thead><tbody>
      ${ws.map(w => { let t = 0; return `<tr><td class="wn">${w.name}${w.active ? '' : ' <em class="tag">정지</em>'} <small style="color:var(--muted)">${EMD[w.e]}</small></td>${days.map(dn => { const n = grid.get(w.id + '_' + dn) || 0, sel = VS.pcell && VS.pcell.wid === w.id && VS.pcell.dn === dn; t += n; return `<td><span class="wc ${n ? (dn <= TODAYN ? 'ok' : 'pl') : ''} ${sel ? 'sel' : ''}" data-act="pcell" data-w="${w.id}" data-dn="${dn}" ${n ? '' : 'style="color:transparent"'}>${n}</span></td>`; }).join('')}<td class="r num">${t}</td></tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="rail"><div class="panel" id="pday"><h3>일정 고치기</h3><p class="empty-note">왼쪽 표에서 담당자와 날짜 칸을 누르세요.</p></div></div>
  </div>`;
  if (VS.pcell) drawPlanDay();
}
function drawPlanDay() {
  const el = document.getElementById('pday'); if (!el || !VS.pcell) return;
  const { wid, dn } = VS.pcell, w = W[wid];
  const recs = daySched(dn).filter(x => x.w.id === wid).sort((a, b) => a.t - b.t);
  el.innerHTML = `<h3>${sdate(dn)}(${WD[fromDN(dn).getDay()]}) ${w.name} <small>${recs.length}건</small></h3>` + (recs.map(x => {
    const lock = lockReason(x), i = info(x), canReq = x.dn >= TODAYN && !STATE.visits[x.k] && !STATE.crs.some(c => c.k === x.k && c.st === '대기');
    return `<div class="pd"><div><b>${x.r.name}</b> <small style="color:var(--muted)">${EMD[x.r.e]}</small> ${i.s !== 'plan' ? `<span class="chip st-${i.s}"><i class="dot"></i>${STL[i.s]}</span>` : ''}${x.add ? ' <em class="tag">추가</em>' : x.moved ? ' <em class="tag">변경됨</em>' : ''}</div>
      ${lock ? `<div class="ctl"><span class="num">${hm(x.t)}</span>${canReq ? `<button class="btn sm" data-act="reqchange" data-k="${x.k}" data-dn="${x.dn}">변경 요청</button>` : STATE.crs.some(c => c.k === x.k && c.st === '대기') ? '<span class="empty-note">변경 요청 대기 중</span>' : ''}</div><small class="empty-note">${esc(lock)}</small>`
      : `<div class="ctl"><input type="date" value="${dkey(x.dn)}" data-f="date" aria-label="날짜"><input type="time" value="${hm(x.t)}" data-f="time" step="300" aria-label="시각"><select data-f="wid" aria-label="담당자">${workerOpts(x.s, x.w.id)}</select></div><div class="ctl"><button class="btn sm pri" data-act="sched-save" data-k="${x.k}" data-dn="${x.dn}">저장</button><button class="btn sm" data-act="sched-del" data-k="${x.k}" data-dn="${x.dn}">이 날 방문 빼기</button></div>`}</div>`;
  }).join('') || '<p class="empty-note">이 날은 일정이 없습니다. 위의 [일정 추가]로 넣을 수 있습니다.</p>');
}

/* ---------- 계획 승인 (총괄) ---------- */
function renderApprove() {
  const ym = VS.aym, list = SV.map(S => ({ S, p: planOf(S.i, ym), c: planCheck(S.i, ym) }));
  const cnt = s => list.filter(x => x.p.st === s).length;
  const crs = [...STATE.crs].sort((a, b) => (a.st === '대기' ? 0 : 1) - (b.st === '대기' ? 0 : 1) || b.id - a.id);
  view.innerHTML = `
  <section class="vhead"><div class="nav"><button class="btn" data-act="aprev" aria-label="이전 달">◀</button><h2>${ymLabel(ym)} 계획 승인</h2><button class="btn" data-act="anext" aria-label="다음 달">▶</button></div><span class="sub">제출 마감 ${sdate(deadlineOf(ym))}</span></section>
  <div class="kpis">${['제출', '작성중', '반려', '승인'].map(s => `<div class="kpi"><span class="k"><i class="dot" style="--c:${PLC[s]}"></i>${s === '제출' ? '승인 대기' : s}</span><span class="v">${cnt(s)}</span><span class="d">7개 기관 중</span></div>`).join('')}<div class="kpi"><span class="k"><i class="dot" style="--c:var(--st-late)"></i>변경 요청 대기</span><span class="v">${STATE.crs.filter(c => c.st === '대기').length}</span><span class="d">아래 목록</span></div></div>
  <div class="panel"><h3>기관별 계획</h3><div class="tblwrap"><table class="ctbl"><thead><tr><th>서비스 · 수행기관</th><th>상태</th><th>제출</th><th class="r">일정</th><th>자동 점검</th><th>처리</th></tr></thead><tbody>
    ${list.map(({ S, p, c }) => `<tr><td><i class="dot" style="--c:${S.c}"></i> <b>${S.short}</b><div style="font-size:12px;color:var(--muted)">${S.vendor}</div></td><td>${pill(p.st)}${p.st === '반려' && p.note ? `<div style="font-size:12px;color:var(--muted);max-width:220px">${esc(p.note)}</div>` : ''}</td>
      <td style="font-size:12.5px">${p.at ? `${esc(p.at.slice(5))}<div style="color:var(--muted)">${esc((findUser(p.by) || {}).name || '')}</div>` : '-'}</td><td class="r num">${fmt(c.total)}</td>
      <td style="font-size:12.5px;min-width:200px">${c.shortfall.length ? `<span class="warnx">횟수 미달 ${c.shortfall.length}명</span>` : '<span class="okx">횟수 이상 없음</span>'} · ${c.overlaps.length ? `<span class="warnx">겹침 ${c.overlaps.length}</span>` : '겹침 없음'}${c.sundays ? ` · 일요일 ${c.sundays}` : ''}${c.shortfall.length || c.overlaps.length ? `<details><summary>자세히</summary><ul>${c.shortfall.slice(0, 8).map(x => `<li>${x.name} ${x.expected}회 중 ${x.planned}회</li>`).join('')}${c.overlaps.slice(0, 5).map(x => `<li>${sdate(x.dn)} ${x.worker} 겹침</li>`).join('')}</ul></details>` : ''}</td>
      <td><div class="ctl"><button class="btn sm" data-act="plancal" data-s="${S.i}">달력 보기</button>${p.st === '제출' ? `<button class="btn sm pri" data-act="approve" data-s="${S.i}">승인</button><button class="btn sm" data-act="reject" data-s="${S.i}">반려</button>` : ''}</div></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="panel"><h3>일정 변경 요청 <small>확정된 일정을 바꾸려는 요청 · 승인하면 바로 일정에 반영됩니다</small></h3><div class="tblwrap"><table class="ctbl"><thead><tr><th>요청</th><th>어르신 · 서비스</th><th>현재 → 변경</th><th>이유</th><th>처리</th></tr></thead><tbody>
    ${crs.map(c => `<tr><td style="font-size:12.5px">${esc(c.at.slice(5))}<div style="color:var(--muted)">${esc((findUser(c.by) || {}).name || c.by)}</div></td><td><b>${R[c.rid].name}</b><div style="font-size:12px;color:var(--muted)">${SV[c.s].short}</div></td>
      <td class="num" style="font-size:12.5px">${sdate(c.odn)} ${hm(c.ot)} → <b>${sdate(c.nd)} ${hm(c.nt)}</b></td><td style="font-size:12.5px;max-width:260px">${esc(c.reason)}</td>
      <td>${c.st === '대기' ? `<div class="ctl"><button class="btn sm pri" data-act="cr-ok" data-id="${c.id}">승인</button><button class="btn sm" data-act="cr-no" data-id="${c.id}">반려</button></div>` : `${pill(c.st)}${c.note ? `<div style="font-size:12px;color:var(--muted)">${esc(c.note)}</div>` : ''}`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-note">변경 요청이 없습니다.</td></tr>'}
  </tbody></table></div></div>`;
}

/* ---------- 계정 관리 ---------- */
function scopedUsers() { const me = ME(); return allUsers().filter(u => me.role === 'admin' || (me.role === 'central' && ['org', 'viewer'].includes(u.role)) || (me.role === 'org' && u.role === 'worker' && u.sid === me.sid)); }
function renderAccounts() {
  const me = ME(), creatable = { admin: ['org', 'central', 'viewer', 'admin'], central: ['org', 'viewer'], org: ['worker'] }[me.role] || [];
  const q = VS.uq.toLowerCase(), rows = scopedUsers().filter(u => !q || u.login.includes(q) || u.name.toLowerCase().includes(q));
  view.innerHTML = `
  <section class="vhead"><h2>${me.role === 'org' ? '수행자 계정' : '계정 관리'}</h2><span class="sub">${rows.length}개 계정</span></section>
  <div class="clay">
    <div class="panel"><h3>계정 목록</h3><div class="ctl" style="margin-bottom:8px"><input type="search" id="uq" placeholder="아이디·이름 검색" value="${esc(VS.uq)}" aria-label="검색"></div>
      <div class="tblwrap" style="max-height:70vh"><table class="ctbl"><thead><tr><th>이름 · 아이디</th><th>역할 · 소속</th><th>마지막 로그인</th><th>관리</th></tr></thead><tbody>
      ${rows.slice(0, 300).map(u => `<tr${u.active ? '' : ' style="opacity:.55"'}><td><b>${esc(u.name)}</b><div class="num" style="font-size:12px;color:var(--muted)">${esc(u.login)}</div></td>
        <td style="font-size:12.5px">${ROLE_LABEL[u.role]}<div style="color:var(--muted)">${u.sid != null ? SV[u.sid].short : ''}${u.wid != null ? ` · ${EMD[W[u.wid].e]} · 담당 ${W[u.wid].rs.length}명` : ''}</div></td>
        <td class="num" style="font-size:12.5px">${u.last ? esc(u.last) : '없음'}${(FAILS[u.login] || 0) >= 5 ? '<div style="color:var(--st-miss)">잠김</div>' : ''}</td>
        <td>${u.login === me.login ? '<span class="empty-note">내 계정</span>' : `<div class="ctl"><button class="btn sm" data-act="user-reset" data-l="${esc(u.login)}">비밀번호 초기화</button><button class="btn sm" data-act="user-toggle" data-l="${esc(u.login)}">${u.active ? '사용 정지' : '다시 사용'}</button></div>`}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-note">계정이 없습니다.</td></tr>'}
      </tbody></table></div></div>
    <div class="panel"><h3>새 계정 만들기</h3>
      <form class="form" id="uform"><label>역할<select id="u-role">${creatable.map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select></label>
        <label>아이디 <small>영문·숫자</small><input id="u-login" required placeholder="${me.role === 'org' ? 'w211' : 'org8'}"></label><label>이름<input id="u-name" required></label><label>휴대폰<input id="u-phone" inputmode="tel" placeholder="010-0000-0000"></label>
        ${me.role === 'org' ? `<label>담당 읍·면<select id="u-emd">${EMD.map(e => `<option>${e}</option>`).join('')}</select></label>` : `<label>기관 <small>수행기관 관리자일 때</small><select id="u-org">${SV.map(S => `<option value="${S.i}">${S.vendor}</option>`).join('')}</select></label>`}
        <div class="full"><button class="btn pri" type="submit">계정 만들기</button></div></form>
      <p class="empty-note">처음 비밀번호는 자동으로 만들어지고 한 번만 보입니다. 당사자는 첫 로그인 때 비밀번호를 바꿔야 합니다.${me.role === 'org' ? ' 새 수행자에게 어르신을 배정하려면 월간 계획의 "담당자 일괄 이관"을 쓰세요.' : ''}</p></div>
  </div>`;
}

/* ---------- 접속기록 ---------- */
const ACTION_LABEL = { login: '로그인', login_fail: '로그인 실패', logout: '로그아웃', view_recipient: '어르신 정보 조회', visit_start: '방문 시작', visit_end: '방문 종료', visit_cancel: '방문 취소', emergency: '긴급 신고', emergency_handle: '긴급 조치', change_request: '변경 요청', change_decide: '변경 요청 처리', plan_draft: '초안 생성', plan_submit: '계획 제출', plan_decide: '계획 승인·반려', schedule_update: '일정 수정', schedule_delete: '일정 빼기', schedule_add: '일정 추가', bulk_move: '일괄 이동', bulk_transfer: '일괄 이관', care_update: '집중관리 처리', report: '퇴원지원 신청', report_status: '퇴원지원 처리', user_create: '계정 생성', user_reset: '비밀번호 초기화', user_activate: '계정 사용', user_deactivate: '계정 정지', password_change: '비밀번호 변경' };
function renderAudit() {
  const acts = [...new Set(STATE.audit.map(l => l.action))];
  const rows = STATE.audit.filter(l => (!VS.aq || l.login.includes(VS.aq) || l.target.includes(VS.aq)) && (!VS.aa || l.action === VS.aa));
  view.innerHTML = `<section class="vhead"><h2>접속기록</h2><span class="sub">최근 ${rows.length}건 · 이 시제품에서 한 일이 모두 남습니다</span></section>
  <div class="panel"><div class="ctl" style="margin-bottom:10px"><input type="search" id="aq" placeholder="아이디·대상 검색" value="${esc(VS.aq)}" aria-label="검색"><select id="aa" aria-label="종류"><option value="">모든 종류</option>${acts.map(x => `<option value="${x}" ${VS.aa === x ? 'selected' : ''}>${ACTION_LABEL[x] || x}</option>`).join('')}</select><button class="btn sm" data-act="audit-search">찾기</button></div>
  <div class="tblwrap" style="max-height:72vh"><table><thead><tr><th>일시</th><th>아이디</th><th>종류</th><th>대상</th><th>내용</th></tr></thead><tbody>
  ${rows.map(l => `<tr><td class="num">${esc(l.at)}</td><td>${esc(l.login)}</td><td>${ACTION_LABEL[l.action] || esc(l.action)}</td><td>${esc(l.target)}</td><td style="white-space:normal;max-width:360px">${esc(l.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-note">아직 기록이 없습니다. 다른 역할로 로그인해 여러 기능을 써 본 뒤 다시 확인하세요.</td></tr>'}
  </tbody></table></div></div>`;
}

/* ---------- 현장 앱 (현장 수행자) ---------- */
const EMG = ['쓰러짐·의식 저하', '응답 없음·부재', '부상·출혈', '심한 통증·호흡 곤란', '기타'];
function renderField() {
  const me = ME(), w = W[me.wid], S = SV[w.s];
  const recs = daySched(TODAYN).filter(x => x.w.id === w.id), inf = new Map(recs.map(x => [x, info(x)]));
  const c = s => recs.filter(x => inf.get(x).s === s).length;
  const order = { prog: 0, late: 1, plan: 2, done: 3, cancel: 4, miss: 5 };
  const sorted = [...recs].sort((a, b) => order[inf.get(a).s] - order[inf.get(b).s] || a.t - b.t);
  view.innerHTML = `<div class="fwrap">
    <div class="fhead"><b>${esc(me.name)}님의 오늘 방문</b><span>${dlabel(TODAYN)} · ${S.name} ${S.role} · ${hm(SIM.now)} 기준</span></div>
    <div class="sum"><div><b>${recs.length}</b><span>오늘 일정</span></div><div><b>${c('done')}</b><span>완료</span></div><div><b>${c('prog')}</b><span>진행중</span></div><div><b>${c('plan') + c('late')}</b><span>남음</span></div></div>
    ${sorted.map(x => { const i = inf.get(x), r = x.r, pend = STATE.crs.some(cr => cr.k === x.k && cr.st === '대기');
      let acts = '';
      if (i.s === 'plan' || i.s === 'late') acts = `<div class="acts"><button class="go" data-act="f-start" data-k="${x.k}">방문 시작</button><button data-act="f-cancel" data-k="${x.k}">취소</button></div>`;
      else if (i.s === 'prog') acts = `<div class="acts"><button class="end" data-act="f-end" data-k="${x.k}">종료 · 상태 입력</button></div>`;
      else if (i.s === 'done') acts = `<div class="meta">${hm(i.start)}~${hm(i.end)} · 건강 <b style="color:var(--h${Math.max(0, i.h)})">${HL[i.h] ?? '-'}</b>${i.flags.length ? ` · ${esc(i.flags.join(', '))}` : ''}${i.note ? `<br>메모: ${esc(i.note)}` : ''}</div>`;
      else if (i.s === 'cancel') acts = `<div class="meta">취소 사유: ${esc(i.reason)}</div>`;
      const sub = `<div class="acts2">${i.s === 'plan' || i.s === 'late' ? (pend ? '<span class="meta">변경 요청 처리 대기 중</span>' : `<button data-act="f-req" data-k="${x.k}">일정 변경 요청</button>`) : ''}<button class="emgb" data-act="f-emg" data-k="${x.k}">긴급</button></div>`;
      return `<div class="card ${i.s === 'done' || i.s === 'cancel' ? 'done' : ''}"><div class="top1"><span class="tm">${hm(x.t)}</span><span class="chip st-${i.s}"><i class="dot"></i>${STL[i.s]}</span></div>
        <div><span class="nm">${r.name}</span> <span class="meta">${r.age}세 · ${r.sex} · ${EMD[r.e]} · ${HOUSE[r.house]}</span></div>${acts}${sub}</div>`; }).join('') || '<p class="empty-note">오늘은 방문 일정이 없습니다.</p>'}
    <p class="empty-note" style="text-align:center">생명이 위급하면 먼저 <b>119</b>에 신고한 뒤 [긴급]을 눌러 알려 주세요.</p>
    ${fieldCalendar(w)}
  </div>`;
}

/** 현장 앱 하단: 내 월별 방문 일정 달력 + 고른 날의 방문 목록 */
const FM_MIN = `${YEAR}-01`, FM_MAX = addMonths(NEXT_YM, 0);
function fieldCalendar(w) {
  if (!VS.fm) VS.fm = CUR_YM;
  const ym = VS.fm, days = monthDNs(ym), first = fromDN(days[0]).getDay(), plan = planOf(w.s, ym).st;
  const byDay = new Map(days.map(dn => [dn, daySched(dn).filter(x => x.w.id === w.id)]));
  const tot = [...byDay.values()].reduce((s, a) => s + a.length, 0);
  let cells = WD.map((d, i) => `<span class="fwd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('');
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (const dn of days) {
    const recs = byDay.get(dn), n = recs.length, d = fromDN(dn), dow = d.getDay();
    const ss = recs.map(st), miss = ss.filter(s => s === 'miss' || s === 'late').length, done = ss.filter(s => s === 'done').length, chg = recs.some(x => x.moved || x.add);
    const cls = ['fday', dn === TODAYN ? 'today' : '', dn === VS.fday ? 'sel' : '', dn < TODAYN ? 'past' : '', n ? '' : 'none'].join(' ');
    const mark = !n ? '' : dn < TODAYN ? (miss ? `<i class="fm bad">${miss}</i>` : `<i class="fm ok">✓</i>`) : dn === TODAYN ? `<i class="fm now">${done}/${n}</i>` : `<i class="fm plan">${n}</i>`;
    cells += `<button class="${cls}" data-act="fday" data-dn="${dn}" aria-label="${d.getMonth() + 1}월 ${d.getDate()}일 방문 ${n}건"><span class="dn ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}">${d.getDate()}</span>${mark}${chg ? '<i class="fchg" title="변경된 일정 있음"></i>' : ''}</button>`;
  }
  const sel = VS.fday != null && ymOf(VS.fday) === ym ? VS.fday : null;
  let list = '';
  if (sel != null) {
    const recs = byDay.get(sel).sort((a, b) => a.t - b.t);
    list = `<div class="fdlist"><h4>${dlabel(sel)} · ${recs.length}건</h4>${recs.map(x => { const i = info(x), pend = STATE.crs.some(c => c.k === x.k && c.st === '대기'), en = x.r.svc[x.s];
      return `<div class="fdrow"><span class="tm num">${hm(x.t)}</span><span class="who"><b>${x.r.name}</b> <small>${EMD[x.r.e]} · ${en ? schedText(en) : ''}</small>${x.moved || x.add ? ' <em class="tag">변경</em>' : ''}</span><span class="chip st-${i.s}"><i class="dot"></i>${STL[i.s]}</span>
        ${sel >= TODAYN && (i.s === 'plan' || i.s === 'late') ? (pend ? '<small class="meta">변경 요청 대기 중</small>' : `<button class="btn sm" data-act="f-req2" data-k="${x.k}" data-dn="${x.dn}">변경 요청</button>`) : ''}</div>`; }).join('') || '<p class="empty-note">이 날은 방문 일정이 없습니다.</p>'}</div>`;
  }
  return `<section class="panel fcal" aria-label="월별 방문 일정">
    <div class="fcal-h"><button class="btn sm" data-act="fm-prev" aria-label="이전 달" ${ym <= FM_MIN ? 'disabled' : ''}>◀</button><h3>${ymLabel(ym)} 내 방문 일정</h3><button class="btn sm" data-act="fm-next" aria-label="다음 달" ${ym >= FM_MAX ? 'disabled' : ''}>▶</button></div>
    <div class="fcal-s"><span>총 <b>${tot}</b>건</span>${pill(plan === '승인' ? '확정' : plan === '제출' ? '승인 대기' : '계획 작성 중')}${plan === '승인' ? '' : '<small class="meta">확정 전이라 바뀔 수 있습니다</small>'}</div>
    <div class="fgrid">${cells}</div>
    <div class="legend"><span><i class="fm ok">✓</i>모두 완료</span><span><i class="fm bad">1</i>미수행·지연</span><span><i class="fm now">2/4</i>오늘 완료/전체</span><span><i class="fm plan">3</i>예정 건수</span><span><i class="fchg" style="position:static"></i>변경된 일정</span></div>
    ${list || '<p class="empty-note" style="margin:0">날짜를 누르면 그날 방문할 어르신이 보입니다.</p>'}
  </section>`;
}
const sheet = () => document.getElementById('sheetbox');
const openSheet = html => { sheet().innerHTML = `<div class="scrim" data-act="s-close"></div>${html}`; };
const closeSheet = () => { sheet().innerHTML = ''; };
const fRec = k => daySched(TODAYN).find(x => x.k === k);

/* ---------- 비밀번호·모달 ---------- */
function pwModal(forced) {
  modal(`<h2>${forced ? '처음 로그인했습니다. 비밀번호를 바꿔 주세요' : '비밀번호 변경'}</h2><form class="form" id="pwform"><label class="full">지금 비밀번호<input id="pw0" type="password" required></label><label class="full">새 비밀번호 <small>영문과 숫자를 섞어 8자 이상</small><input id="pw1" type="password" required></label><label class="full">새 비밀번호 확인<input id="pw2" type="password" required></label><div class="full mact">${forced ? '' : '<button type="button" class="btn" data-act="mclose">닫기</button>'}<button class="btn pri" type="submit">바꾸기</button></div></form>`, forced);
}
function showTempPw(title, login, pw) {
  modal(`<h2>${esc(title)}</h2><p>아래 처음 비밀번호를 당사자에게 전달하세요. <b>이 창을 닫으면 다시 볼 수 없습니다.</b></p><div class="tempw"><span>아이디 <b>${esc(login)}</b></span><span>처음 비밀번호 <b class="num" id="tpw">${esc(pw)}</b></span><button class="btn sm" data-act="copy" data-v="${esc(pw)}">복사</button></div><div class="mact"><button class="btn pri" data-act="mclose">확인했어요</button></div>`);
}
function reqModal(k, dn) {
  const x = findSched(k, dn); if (!x) return;
  modal(`<h2>일정 변경 요청 · ${x.r.name}</h2><p>확정된 일정은 총괄 담당자가 승인해야 바뀝니다.</p><form class="form" id="reqform" data-k="${k}" data-dn="${dn}"><label>바꿀 날짜<input type="date" id="rq-d" value="${dkey(Math.max(x.dn, TODAYN))}" min="${dkey(TODAYN)}" required></label><label>바꿀 시각<input type="time" id="rq-t" value="${hm(x.t)}" step="300" required></label><label class="full">이유<textarea id="rq-w" rows="3" required placeholder="예: 어르신 병원 진료와 겹침"></textarea></label><div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">요청 올리기</button></div></form>`);
}
function reasonModal(title, kind, id) {
  modal(`<h2>${esc(title)}</h2><form class="form" id="reasonform" data-kind="${kind}" data-id="${id}"><label class="full">사유 <small>요청한 쪽에 그대로 전달됩니다</small><textarea id="rs-w" rows="3" required></textarea></label><div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">반려하기</button></div></form>`);
}

/* ---------- 클릭 ---------- */
document.addEventListener('click', e => {
  const hb = e.target.closest('[data-h]');
  if (hb) { document.querySelectorAll('[data-h]').forEach(b => b.setAttribute('aria-pressed', b === hb)); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (b.tagName === 'A') e.preventDefault();
  const me = ME();
  switch (a) {
    case 'demo': doLogin(b.dataset.l, DEMO_PW); break;
    case 'go-apply': VS.applied = null; try { history.replaceState(null, '', '#apply'); } catch (er) { } VS.drawer = null; renderDrawer(); render(); window.scrollTo(0, 0); break;
    case 'go-login': try { history.replaceState(null, '', ME() ? '#' + VS.tab : location.pathname + location.search); } catch (er) { } drawChrome(); render(); window.scrollTo(0, 0); break;
    case 'apply-new': VS.applied = null; render(); window.scrollTo(0, 0); break;
    case 'dcf': VS.dcf = b.dataset.k; render(); break;
    case 'dc-open': {
      const x = STATE.reports.find(z => z.id === b.dataset.id); if (!x) break;
      const ro = ROLE() === 'viewer', si = DC_STEPS.indexOf(x.st);
      modal(`<h2>퇴원환자 지원 신청 · ${esc(x.name)}</h2>
        <div class="dcinfo"><span><b>접수번호</b> ${esc(x.no)}</span><span><b>퇴원</b> ${ddLabel(x.ddn)} · ${esc(x.hosp || '')}</span>
          <span><b>환자</b> ${esc(x.name)} (${esc(x.age)}세) · ${esc(x.emd)}</span><span><b>연락처</b> ${esc(x.phone || '없음')}</span>
          <span><b>신청</b> ${esc(x.at)} · ${esc(x.via)} · ${esc(x.kind || '')} ${esc(x.by)}</span><span><b>필요 서비스</b> ${esc(x.needs.join(', '))}</span></div>
        <p class="dcwhy">${esc(x.why)}</p>
        <ol class="dcprog">${DC_STEPS.map((s, i) => `<li class="${i < si ? 'done' : i === si ? 'cur' : ''}">${s}</li>`).join('')}</ol>
        ${ro ? `<div class="mact"><button class="btn" data-act="mclose">닫기</button></div>` : `<form class="form" id="dcform" data-id="${esc(x.id)}">
          <div class="full checks">${DC_STEPS.slice(1).map((s, i) => `<label><input type="radio" name="dcst" value="${s}" ${(x.st === '접수' ? i === 0 : s === x.st) ? 'checked' : ''}> ${s}</label>`).join('')}</div>
          <label class="full">처리 내용<textarea id="dc-memo" rows="3" required placeholder="예: 보호자와 통화, 11/13 퇴원 당일 가사·식사 연계 예정">${esc(x.memo || '')}</textarea></label>
          <div class="full mact"><button type="button" class="btn" data-act="mclose">나중에</button><button type="button" class="btn" data-act="dc-tab">퇴원지원 화면에서 보기</button><button class="btn pri" type="submit">저장</button></div></form>`}`);
      break;
    }
    case 'dc-tab': mclose(); VS.dcf = 'open'; setTab('discharge'); break;
    case 'logout': audit('logout', STATE.session); STATE.session = null; save(); VS.drawer = null; renderDrawer(); closeSheet(); mclose(); drawChrome(); render(); break;
    case 'reset': modal('<h2>체험 데이터를 처음 상태로 되돌릴까요?</h2><p>이 브라우저에 저장된 기록·계획 수정·계정·접속기록이 모두 지워지고 처음 예시 데이터로 돌아갑니다.</p><div class="mact"><button class="btn" data-act="mclose">취소</button><button class="btn pri" data-act="reset-go">처음 상태로</button></div>'); break;
    case 'reset-go': STATE = freshState(); save(); try { history.replaceState(null, '', location.pathname + location.search); } catch (er) { } location.reload(); break;
    case 'tab': setTab(b.dataset.tab); break;
    case 'play': SIM.play = !SIM.play; updateClock(); break;
    case 'hidehelp': STATE.help[b.dataset.k] = 1; save(); b.closest('.help').remove(); break;
    case 'mypw': pwModal(false); break;
    case 'mclose': mclose(); break;
    case 'copy': (async () => { try { await navigator.clipboard.writeText(b.dataset.v); toast('복사했습니다'); } catch (er) { const t = document.getElementById('tpw'); if (t) { const rg = document.createRange(); rg.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); } toast('선택된 비밀번호를 직접 복사하세요'); } })(); break;
    // 대시보드 이동
    case 'ymonth': VS.month = +b.dataset.m; VS.mmode = 'all'; setTab('month'); break;
    case 'heat': VS.month = +b.dataset.m; VS.msvc = +b.dataset.s; VS.mmode = 'svc'; setTab('month'); break;
    case 'mprev': VS.month = Math.max(0, VS.month - 1); render(); break;
    case 'mnext': VS.month = Math.min(11, VS.month + 1); render(); break;
    case 'mmode': VS.mmode = b.dataset.k; render(); break;
    case 'mday': VS.date = +b.dataset.dn; if (VS.mmode === 'svc' || VS.mmode === 'worker') { VS.f.svc = ORG() == null ? String(VS.msvc) : ''; VS.wsvc = VS.msvc; } else VS.f.svc = ''; VS.f.q = VS.mmode === 'person' ? R[VS.mperson].code : ''; setTab('day'); break;
    case 'dprev': if (VS.date > YEAR0N) { VS.date--; updateDay(); } break;
    case 'dnext': if (VS.date < YEAREN) { VS.date++; updateDay(); } break;
    case 'dtoday': VS.date = TODAYN; updateDay(); break;
    case 'dsub': VS.dsub = b.dataset.k; document.querySelectorAll('[data-act="dsub"]').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === VS.dsub)); updateDay(); break;
    case 'wsvc': VS.wsvc = +b.dataset.k; updateDay(); break;
    case 'open': { const r = R[+b.dataset.rid]; if (ORG() != null && !r.svc[ORG()]) { toast('우리 기관이 담당하지 않는 어르신입니다'); break; } VS.drawer = r.id; audit('view_recipient', r.code, r.name); save(); renderDrawer(); break; }
    case 'close': VS.drawer = null; renderDrawer(); break;
    case 'caretoggle': { const id = +b.dataset.rid; if (STATE.care[id]) { delete STATE.care[id]; toast('집중관리 지정을 해제했습니다'); } else { STATE.care[id] = { st: '미확인', memo: '', manual: true }; toast('집중관리 대상으로 지정했습니다'); } audit('care_update', R[id].code, STATE.care[id] ? '지정' : '해제'); save(); renderDrawer(); if (VS.tab === 'care') render(); break; }
    case 'toperson': VS.mperson = +b.dataset.rid; VS.mmode = 'person'; VS.drawer = null; renderDrawer(); VS.month = TODAY.getMonth(); setTab('month'); break;
    // 긴급 조치
    case 'emg': modal(`<h2>긴급 상황 조치</h2><form class="form" id="emgform" data-id="${b.dataset.id}"><div class="full checks"><label><input type="radio" name="emst" value="확인중" checked> 확인 중 (계속 대응)</label><label><input type="radio" name="emst" value="조치완료"> 조치 완료</label></div><label class="full">조치 내용<textarea id="em-memo" rows="3" required placeholder="예: 보호자 통화, 119 출동 확인, 병원 이송"></textarea></label><div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">저장</button></div></form>`); break;
    // 월간 계획
    case 'pprev': VS.pym = addMonths(VS.pym, -1); VS.pcell = null; render(); break;
    case 'pnext': VS.pym = addMonths(VS.pym, 1); VS.pcell = null; render(); break;
    case 'pcell': VS.pcell = { wid: +b.dataset.w, dn: +b.dataset.dn }; document.querySelectorAll('.wc.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); drawPlanDay(); break;
    case 'plan-draft': { const s = ORG(); let n = 0; for (const k in STATE.mods) if (STATE.mods[k].del && SV[+k.split('_')[2]] && +k.split('_')[2] === s && ymOf(+k.split('_')[0]) === VS.pym) { delete STATE.mods[k]; n++; } STATE.plans[s + '_' + VS.pym] = { ...planOf(s, VS.pym), st: planOf(s, VS.pym).st }; audit('plan_draft', `${VS.pym} ${SV[s].short}`, `빠진 일정 ${n}건 다시 채움`); save(); toast(n ? `빠진 일정 ${n}건을 규칙대로 다시 채웠습니다` : '이용 규칙대로 일정이 모두 들어 있습니다'); render(); break; }
    case 'plan-submit': { const warn = document.querySelectorAll('.chk.warn').length; modal(`<h2>${ymLabel(VS.pym)} 계획을 제출할까요?</h2><p>${warn ? `<b style="color:var(--st-late)">점검에서 확인이 필요한 항목이 ${warn}개 있습니다.</b> 이유가 있는 경우(어르신 요청 등)에만 그대로 제출하세요.` : '자동 점검에서 문제가 없었습니다.'}</p><p>제출하면 총괄 담당자가 승인할 때까지 일정을 고칠 수 없습니다.</p><div class="mact"><button class="btn" data-act="mclose">더 고칠게요</button><button class="btn pri" data-act="plan-submit-go">제출하기</button></div>`); break; }
    case 'plan-submit-go': { const s = ORG(); STATE.plans[s + '_' + VS.pym] = { st: '제출', at: nowStr(), by: me.login, note: null }; audit('plan_submit', `${VS.pym} ${SV[s].short}`); save(); mclose(); toast('제출했습니다. 총괄 담당자 계정으로 들어가 승인해 보세요'); render(); break; }
    case 'sched-save': { const box = b.closest('.pd'), g = f => box.querySelector(`[data-f="${f}"]`).value; const x = findSched(b.dataset.k, +b.dataset.dn); if (!x) break; const nd = g('date') ? dnOf(g('date')) : x.dn, nt = parseHM(g('time')) ?? x.t, nw = +g('wid');
      if (nd <= TODAYN) { toast('내일 이후 날짜로만 옮길 수 있습니다'); break; } if (!planEditable(x.s, ymOf(nd))) { toast('옮길 달의 계획이 이미 제출 또는 승인되었습니다'); break; } if (nd !== x.dn && hasSched(nd, x.r.id, x.s, x.k)) { toast('그 날짜에 같은 어르신의 일정이 이미 있습니다'); break; }
      moveRec(x, nd, nt, nw); audit('schedule_update', x.r.code, `${sdate(x.dn)} ${hm(x.t)} → ${sdate(nd)} ${hm(nt)}`); save(); toast('일정을 고쳤습니다'); render(); break; }
    case 'sched-del': { const x = findSched(b.dataset.k, +b.dataset.dn); if (!x) break; delRec(x); audit('schedule_delete', x.r.code, sdate(x.dn)); save(); toast('이 날 방문을 뺐습니다. 점검에 횟수 미달로 표시됩니다'); render(); break; }
    case 'bulk-move': { const s = ORG(), f = val('bm-from'), t = val('bm-to'); if (!f || !t) { toast('두 날짜를 모두 골라 주세요'); break; } const fd = dnOf(f), tdn = dnOf(t); if (fd <= TODAYN || tdn <= TODAYN) { toast('내일 이후 날짜만 옮길 수 있습니다'); break; } if (!planEditable(s, ymOf(fd)) || !planEditable(s, ymOf(tdn))) { toast('제출 또는 승인된 달은 바로 옮길 수 없습니다'); break; }
      let mv = 0, sk = 0; daySched(fd).filter(x => x.s === s && !STATE.visits[x.k]).forEach(x => { if (hasSched(tdn, x.r.id, x.s, x.k)) { sk++; return; } moveRec(x, tdn, x.t, x.w.id); mv++; });
      audit('bulk_move', `${f} → ${t}`, `옮김 ${mv} · 건너뜀 ${sk}`); save(); toast(`${mv}건을 옮겼습니다${sk ? ` (같은 날 일정이 있어 ${sk}건은 그대로 둠)` : ''}`); render(); break; }
    case 'bulk-transfer': { const s = ORG(), fw = +val('bt-from'), tw = +val('bt-to'); if (fw === tw) { toast('서로 다른 담당자를 골라 주세요'); break; } let d1 = dnOf(val('bt-d1')), d2 = dnOf(val('bt-d2')); if (d1 <= TODAYN) d1 = TODAYN + 1; let n = 0, lk = 0;
      for (let d = d1; d <= d2; d++) daySched(d).filter(x => x.w.id === fw && !STATE.visits[x.k]).forEach(x => { if (!planEditable(s, ymOf(d))) { lk++; return; } moveRec(x, x.dn, x.t, tw); n++; });
      if (document.getElementById('bt-perm').checked) R.forEach(r => { const en = r.svc[s]; if (en && (en.w === fw || (STATE.reassign[r.id + '_' + s] || {}).wid === fw)) STATE.reassign[r.id + '_' + s] = { wid: tw, from: d2 + 1 }; });
      audit('bulk_transfer', `${W[fw].name} → ${W[tw].name}`, `${n}건${lk ? ` · 확정된 달 ${lk}건 제외` : ''}`); save(); toast(`${n}건을 ${W[tw].name}님에게 넘겼습니다${lk ? ` (확정된 달 ${lk}건 제외)` : ''}`); render(); break; }
    case 'sched-add': { const s = ORG(), m = val('sa-r').match(/JD-\d+/), r = m ? R.find(x => x.code === m[0]) : R.find(x => x.name === val('sa-r')); if (!r || !r.svc[s]) { toast('목록에서 우리 기관 어르신을 골라 주세요'); break; } const d = val('sa-d') ? dnOf(val('sa-d')) : null, t = parseHM(val('sa-t'));
      if (!d || t == null) { toast('날짜와 시각을 골라 주세요'); break; } if (d <= TODAYN) { toast('내일 이후 날짜만 추가할 수 있습니다'); break; } if (!planEditable(s, ymOf(d))) { toast('그 달 계획은 이미 제출 또는 승인되었습니다'); break; } if (hasSched(d, r.id, s)) { toast('그 날짜에 이미 일정이 있습니다'); break; }
      STATE.adds.push({ k: 'a' + nid(), dn: d, rid: r.id, s, wid: r.svc[s].w, t, d: SV[s].dur }); audit('schedule_add', r.code, `${sdate(d)} ${hm(t)}`); save(); toast('일정을 추가했습니다'); VS.pcell = { wid: r.svc[s].w, dn: d }; render(); break; }
    case 'reqchange': reqModal(b.dataset.k, +b.dataset.dn); break;
    // 계획 승인
    case 'aprev': VS.aym = addMonths(VS.aym, -1); render(); break;
    case 'anext': VS.aym = addMonths(VS.aym, 1); render(); break;
    case 'plancal': VS.month = +VS.aym.slice(5, 7) - 1; VS.mmode = 'worker'; VS.msvc = +b.dataset.s; setTab('month'); break;
    case 'approve': { const s = +b.dataset.s; STATE.plans[s + '_' + VS.aym] = { ...planOf(s, VS.aym), st: '승인', note: null, dat: nowStr(), dby: me.login }; audit('plan_decide', `${VS.aym} ${SV[s].short}`, '승인'); save(); toast(`${SV[s].short} 계획을 승인했습니다`); render(); break; }
    case 'reject': reasonModal(`${SV[+b.dataset.s].short} ${ymLabel(VS.aym)} 계획 반려`, 'plan', b.dataset.s); break;
    case 'cr-ok': { const c = STATE.crs.find(z => z.id === +b.dataset.id); if (!c) break; const x = findSched(c.k, c.odn); if (!x) { toast('일정을 찾을 수 없습니다'); break; } if (STATE.visits[c.k]) { toast('이미 수행기록이 있어 옮길 수 없습니다'); break; } if (c.nd !== x.dn && hasSched(c.nd, x.r.id, x.s, x.k)) { toast('옮길 날짜에 같은 어르신의 일정이 이미 있습니다'); break; }
      moveRec(x, c.nd, c.nt, x.w.id); c.st = '승인'; c.dby = me.login; c.dat = nowStr(); audit('change_decide', R[c.rid].code, '승인'); save(); toast('승인하고 일정에 반영했습니다'); render(); break; }
    case 'cr-no': reasonModal('일정 변경 요청 반려', 'cr', b.dataset.id); break;
    // 계정
    case 'user-reset': { const pw = tempPw(); setUserMod(b.dataset.l, { pw, must: true }); FAILS[b.dataset.l] = 0; audit('user_reset', b.dataset.l); save(); showTempPw('비밀번호를 초기화했습니다', b.dataset.l, pw); break; }
    case 'user-toggle': { const u = findUser(b.dataset.l); setUserMod(u.login, { active: !u.active }); if (u.wid != null) W[u.wid].active = !u.active; audit(u.active ? 'user_deactivate' : 'user_activate', u.login); save();
      const rem = u.wid != null && u.active ? (() => { let n = 0; for (let d = TODAYN + 1; d <= TODAYN + 45; d++) n += daySched(d).filter(x => x.w.id === u.wid).length; return n; })() : 0;
      toast(u.active ? `사용을 정지했습니다${rem ? `. 남은 일정 ${rem}건은 월간 계획에서 다른 담당자에게 넘기세요` : ''}` : '다시 사용하도록 했습니다'); render(); break; }
    case 'audit-search': VS.aq = val('aq'); VS.aa = val('aa'); render(); break;
    // 현장 앱
    case 's-close': closeSheet(); break;
    case 'f-start': { const x = fRec(b.dataset.k); if (!x) break; STATE.visits[x.k] = { st: 'prog', start: SIM.now }; audit('visit_start', x.r.code, SV[x.s].short); save(); toast('방문을 시작했습니다'); render(); break; }
    case 'f-end': { const x = fRec(b.dataset.k); const flags = [...SV[x.s].flags, '부재·응답 없음'];
      openSheet(`<div class="sheet" role="dialog" aria-label="방문 종료"><h2 style="margin:0;font-size:18px">${x.r.name} 방문 종료</h2><div><div class="label" style="margin-bottom:6px">어르신 건강상태</div><div class="hbtns">${HL.map((l, i) => `<button type="button" data-h="${i}" style="--hc:var(--h${i})" aria-pressed="false">${l}</button>`).join('')}</div></div>
        <div><div class="label" style="margin-bottom:6px">확인된 징후 (해당하면 누르세요)</div><div class="fl">${flags.map(f => `<label><input type="checkbox" name="flag" value="${esc(f)}">${esc(f)}</label>`).join('')}</div></div><div><label class="label" for="fnote">특이사항 메모</label><textarea id="fnote" rows="3" placeholder="예: 식사량이 줄었다고 하심"></textarea></div>
        <div class="acts"><button data-act="s-close">닫기</button><button class="end" data-act="f-end-save" data-k="${x.k}">저장</button></div></div>`); break; }
    case 'f-end-save': { const x = fRec(b.dataset.k), h = document.querySelector('[data-h][aria-pressed="true"]'); if (!h) { toast('건강상태를 골라 주세요'); break; } const v = STATE.visits[x.k] || { start: info(x).start ?? SIM.now };
      STATE.visits[x.k] = { st: 'done', start: v.start, end: Math.max(SIM.now, (v.start || SIM.now) + 1), h: +h.dataset.h, flags: [...document.querySelectorAll('input[name="flag"]:checked')].map(i => i.value), note: val('fnote') };
      audit('visit_end', x.r.code, `${SV[x.s].short} · 건강 ${HL[+h.dataset.h]}`); save(); closeSheet(); toast(+h.dataset.h === 2 ? '저장했습니다. 건강 "나쁨"은 총괄 담당자 화면에 바로 표시됩니다' : '방문 기록을 저장했습니다'); render(); break; }
    case 'f-cancel': { const x = fRec(b.dataset.k); openSheet(`<div class="sheet" role="dialog" aria-label="방문 취소"><h2 style="margin:0;font-size:18px">${x.r.name} 방문 취소</h2><div class="fl">${[...CANCEL, '기타'].map((c, i) => `<label><input type="radio" name="creason" value="${c}" ${i === 0 ? 'checked' : ''}>${c}</label>`).join('')}</div><div class="acts"><button data-act="s-close">닫기</button><button class="go" data-act="f-cancel-save" data-k="${x.k}">취소 기록</button></div></div>`); break; }
    case 'f-cancel-save': { const x = fRec(b.dataset.k), r = document.querySelector('input[name="creason"]:checked'); STATE.visits[x.k] = { st: 'cancel', reason: r ? r.value : '기타' }; audit('visit_cancel', x.r.code, r ? r.value : ''); save(); closeSheet(); toast('취소를 기록했습니다'); render(); break; }
    case 'f-req': reqModal(b.dataset.k, TODAYN); break;
    case 'f-req2': reqModal(b.dataset.k, +b.dataset.dn); break;
    case 'fday': VS.fday = +b.dataset.dn === VS.fday ? null : +b.dataset.dn; render(); if (VS.fday != null) { const el = document.querySelector('.fdlist'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } break;
    case 'fm-prev': VS.fm = addMonths(VS.fm, -1); VS.fday = null; render(); break;
    case 'fm-next': VS.fm = addMonths(VS.fm, 1); VS.fday = null; render(); break;
    case 'f-emg': { const x = fRec(b.dataset.k); openSheet(`<form class="sheet" id="femg" data-k="${x.k}" aria-label="긴급 상황 알리기"><h2 style="margin:0;font-size:18px;color:var(--st-miss)">긴급 상황 알리기 · ${x.r.name}</h2><p style="margin:0;font-size:14px"><b>생명이 위급하면 먼저 119에 전화하세요.</b> 이 버튼은 군 총괄 담당자와 우리 기관에 바로 알립니다.</p>
        <div class="fl">${EMG.map((c, i) => `<label><input type="radio" name="ekind" value="${c}" ${i === 0 ? 'checked' : ''}>${c}</label>`).join('')}</div><label class="label">상황 설명<textarea id="em-note" rows="3" placeholder="예: 방에 쓰러져 계셔서 119 신고함"></textarea></label><div class="acts"><button type="button" data-act="s-close">닫기</button><button class="emgb2" type="submit">긴급 알리기</button></div></form>`); break; }
  }
});

/* ---------- 입력·제출 ---------- */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'fq') { VS.f.q = t.value; updateDay(); }
  if (t.id === 'uq') { VS.uq = t.value; clearTimeout(window.__uqT); window.__uqT = setTimeout(() => { render(); const el = document.getElementById('uq'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 300); }
});
document.addEventListener('change', e => {
  const t = e.target, f = VS.f;
  if (t.id === 'femd') { f.emd = t.value; updateDay(); } else if (t.id === 'fsvc') { f.svc = t.value; updateDay(); } else if (t.id === 'fst') { f.st = t.value; updateDay(); } else if (t.id === 'fsort') { f.sort = t.value; updateDay(); } else if (t.id === 'fall') { f.all = t.checked; updateDay(); }
  else if (t.id === 'msvc') { VS.msvc = +t.value; render(); }
  else if (t.id === 'mperson') { const m = t.value.match(/JD-(\d+)/) || []; const r = m[1] ? R[+m[1] - 1001] : R.find(x => x.name === t.value.trim()); if (r) { VS.mperson = r.id; render(); } }
  else if (t.dataset.care) { const id = +t.dataset.rid; STATE.care[id] = STATE.care[id] || { st: '미확인', memo: '' }; STATE.care[id][t.dataset.care] = t.value; audit('care_update', R[id].code, t.value); save(); toast(t.dataset.care === 'st' ? `처리 상태: ${t.value}` : '메모를 저장했습니다'); }
  else if (t.dataset.repmemo != null) { const rp = STATE.reports.find(z => z.id === t.dataset.repmemo); if (!rp) return; rp.memo = t.value; audit('report_status', rp.name, `메모: ${t.value}`); save(); toast('상담 메모를 저장했습니다'); }
  else if (t.dataset.rep != null) { const rp = STATE.reports.find(z => z.id === t.dataset.rep); if (!rp) return; rp.st = t.value; audit('report_status', rp.name, t.value); save(); toast(`퇴원지원 신청 단계: ${t.value}`); render(); }
});
document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault(); const me = ME();
  if (f.id === 'loginform') { doLogin(val('lg-id'), document.getElementById('lg-pw').value); return; }
  if (f.id === 'repform' || f.id === 'pubform') {
    const pub = f.id === 'pubform', needs = [...f.querySelectorAll('input[name="rneed"]:checked')].map(x => x.value);
    if (!val('rn') || !val('rh') || !val('rd') || !val('rw') || (pub && !val('rp'))) { toast(`환자 이름, ${pub ? '연락처, ' : ''}입원 병원, 퇴원일, 이유를 적어 주세요`); return; }
    if (pub && !document.getElementById('rc').checked) { toast('개인정보 수집·이용에 동의해야 신청할 수 있습니다'); return; }
    const no = dcNo(TODAYN, STATE.reports.filter(x => x.no && x.no.startsWith(dcNo(TODAYN, 0).slice(0, 12))).length + 1);
    STATE.reports.unshift({ id: 'r' + nid(), no, via: pub ? '온라인 신청' : '담당자 대리 접수', at: nowStr(), kind: val('rk'), by: val('rb') || (pub ? '' : me.name), name: val('rn'), age: val('ra') || '-', emd: val('re'), phone: val('rp'), hosp: val('rh'), ddn: dnOf(val('rd')), needs: needs.length ? needs : ['상담 후 결정'], why: val('rw'), st: '접수', memo: '', consent: pub });
    if (pub) { const cur = STATE.session; STATE.session = cur; STATE.audit.unshift({ at: nowStr(), login: '(신청 페이지)', action: 'report', target: val('rn'), detail: `${no} · ${val('rh')} · ${ddLabel(dnOf(val('rd')))}` }); save(); VS.applied = no; render(); window.scrollTo(0, 0); return; }
    audit('report', val('rn'), `${no} · 대리 접수 · ${val('rh')}`); save(); toast(`대리 접수했습니다 (${no})`); render(); return;
  }
  if (f.id === 'dcform') {
    const x = STATE.reports.find(z => z.id === f.dataset.id), stt = (f.querySelector('input[name="dcst"]:checked') || {}).value, memo = val('dc-memo');
    if (!x || !stt) return; if (!memo) { toast('처리 내용을 적어 주세요'); return; }
    x.st = stt; x.memo = memo; x.hby = me.login; x.hat = nowStr();
    audit('report_status', x.name, `${x.no} · ${stt} · ${memo}`); save(); mclose(); toast(`${x.name} 신청을 "${stt}" 단계로 처리했습니다`); render(); return;
  }
  if (f.id === 'lookform') {
    const no = val('lk-no').toUpperCase(), name = val('lk-name'), x = STATE.reports.find(z => z.no === no && z.name === name), out = document.getElementById('lk-out');
    if (!x) { out.innerHTML = '<p class="err" role="alert">접수번호와 환자 이름이 맞는 신청을 찾지 못했습니다. 다시 확인해 주세요.</p>'; return; }
    const si = DC_STEPS.indexOf(x.st);
    out.innerHTML = `<div class="rep" style="margin-top:10px"><div class="h"><b>${esc(x.name)} · ${esc(x.no)}</b>${pill(x.st)}</div><ol class="dcprog">${DC_STEPS.map((s, i) => `<li class="${i < si ? 'done' : i === si ? 'cur' : ''}">${s}</li>`).join('')}</ol><span>${{ '접수': '신청이 접수되었습니다. 담당자가 곧 연락드립니다.', '상담·욕구조사': '담당자가 상담하며 필요한 돌봄을 확인하고 있습니다.', '서비스연계': '수행기관과 서비스를 연결하고 있습니다. 첫 방문 일정을 안내해 드립니다.', '종결': '지원 절차가 마무리되었습니다.' }[x.st]}</span><small style="color:var(--muted)">${esc(x.at)} 신청 · ${ddLabel(x.ddn)}</small></div>`;
    return;
  }
  if (f.id === 'pwform') {
    const u = me; if (document.getElementById('pw0').value !== u.pw) { toast('지금 비밀번호가 맞지 않습니다'); return; }
    const n = document.getElementById('pw1').value; if (n.length < 8 || !/[A-Za-z]/.test(n) || !/\d/.test(n)) { toast('영문과 숫자를 섞어 8자 이상으로 만들어 주세요'); return; }
    if (n !== document.getElementById('pw2').value) { toast('새 비밀번호 두 칸이 서로 다릅니다'); return; }
    setUserMod(u.login, { pw: n, must: false }); audit('password_change', u.login); save(); mclose(); toast('비밀번호를 바꿨습니다'); return;
  }
  if (f.id === 'reqform') {
    const k = f.dataset.k, x = findSched(k, +f.dataset.dn), nd = dnOf(val('rq-d')), nt = parseHM(val('rq-t')), why = val('rq-w');
    if (!x || nt == null || !why) { toast('날짜·시각·이유를 모두 적어 주세요'); return; }
    if (nd < TODAYN) { toast('오늘 이후 날짜로만 옮길 수 있습니다'); return; }
    STATE.crs.push({ id: nid(), k, rid: x.r.id, s: x.s, odn: x.dn, ot: x.t, nd, nt, reason: why, by: me.login, at: nowStr(), st: '대기' });
    audit('change_request', x.r.code, `${sdate(nd)} ${hm(nt)} · ${why}`); save(); mclose(); toast('변경 요청을 올렸습니다. 총괄 담당자가 승인하면 반영됩니다'); render(); return;
  }
  if (f.id === 'reasonform') {
    const why = val('rs-w'); if (!why) return;
    if (f.dataset.kind === 'plan') { const s = +f.dataset.id; STATE.plans[s + '_' + VS.aym] = { ...planOf(s, VS.aym), st: '반려', note: why, dat: nowStr(), dby: me.login }; audit('plan_decide', `${VS.aym} ${SV[s].short}`, `반려 · ${why}`); }
    else { const c = STATE.crs.find(z => z.id === +f.dataset.id); c.st = '반려'; c.note = why; c.dby = me.login; c.dat = nowStr(); audit('change_decide', R[c.rid].code, `반려 · ${why}`); }
    save(); mclose(); toast('반려했습니다'); render(); return;
  }
  if (f.id === 'uform') {
    const role = val('u-role'), login = val('u-login'), name = val('u-name');
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(login)) { toast('아이디는 영문·숫자 3~30자로 적어 주세요'); return; }
    if (findUser(login)) { toast('이미 쓰고 있는 아이디입니다'); return; }
    if (!name) { toast('이름을 적어 주세요'); return; }
    const pw = tempPw(), nu = { login, name, role, pw };
    if (role === 'org') nu.sid = +val('u-org');
    if (role === 'worker') { const id = W.length, e2 = Math.max(0, EMD.indexOf(val('u-emd'))); W[id] = { id, s: me.sid, k: 99, name, slack: 0, rs: [], active: true, e: e2 }; STATE.newWorkers.push({ id, s: me.sid, name, e: e2 }); nu.sid = me.sid; nu.wid = id; }
    STATE.newUsers.push(nu); setUserMod(login, { must: true }); audit('user_create', login, ROLE_LABEL[role]); save(); render(); showTempPw('계정을 만들었습니다', login, pw); return;
  }
  if (f.id === 'emgform') {
    const m = STATE.emgs.find(z => z.id === +f.dataset.id), stt = (f.querySelector('input[name="emst"]:checked') || {}).value, memo = val('em-memo');
    if (!memo) { toast('어떻게 조치했는지 적어 주세요'); return; }
    m.st = stt; m.memo = memo; m.hby = me.login; m.hat = nowStr(); audit('emergency_handle', R[m.rid].code, `${stt}: ${memo}`); save(); mclose(); toast(stt === '조치완료' ? '조치 완료로 기록했습니다' : '확인 중으로 기록했습니다'); drawBanner(); return;
  }
  if (f.id === 'femg') {
    const x = fRec(f.dataset.k), k = f.querySelector('input[name="ekind"]:checked');
    STATE.emgs.unshift({ id: nid(), at: hm(SIM.now), k: x.k, rid: x.r.id, s: x.s, by: me.login, kind: k ? k.value : '기타', note: val('em-note'), st: '접수' });
    audit('emergency', x.r.code, k ? k.value : ''); save(); closeSheet(); toast('긴급 상황을 알렸습니다. 총괄 담당자 화면 맨 위에 바로 표시됩니다'); return;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.getElementById('modalbox').innerHTML && !document.querySelector('#modalbox .scrim:not([data-act])')) mclose(); else if (VS.drawer != null) { VS.drawer = null; renderDrawer(); } else closeSheet(); } });

/* ---------- 시계 ---------- */
setInterval(() => {
  if (!SIM.play || SIM.now >= 19 * 60) return;
  SIM.now += 1; updateClock();
  if (!ME() || onApply()) return;
  if (VS.tab === 'day' && VS.date === TODAYN) updateDay();
  else if (VS.tab === 'field' && !sheet().innerHTML) renderField();
  else if (VS.drawer != null) renderDrawer();
  if (SIM.now % 5 === 0) drawBanner();
}, 3000);

/* ---------- 시작 ---------- */
drawChrome();
if (onApply()) render();
else if (ME()) { const h = (location.hash || '').slice(1); setTab(h || (TABS[ROLE()] || [['day']])[0][0]); } else render();
// 다른 탭(예: 신청 페이지)에서 저장하면 이 화면에도 바로 반영되고 알림이 뜸
window.addEventListener('storage', e => {
  if (e.key !== SKEY || !e.newValue) return;
  try { const s = JSON.parse(e.newValue); if (s && s.v === 3) { STATE = s; RK.at = -1; _meKey = null; } } catch (er) { return; }
  if (onApply()) return;
  drawChrome();
  if (!ME()) { render(); return; }
  if (VS.tab === 'discharge' || VS.tab === 'care') render(); else if (VS.tab === 'day') updateDay();
});
window.addEventListener('hashchange', () => { drawChrome(); if (onApply() || !ME()) render(); else setTab(location.hash.slice(1)); });
updateClock();

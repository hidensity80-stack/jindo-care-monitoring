'use strict';
/* 현장 앱: 로그인한 수행자의 오늘 일정 → 시작 → 종료(건강상태) / 취소 / 변경 요청 / 긴급, 이웃 발굴신고 */
const pad = n => String(n).padStart(2, '0');
const hm = m => m == null ? '' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STL = { plan: '예정', prog: '진행중', done: '완료', late: '지연', miss: '미수행', cancel: '취소' };
const HL = ['좋음', '보통', '나쁨'];
const HOUSE = ['독거', '부부', '자녀 동거'];
const EMD = ['진도읍', '고군면', '군내면', '의신면', '임회면', '지산면', '조도면'];
const SVC_NAMES = ['목욕', '가사', '식사(도시락)', '미용', '이동', '스마트돌봄', '방문의료'];
const CANCEL = ['병원 입원', '가족 방문', '본인 거절', '외출 부재', '기타'];
const EMG = ['쓰러짐·의식 저하', '응답 없음·부재', '부상·출혈', '심한 통증·호흡 곤란', '기타'];
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

async function api(a, params = {}, body) {
  const u = new URL('api.php', location.href);
  u.searchParams.set('a', a);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify(body) } : {});
  if (r.status === 401) { location.href = 'login.php'; throw new Error('로그인이 필요합니다.'); }
  const j = await r.json().catch(() => ({ error: `서버 응답 오류 (${r.status})` }));
  if (!r.ok || j.error) throw new Error(j.error || `요청 실패 (${r.status})`);
  return j;
}

let DATA = null;
const listEl = document.getElementById('list');
const sheet = document.getElementById('sheetbox');

async function load() {
  try { DATA = await api('field'); draw(); }
  catch (e) { listEl.innerHTML = `<p class="empty-note">${esc(e.message)}</p>`; }
}

function draw() {
  const { worker, recs, today, now } = DATA;
  const d = new Date(today + 'T00:00:00');
  document.getElementById('today').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 · ${worker.service} ${worker.role} · ${hm(now)} 기준`;
  const c = s => recs.filter(x => x.st === s).length;
  document.getElementById('sum').innerHTML = `<div><b>${recs.length}</b><span>오늘 일정</span></div><div><b>${c('done')}</b><span>완료</span></div><div><b>${c('prog')}</b><span>진행중</span></div><div><b>${c('plan') + c('late')}</b><span>남음</span></div>`;
  if (!recs.length) { listEl.innerHTML = '<p class="empty-note">오늘은 방문 일정이 없습니다.</p>'; return; }
  // 진행중 → 남은 일정 → 끝난 일정 순
  const order = { prog: 0, late: 1, plan: 2, done: 3, cancel: 4, miss: 5 };
  const sorted = [...recs].sort((a, b) => order[a.st] - order[b.st] || a.t - b.t);
  listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">${sorted.map(x => {
    const w = x.who || {};
    let acts = '';
    if (x.st === 'plan' || x.st === 'late') acts = `<div class="acts"><button class="go" data-act="start" data-id="${x.id}">방문 시작</button><button data-act="cancel" data-id="${x.id}">취소</button></div>`;
    else if (x.st === 'prog') acts = `<div class="acts"><button class="end" data-act="end" data-id="${x.id}">종료 · 상태 입력</button></div>`;
    else if (x.st === 'done') acts = `<div class="meta">${hm(x.start)}~${hm(x.end)} · 건강 <b style="color:var(--h${x.h})">${HL[x.h] ?? '-'}</b>${x.flags.length ? ` · ${esc(x.flags.join(', '))}` : ''}${x.note ? `<br>메모: ${esc(x.note)}` : ''}</div>`;
    else if (x.st === 'cancel') acts = `<div class="meta">취소 사유: ${esc(x.reason || '')}</div>`;
    const sub = `<div class="acts2">${x.st === 'plan' || x.st === 'late' ? (x.pending_change ? '<span class="meta">변경 요청 처리 대기 중</span>' : `<button data-act="req" data-id="${x.id}">일정 변경 요청</button>`) : ''}<button class="emgb" data-act="emg" data-id="${x.id}">긴급</button></div>`;
    return `<div class="card ${x.st === 'done' || x.st === 'cancel' ? 'done' : ''}">
      <div class="top1"><span class="tm">${hm(x.t)}</span><span class="chip st-${x.st}"><i class="dot"></i>${STL[x.st]}</span></div>
      <div><span class="nm">${esc(w.name)}</span> <span class="meta">${esc(w.age)}세 · ${esc(w.sex)} · ${esc(w.emd)} · ${HOUSE[w.household] ?? ''}</span></div>
      ${acts}${sub}</div>`;
  }).join('')}</div>`;
}

const findRec = id => DATA.recs.find(x => x.id === id);
const closeSheet = () => { sheet.innerHTML = ''; };
const open = html => { sheet.innerHTML = `<div class="scrim" data-act="close"></div>${html}`; };

function openEnd(x) {
  const flags = [...(DATA.worker.flags || []), '부재·응답 없음'];
  open(`<div class="sheet" role="dialog" aria-label="방문 종료">
    <h2 style="margin:0;font-size:18px">${esc(x.who?.name)} 방문 종료</h2>
    <div><div class="label" style="margin-bottom:6px">어르신 건강상태</div>
      <div class="hbtns">${HL.map((l, i) => `<button type="button" data-h="${i}" style="--hc:var(--h${i})" aria-pressed="false">${l}</button>`).join('')}</div></div>
    <div><div class="label" style="margin-bottom:6px">확인된 징후 (해당하면 누르세요)</div><div class="fl">${flags.map(f => `<label><input type="checkbox" name="flag" value="${esc(f)}">${esc(f)}</label>`).join('')}</div></div>
    <div><label class="label" for="note">특이사항 메모</label><textarea id="note" rows="3" placeholder="예: 식사량이 줄었다고 하심"></textarea></div>
    <div class="acts"><button data-act="close">닫기</button><button class="end" data-act="save-end" data-id="${x.id}">저장</button></div></div>`);
}
function openCancel(x) {
  open(`<div class="sheet" role="dialog" aria-label="방문 취소">
    <h2 style="margin:0;font-size:18px">${esc(x.who?.name)} 방문 취소</h2>
    <div class="fl">${CANCEL.map((c, i) => `<label><input type="radio" name="creason" value="${c}" ${i === 0 ? 'checked' : ''}>${c}</label>`).join('')}</div>
    <div class="acts"><button data-act="close">닫기</button><button class="go" data-act="save-cancel" data-id="${x.id}">취소 기록</button></div></div>`);
}
function openReq(x) {
  open(`<form class="sheet" id="reqform" data-id="${x.id}" aria-label="일정 변경 요청">
    <h2 style="margin:0;font-size:18px">${esc(x.who?.name)} 일정 변경 요청</h2>
    <p class="empty-note" style="margin:0">총괄 담당자가 승인하면 일정이 바뀝니다.</p>
    <label class="label">바꿀 날짜<input type="date" id="rq-d" value="${DATA.today}" min="${DATA.today}" required></label>
    <label class="label">바꿀 시각<input type="time" id="rq-t" value="${hm(x.t)}" step="300" required></label>
    <label class="label">이유<textarea id="rq-w" rows="3" required placeholder="예: 어르신 병원 진료와 겹침"></textarea></label>
    <div class="acts"><button type="button" data-act="close">닫기</button><button class="go" type="submit">요청 올리기</button></div></form>`);
}
function openEmg(x) {
  open(`<form class="sheet" id="emgform" data-id="${x.id}" aria-label="긴급 상황 알리기">
    <h2 style="margin:0;font-size:18px;color:var(--st-miss)">긴급 상황 알리기 · ${esc(x.who?.name)}</h2>
    <p style="margin:0;font-size:14px"><b>생명이 위급하면 먼저 119에 전화하세요.</b> 이 버튼은 군 총괄 담당자와 우리 기관에 바로 알립니다.</p>
    <div class="fl">${EMG.map((c, i) => `<label><input type="radio" name="ekind" value="${c}" ${i === 0 ? 'checked' : ''}>${c}</label>`).join('')}</div>
    <label class="label">상황 설명<textarea id="em-note" rows="3" placeholder="예: 방에 쓰러져 계셔서 119 신고함"></textarea></label>
    <div class="acts"><button type="button" data-act="close">닫기</button><button class="emgb2" type="submit">긴급 알리기</button></div></form>`);
}
function openReport() {
  open(`<form class="sheet" id="rform" aria-label="이웃 발굴신고">
    <h2 style="margin:0;font-size:18px">이웃 발굴신고</h2>
    <p class="empty-note" style="margin:0">돌봄이 필요해 보이는 이웃 어르신을 알려 주세요. 군 사업관리 부서로 바로 접수됩니다.</p>
    <label class="label">대상자 이름<input id="rn" required placeholder="예: 홍○동"></label>
    <label class="label">나이<input id="ra" type="number" min="40" max="110" placeholder="80"></label>
    <label class="label">읍·면<select id="re">${EMD.map(e => `<option>${e}</option>`).join('')}</select></label>
    <div><div class="label" style="margin-bottom:6px">필요해 보이는 서비스</div><div class="fl">${SVC_NAMES.map(n => `<label><input type="checkbox" name="rneed" value="${n}">${n}</label>`).join('')}</div></div>
    <label class="label">발굴 사유<textarea id="rw" rows="3" required placeholder="현장에서 본 상황을 적어 주세요"></textarea></label>
    <div class="acts"><button type="button" data-act="close">닫기</button><button class="go" type="submit">신고 접수</button></div></form>`);
}
function openPw(forced) {
  open(`<form class="sheet" id="pwform" aria-label="비밀번호 변경">
    <h2 style="margin:0;font-size:18px">${forced ? '처음 로그인했습니다. 비밀번호를 바꿔 주세요' : '비밀번호 변경'}</h2>
    <label class="label">지금 비밀번호<input type="password" id="pw0" autocomplete="current-password" required></label>
    <label class="label">새 비밀번호 (영문·숫자 섞어 8자 이상)<input type="password" id="pw1" autocomplete="new-password" required></label>
    <label class="label">새 비밀번호 확인<input type="password" id="pw2" autocomplete="new-password" required></label>
    <div class="acts">${forced ? '' : '<button type="button" data-act="close">닫기</button>'}<button class="go" type="submit">바꾸기</button></div></form>`);
  if (forced) sheet.querySelector('.scrim').removeAttribute('data-act');
}

function getPos() {
  return new Promise(res => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 4000, maximumAge: 60000 });
  });
}

document.addEventListener('click', async e => {
  const hb = e.target.closest('[data-h]');
  if (hb) { document.querySelectorAll('[data-h]').forEach(b => b.setAttribute('aria-pressed', b === hb)); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = +b.dataset.id, a = b.dataset.act;
  try {
    if (a === 'close') closeSheet();
    else if (a === 'mypw') openPw(false);
    else if (a === 'start') { b.disabled = true; const pos = await getPos(); await api('visit_start', {}, { schedule_id: id, ...pos }); toast('방문을 시작했습니다'); await load(); }
    else if (a === 'end') openEnd(findRec(id));
    else if (a === 'cancel') openCancel(findRec(id));
    else if (a === 'req') openReq(findRec(id));
    else if (a === 'emg') openEmg(findRec(id));
    else if (a === 'save-end') {
      const h = document.querySelector('[data-h][aria-pressed="true"]');
      if (!h) { toast('건강상태를 골라 주세요'); return; }
      const flags = [...document.querySelectorAll('input[name="flag"]:checked')].map(x => x.value);
      b.disabled = true;
      await api('visit_end', {}, { schedule_id: id, health: +h.dataset.h, flags, note: document.getElementById('note').value });
      closeSheet(); toast('방문 기록을 저장했습니다'); await load();
    }
    else if (a === 'save-cancel') {
      const r = document.querySelector('input[name="creason"]:checked');
      b.disabled = true;
      await api('visit_cancel', {}, { schedule_id: id, reason: r ? r.value : '기타' });
      closeSheet(); toast('취소를 기록했습니다'); await load();
    }
  } catch (err) { toast(err.message); b.disabled = false; }
});
document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  const v = id => document.getElementById(id).value.trim();
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (f.id === 'rform') {
      await api('report', {}, { name: v('rn'), age: v('ra'), emd: v('re'), needs: [...document.querySelectorAll('input[name="rneed"]:checked')].map(x => x.value), reason: v('rw') });
      closeSheet(); toast('발굴신고를 접수했습니다');
    } else if (f.id === 'reqform') {
      await api('change_request', {}, { schedule_id: +f.dataset.id, date: v('rq-d'), time: v('rq-t'), reason: v('rq-w') });
      closeSheet(); toast('변경 요청을 올렸습니다'); await load();
    } else if (f.id === 'emgform') {
      const k = f.querySelector('input[name="ekind"]:checked');
      await api('emergency', {}, { schedule_id: +f.dataset.id, kind: k ? k.value : '기타', note: v('em-note') });
      closeSheet(); toast('긴급 상황을 알렸습니다. 담당자가 곧 연락합니다');
    } else if (f.id === 'pwform') {
      if (v('pw1') !== v('pw2')) throw new Error('새 비밀번호 두 칸이 서로 다릅니다.');
      await api('my_password', {}, { current: document.getElementById('pw0').value, new: document.getElementById('pw1').value });
      closeSheet(); toast('비밀번호를 바꿨습니다');
    }
  } catch (err) { toast(err.message); }
  finally { if (btn) btn.disabled = false; }
});
document.getElementById('repbtn').addEventListener('click', openReport);
(async () => { await load(); if (DATA && DATA.user && DATA.user.must_change) openPw(true); })();
setInterval(() => { if (!document.hidden && !sheet.innerHTML) load(); }, 60000);

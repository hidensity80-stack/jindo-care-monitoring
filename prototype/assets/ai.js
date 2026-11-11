/* 진도군 통합돌봄 모니터링 — AI 기능 (시제품)
 * - AI 설정: 연결(모델·주소·키) 추가·교체, 연결 시험, 기능별 모델 지정, 개인정보 등급, 사용 한도, AI 당직 권한
 * - AI 당직: 담당자 부재 시 긴급·지연·건강 이상·퇴원 신청·변경 요청·계획 제출을 감시하고 정리·연락, 복귀 시 보고
 * - AI 도우미: 화면 설명, 먼저 할 일, 어르신 찾기, 처리 방법 안내, 문자·메모·보고서 초안, 승인 전 실수 막기
 * 시제품에서는 외부 AI를 실제로 부르지 않고, 브라우저 안의 '예시 답변 엔진'이 시스템 기록으로 답을 만듭니다.
 * 이 파일은 app.js보다 먼저 읽힙니다. 함수 안에서만 app.js의 값(STATE, VS, R, W, SV …)을 사용합니다.
 */
const AI_FEAT = [
  { k: 'duty', name: 'AI 당직 (부재 대응)', pi: true, desc: '긴급·지연·건강 이상·퇴원 신청을 감시하고 정리·연락' },
  { k: 'chat', name: 'AI 도우미 질문·답변', pi: true, desc: '현황 질문, 먼저 할 일, 어르신 찾기' },
  { k: 'draft', name: '기록·문서 초안', pi: true, desc: '조치 메모, 보호자 안내 문자, 업무 보고서' },
  { k: 'manual', name: '화면·업무 안내', pi: false, desc: '화면 설명, 처리 방법 (개인정보 보내지 않음)' },
];
const AI_TYPES = {
  demo: { label: '시연용 예시 (브라우저 내장)', url: '(브라우저 안에서 동작)' },
  openai: { label: 'OpenAI 호환 (정부·내부 설치형 포함)', url: 'https://(AI 플랫폼 주소)/v1' },
  anthropic: { label: 'Anthropic (Claude)', url: 'https://api.anthropic.com' },
  google: { label: 'Google (Gemini)', url: 'https://generativelanguage.googleapis.com' },
};
const AI_LV = [null,
  { n: '1단계 · 알려 주기', d: '상황을 요약해 담당자에게 알리기만 합니다. 아무것도 보내지 않습니다. 운영 초기 권장.' },
  { n: '2단계 · 초안 쓰기', d: '확인 메시지·안내 문자·메모 초안까지 만듭니다. 보내기는 담당자가 합니다.' },
  { n: '3단계 · 정해진 일 실행', d: '아래에서 허용한 일만 AI가 직접 실행합니다.' }];
const AI_ALLOW = [['msgWorker', '방문 지연 시 현장 수행자에게 확인 메시지 보내기'], ['dcAck', '퇴원 신청인에게 접수 확인 문자 보내기'], ['notifyBad', "건강 '나쁨' 기록 시 수행기관에 다음 방문 확인 요청"]];
const AI_NEVER = ['계획 승인·반려', '일정 변경 요청 승인', '계정 만들기·정지·비밀번호', '긴급 상황 종결', '서비스 중단·취소', '119 신고 (현장에서 직접)'];
const AI_PROMPTS = {
  duty: '너는 진도군 통합돌봄 모니터링의 부재 중 당직 보조자다. 상황을 3줄 이내로 요약하고, 근거가 된 기록을 함께 적는다. 허용된 조치만 실행하고, 판단이 필요한 일은 반드시 담당자에게 넘긴다.',
  chat: '너는 통합돌봄 담당자를 돕는 도우미다. 시스템 기록에 있는 내용만 답하고, 추측은 하지 않는다. 결정은 담당자가 한다는 점을 지킨다.',
  draft: '어르신과 보호자가 이해하기 쉬운 존댓말로 짧게 쓴다. 확인되지 않은 사실은 [ ]로 비워 둔다. 끝에 담당 부서 연락처를 넣는다.',
  manual: '진도군 통합돌봄 업무 매뉴얼과 화면 안내 기준으로, 순서대로 번호를 붙여 설명한다.',
};
function aiDefault() {
  return {
    enabled: true, mask: true, guard: true, autoDuty: false, level: 3, limit: 500, used: 0, usedDay: '',
    allow: { msgWorker: true, dcAck: true, notifyBad: true },
    conns: [
      { id: 'demo', name: '시연용 예시 AI', type: 'demo', url: AI_TYPES.demo.url, model: '예시 답변 엔진', keyHint: '', pi: true, test: { st: 'ok', msg: '정상 응답', at: '' } },
      { id: 'c2', name: '정부 AI 플랫폼 (예시)', type: 'openai', url: 'https://(기관 AI 플랫폼 주소)/v1', model: '(모델 이름)', keyHint: '', pi: true, test: null },
      { id: 'c3', name: '외부 상용 AI (예시)', type: 'anthropic', url: AI_TYPES.anthropic.url, model: 'claude-sonnet-5-5', keyHint: '', pi: false, test: null },
    ],
    map: { duty: ['demo', ''], chat: ['demo', ''], draft: ['demo', ''], manual: ['demo', 'c3'] },
    prompts: { ...AI_PROMPTS },
    contacts: [{ name: '김○○ 팀장', phone: '010-0000-0001' }, { name: '박○○ 주무관 (당직)', phone: '010-0000-0002' }],
    duty: null, nextId: 1,
  };
}
function aiInit() {
  const d = aiDefault();
  if (!STATE.ai) STATE.ai = d;
  for (const k in d) if (STATE.ai[k] === undefined) STATE.ai[k] = d[k];
  for (const f of AI_FEAT) if (!STATE.ai.map[f.k]) STATE.ai.map[f.k] = ['demo', ''];
  if (!window.__aiTimer) window.__aiTimer = setInterval(aiTick, 3000);
}
const AI = () => STATE.ai;
const aiConnOf = id => AI().conns.find(c => c.id === id);
function aiDayReset() { const k = dkey(TODAYN); if (AI().usedDay !== k) { AI().usedDay = k; AI().used = 0; } }
const aiOver = () => { aiDayReset(); return AI().used >= AI().limit; };
const aiOn = () => !!(STATE.ai && STATE.ai.enabled && !aiOver());
function aiEngine(feat) {
  const [p, f] = AI().map[feat] || ['demo', ''], c = aiConnOf(p) || aiConnOf('demo'), fb = aiConnOf(f);
  const real = c.type !== 'demo';
  return { c, fb, label: `${c.name} · ${c.model}${real ? ' (시제품: 예시 답변으로 대신함)' : ''}` };
}
function aiCount() { aiDayReset(); AI().used++; if (AI().used === AI().limit) toast('AI 하루 사용 한도에 도달했습니다. 규칙 기반 감시는 계속됩니다'); }
function aiAudit(action, target, detail) { STATE.audit.unshift({ at: nowStr(), login: 'AI 당직', action, target, detail }); if (STATE.audit.length > 500) STATE.audit.length = 500; }
const aiStaff = () => { const m = ME(); return !!m && m.role !== 'worker' && !onApply(); };
const aiCanDuty = () => ['central', 'admin'].includes(ROLE());
const aiMaskName = r => AI().mask ? `어르신 ${r.code.slice(-3)}` : r.name;
const aiLink = r => `<a href="#" data-act="open" data-rid="${r.id}">${esc(r.name)}</a>`;
function aiHandoffOpen() { const d = AI().duty; return d ? d.items.filter(i => i.status === 'handoff' && !i.ack).length : 0; }

/* ---------- AI 당직 ---------- */
function aiDutyStart(by, until) {
  AI().duty = { on: true, start: nowStr(), startMin: SIM.now, until: until || '18:00', by, items: [], seen: {}, end: null };
  aiAudit('ai_duty_on', by === 'auto' ? '근무시간 외 자동' : by, `${AI_LV[AI().level].n} · 비상 연락 ${AI().contacts.map(c => c.name).join(' → ')}`);
  const n = aiScan(); save();
  toast(`AI 당직을 켰습니다. 지금 처리 중인 상황 ${n}건을 정리했습니다`);
}
function aiDutyStop() {
  const d = AI().duty; if (!d || !d.on) return;
  d.on = false; d.end = nowStr(); d.endMin = SIM.now;
  aiAudit('ai_duty_off', STATE.session || '-', `처리 ${d.items.length}건 · 확인 필요 ${aiHandoffOpen()}건`); save();
}
function aiDcNeeds(x) {
  const w = x.why || '', out = [];
  [[/식사|도시락|밥|끼니/, '식사(도시락)'], [/집안일|청소|빨래|가사/, '가사'], [/목욕|씻/, '목욕'], [/거동|휠체어|외래|병원 동행|이동|통원/, '이동'], [/혼자|독거|넘어|낙상|응급/, '스마트돌봄'], [/수술|상처|투약|간호|욕창|재활|진료/, '방문의료']].forEach(([re, s]) => { if (re.test(w) && !out.includes(s)) out.push(s); });
  return out.length ? out : ['상담 후 결정'];
}
function aiEmgText(m) {
  const r = R[m.rid], o = risk().get(r.id), last = [];
  for (let d = TODAYN; d >= TODAYN - 13 && last.length < 2; d--) for (const x of daySched(d)) if (x.r.id === r.id) { const i = info(x); if (i.s === 'done' && i.h === 2) last.push(`${sdate(d)} ${SV[x.s].short} '나쁨'${i.flags.length ? `(${i.flags.join(', ')})` : ''}`); }
  return `${m.at} ${SV[m.s].short} 방문 중 '${m.kind}' 신고. ${m.note || ''} ${r.age}세 ${HOUSE[r.house]}, ${EMD[r.e]}. 위험 점수 ${o.score}점${last.length ? ` · 최근 ${last.join(', ')}` : ''}.`;
}
/** 당직 감시: 새 상황을 찾아 정리하고, 허용된 일만 실행한 뒤 나머지는 담당자에게 넘김 */
function aiScan() {
  const d = AI().duty; if (!d || !d.on || !aiOn()) return 0;
  const L = AI().level, A = AI().allow, c0 = AI().contacts[0] || { name: '비상 연락처' };
  let n = 0;
  const add = it => {
    if (d.seen[it.key] || aiOver()) return; d.seen[it.key] = 1;
    d.items.unshift({ id: AI().nextId++, at: hm(SIM.now), min: SIM.now, ack: false, ...it }); if (d.items.length > 200) d.items.length = 200;
    aiCount(); n++; aiAudit(it.status === 'handoff' ? 'ai_handoff' : 'ai_action', it.target, `${it.title} · ${it.act}`);
  };
  // 1) 긴급: 비상 연락은 AI 단계와 관계없이 규칙으로 발송, AI는 상황 요약을 붙임
  for (const m of STATE.emgs) if (m.st !== '조치완료') {
    const r = R[m.rid];
    add({ key: 'e' + m.id, kind: 'emg', ref: { id: m.id, rid: r.id }, target: r.code, title: `긴급 · ${r.name} (${EMD[r.e]})`, text: aiEmgText(m), act: `${AI().contacts.map(c => c.name).join(' → ')} 순서로 문자·전화 알림 (규칙 알림 + AI 상황 요약 첨부). 긴급 종결은 담당자가 합니다.`, status: 'handoff', urgent: true });
  }
  // 2) 방문 지연
  for (const x of daySched(TODAYN)) if (st(x) === 'late') {
    const r = x.r, late = SIM.now - x.t;
    const base = { key: 'l' + x.k, kind: 'late', ref: { k: x.k, rid: r.id }, target: r.code, title: `방문 지연 · ${r.name} ${SV[x.s].short}`, text: `${hm(x.t)} 예정 방문이 ${late}분 지나도 시작 기록이 없습니다. 담당 ${x.w.name} ${SV[x.s].role}, ${HOUSE[r.house]} 가구.` };
    if (L >= 3 && A.msgWorker) add({ ...base, act: `${x.w.name}님에게 확인 메시지 보냄: "${hm(x.t)} ${aiMaskName(r)} 방문 시작 기록이 없습니다. 상황을 알려 주세요."`, status: 'wait' });
    else add({ ...base, act: L >= 2 ? `확인 메시지 초안 준비: "${hm(x.t)} 방문 시작 기록이 없습니다. 상황을 알려 주세요." (보내기는 담당자)` : '담당자에게 알림만 함', status: 'handoff' });
  }
  // 3) 건강 '나쁨' (당직 시작 90분 전부터)
  const rk = risk();
  for (const x of daySched(TODAYN)) { const i = info(x); if (i.s !== 'done' || i.h !== 2 || (i.end ?? 0) < d.startMin - 90) continue;
    const r = x.r, o = rk.get(r.id), hi = o.level >= 2;
    add({ key: 'b' + x.k, kind: 'bad', ref: { k: x.k, rid: r.id }, target: r.code, title: `건강 '나쁨' · ${r.name} ${SV[x.s].short}`, text: `${hm(i.end)} ${x.w.name}님 기록: ${i.flags.join(', ') || '상태 나쁨'}${i.note ? ` — "${i.note}"` : ''}. 위험 점수 ${o.score}점(${LV[o.level] || '정상'}). ${o.reasons.slice(0, 2).join(' · ')}`,
      act: L >= 3 && A.notifyBad ? `${SV[x.s].vendor}에 다음 방문 때 상태 확인 요청 보냄${hi ? ' · 위험 등급이라 담당자 확인 필요' : ''}` : L >= 2 ? '수행기관 확인 요청 초안 준비' : '담당자에게 알림만 함', status: hi || L < 3 || !A.notifyBad ? 'handoff' : 'ok' }); }
  // 4) 퇴원환자 지원 신청 (접수 단계)
  for (const x of STATE.reports) if (x.st === '접수') {
    const soon = x.ddn != null && x.ddn - TODAYN <= 3, nd = aiDcNeeds(x);
    add({ key: 'd' + x.id, kind: 'dc', ref: { id: x.id }, target: x.name, title: `퇴원지원 신청 · ${x.name} (${x.emd})`, text: `${x.hosp || ''} · ${ddLabel(x.ddn)}. 신청한 서비스: ${x.needs.join(', ')}. 사연으로 본 필요 서비스(AI 분류): ${nd.join(', ')}.${soon ? ' 퇴원이 3일 안이라 빠른 상담이 필요합니다.' : ''}`,
      act: L >= 3 && A.dcAck && x.phone ? `${x.phone}로 접수 확인 문자 보냄: "접수번호 ${x.no}, 담당자가 곧 연락드립니다."` : L >= 2 ? '접수 확인 문자 초안 준비 (보내기는 담당자)' : '담당자에게 알림만 함', status: 'handoff', urgent: soon });
  }
  // 5) 일정 변경 요청, 6) 계획 제출 — 결정은 담당자
  for (const c of STATE.crs) if (c.st === '대기') {
    const r = R[c.rid], x = findSched(c.k, c.odn), dup = x ? (c.nd !== x.dn && hasSched(c.nd, r.id, c.s, c.k)) : false;
    const busy = x ? daySched(c.nd).some(y => y.w.id === x.w.id && y.k !== c.k && c.nt < y.t + y.d && y.t < c.nt + x.d) : false;
    add({ key: 'c' + c.id, kind: 'cr', ref: { tab: 'approve' }, target: r.code, title: `일정 변경 요청 · ${r.name} ${SV[c.s].short}`, text: `${sdate(c.odn)} ${hm(c.ot)} → ${sdate(c.nd)} ${hm(c.nt)}. 이유: ${c.reason} AI 점검: 옮길 날 같은 어르신 일정 ${dup ? '있음' : '없음'}, 담당자 그 시간 다른 일정 ${busy ? '있음' : '없음'}.`, act: '승인은 담당자 복귀 후 (AI는 점검 결과만 정리)', status: 'handoff' });
  }
  for (const [key, p] of Object.entries(STATE.plans)) if (p.st === '제출') {
    const [s, ym] = [+key.split('_')[0], key.split('_')[1]], ck = planCheck(s, ym);
    add({ key: 'p' + key + p.at, kind: 'plan', ref: { tab: 'approve' }, target: `${ym} ${SV[s].short}`, title: `계획 제출 · ${SV[s].short} ${ymLabel(ym)}`, text: `총 ${fmt(ck.total)}건. 횟수 미달 ${ck.shortfall.length}명, 시간 겹침 ${ck.overlaps.length}건, 일요일 ${ck.sundays}건. ${ck.shortfall.length + ck.overlaps.length + ck.sundays ? '승인 전에 확인할 항목이 있습니다.' : '자동 점검에서 문제가 없습니다.'}`, act: '승인·반려는 담당자 복귀 후 (AI는 검토 의견만 작성)', status: 'handoff' });
  }
  // 응답 기다리는 지연 건 처리
  for (const it of d.items) if (it.status === 'wait' && it.kind === 'late') {
    const x = findSched(it.ref.k, TODAYN), s = x ? st(x) : 'done';
    if (s === 'prog' || s === 'done') { it.status = 'ok'; it.act += ' → 방문 시작 기록 확인, 해결'; n++; continue; }
    if (SIM.now - it.min < 10) continue;
    if (hash(it.ref.rid, it.min, 3, 7) < 0.6) { it.status = 'ok'; it.act += ` → 수행자 답장: "앞 방문이 길어졌습니다. 15분 안에 도착합니다." (${hm(SIM.now)})`; }
    else { it.status = 'handoff'; it.act += ` → 10분 동안 응답 없음, ${c0.name}에게 알림 (${hm(SIM.now)})`; aiAudit('ai_handoff', it.target, '지연 확인 응답 없음'); }
    n++;
  }
  return n;
}
function aiTick() {
  if (!STATE || !STATE.ai) return;
  const A0 = AI();
  if (A0.enabled && A0.autoDuty && SIM.now >= 18 * 60 && !(A0.duty && A0.duty.on) && !(A0.duty && A0.duty.auto === dkey(TODAYN))) { aiDutyStart('auto', '09:00'); A0.duty.auto = dkey(TODAYN); drawBanner(); }
  if (!A0.duty || !A0.duty.on) return;
  const n = aiScan(); if (!n) return;
  save();
  if (aiStaff()) { toast(`AI 당직: 상황 ${n}건을 정리했습니다`); drawBanner(); if (document.querySelector('.modal .aireport')) aiReport(false); }
}
function aiBannerHtml() {
  const d = AI().duty; if (!d || !d.on || !aiStaff() || ROLE() === 'org') return '';
  const h = aiHandoffOpen(), c = AI().contacts[0];
  return `<div class="aiduty" role="status"><b>AI 당직 중</b><span>${esc(d.start.slice(11))}부터${d.by === 'auto' ? ' (근무시간 외 자동)' : ''} · ${AI_LV[AI().level].n} · 비상 연락 ${esc(c ? c.name : '-')} · 정리 ${d.items.length}건, <b>확인 필요 ${h}건</b><small>긴급·위험 판정·지연 표시는 규칙대로 계속 작동합니다. 승인·종결 같은 결정은 담당자가 합니다.</small></span>
    <span class="emg-a"><button class="btn sm" data-act="ai-report">당직 기록 보기</button>${aiCanDuty() ? '<button class="btn sm pri" data-act="ai-duty-off">당직 끄고 복귀</button>' : ''}</span></div>`;
}
function aiHeadBtn() {
  if (!aiCanDuty() || !STATE.ai) return '';
  const on = AI().duty && AI().duty.on;
  return `<button class="btn sm aibtn${on ? ' on' : ''}" data-act="ai-duty" title="담당자 부재 시 AI가 대신 감시">${on ? 'AI 당직 중' : 'AI 당직 켜기'}</button>`;
}
function aiDutyModal() {
  if (!AI().enabled) { modal(`<h2>AI 사용이 꺼져 있습니다</h2><p>시스템 관리자가 [AI 설정]에서 AI 사용을 켜야 AI 당직을 쓸 수 있습니다. AI가 꺼져 있어도 긴급 알림·위험 판정·지연 표시는 규칙대로 계속 작동합니다.</p><div class="mact"><button class="btn pri" data-act="mclose">확인</button></div>`); return; }
  const L = AI().level, A = AI().allow;
  modal(`<h2>AI 당직 켜기</h2><p>자리를 비우는 동안 AI가 대시보드를 감시하고, 정해진 범위 안에서 정리·연락합니다. 돌아와 로그인하면 부재 중 보고를 먼저 보여 줍니다.</p>
    <form class="form" id="aidutyform">
      <label>복귀 예정 시각<input type="time" id="ad-until" value="${hm(Math.min(SIM.now + 120, 18 * 60))}" step="600"></label>
      <label>사용 모델<input value="${esc(aiEngine('duty').c.name)}" disabled></label>
      ${AI().contacts.map((c, i) => `<label>비상 연락 ${i + 1}순위<input id="ad-c${i}" value="${esc(c.name)}"></label><label>전화번호<input id="ad-p${i}" value="${esc(c.phone)}" inputmode="tel"></label>`).join('')}
      <div class="full aibox2"><b>${AI_LV[L].n}</b> ${esc(AI_LV[L].d)}${L >= 3 ? `<ul>${AI_ALLOW.filter(([k]) => A[k]).map(([, t]) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}<small>AI가 하지 않는 일: ${AI_NEVER.join(', ')}</small></div>
      <div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">AI 당직 시작</button></div></form>`);
}
const AI_KIND = { emg: '긴급', late: '지연', bad: '건강', dc: '퇴원지원', cr: '변경 요청', plan: '계획' };
function aiReport(onLogin) {
  const d = AI().duty;
  if (!d) { modal('<h2>AI 당직 기록이 없습니다</h2><p>위쪽 [AI 당직 켜기]로 시작할 수 있습니다.</p><div class="mact"><button class="btn pri" data-act="mclose">확인</button></div>'); return; }
  const PRI = { emg: 0, late: 2, bad: 3, dc: 4, cr: 5, plan: 6 }, pri = i => i.ack * 10 + (i.kind === 'emg' ? 0 : i.urgent ? 1 : PRI[i.kind]);
  const hand = d.items.filter(i => i.status === 'handoff').sort((a, b) => pri(a) - pri(b) || b.min - a.min), done = d.items.filter(i => i.status !== 'handoff'), open = hand.filter(i => !i.ack);
  const cnt = k => d.items.filter(i => i.kind === k).length, endMin = d.on ? SIM.now : (d.endMin ?? SIM.now), mins = Math.max(0, endMin - d.startMin);
  const late = d.items.filter(i => i.kind === 'late'), lateOk = late.filter(i => i.status === 'ok').length;
  const sum = `${d.on ? '지금까지' : '부재'} ${mins}분 동안 긴급 ${cnt('emg')}건, 방문 지연 ${late.length}건(${lateOk}건 해결), 건강 '나쁨' ${cnt('bad')}건, 퇴원지원 신청 ${cnt('dc')}건, 변경 요청 ${cnt('cr')}건, 계획 제출 ${cnt('plan')}건을 정리했습니다. 담당자가 확인할 일은 <b>${open.length}건</b>입니다.`;
  const go = i => i.kind === 'emg' ? `<button class="btn sm pri" data-act="ai-go" data-id="${i.id}">조치 입력</button>` : i.kind === 'dc' ? `<button class="btn sm pri" data-act="ai-go" data-id="${i.id}">처리하기</button>` : i.ref.tab ? `<button class="btn sm" data-act="ai-go" data-id="${i.id}">승인 화면</button>` : `<button class="btn sm" data-act="ai-go" data-id="${i.id}">어르신 보기</button>`;
  const item = (i, h) => `<li class="aiitem${h ? ' hand' : ''}${i.ack ? ' ack' : ''}${i.urgent ? ' urg' : ''}"><div class="aih"><span class="pill" style="--c:${i.kind === 'emg' ? 'var(--st-miss)' : h ? 'var(--st-late)' : 'var(--st-done)'}">${AI_KIND[i.kind]}</span><b>${esc(i.title)}</b><span class="num aitm">${esc(i.at)}</span></div><span>${esc(i.text)}</span><small><b>AI가 한 일</b> ${esc(i.act)}</small>${h ? `<div class="aiact">${i.ack ? '<em class="tag">확인함</em>' : `${go(i)}<button class="btn sm" data-act="ai-ack" data-id="${i.id}">확인함</button>`}</div>` : ''}</li>`;
  modal(`<div class="aireport"><h2>${onLogin ? '부재 중 AI 당직 보고' : 'AI 당직 기록'} <small>${esc(d.start.slice(11))} ~ ${d.on ? '지금' : esc((d.end || '').slice(11))} · ${esc(aiEngine('duty').label)}</small></h2>
    <p class="aisum">${sum}</p>
    <h3>담당자가 확인할 일 <small>${open.length}건 남음</small></h3><ul class="ailist">${hand.map(i => item(i, true)).join('') || '<li class="empty-note">없습니다.</li>'}</ul>
    <h3>AI가 처리한 일 <small>${done.length}건</small></h3><ul class="ailist">${done.map(i => item(i, false)).join('') || '<li class="empty-note">없습니다.</li>'}</ul>
    <p class="empty-note">AI 요약은 참고용입니다. 각 항목의 원래 기록(어르신 상세, 긴급·퇴원지원 화면)을 함께 확인하세요. AI가 한 일은 모두 접속기록에 'AI 당직'으로 남습니다.</p>
    <div class="mact">${d.on && aiCanDuty() ? `<button class="btn" data-act="mclose">당직 계속</button><button class="btn pri" data-act="ai-duty-off">당직 끄고 업무 시작</button>` : '<button class="btn pri" data-act="mclose">닫기</button>'}</div></div>`);
  const md = document.querySelector('.modal'); if (md) md.classList.add('wide');
}
function aiOnLogin(u) { if (['central', 'admin'].includes(u.role) && STATE.ai && AI().duty && AI().duty.on) aiReport(true); }

/* ---------- AI 도우미 (대화창) ---------- */
function aiChrome() {
  let box = document.getElementById('aibox');
  if (!box) { box = document.createElement('div'); box.id = 'aibox'; document.body.appendChild(box); }
  if (!STATE.ai || !aiStaff() || !AI().enabled) { box.innerHTML = ''; return; }
  if (!VS.aichat) VS.aichat = [];
  if (!VS.aiopen) { box.innerHTML = `<button class="aifab" data-act="ai-chat" aria-label="AI 도우미 열기"><span class="aidot"></span>AI 도우미</button>`; return; }
  const role = ROLE(), tabName = ((TABS[role] || []).find(t => t[0] === VS.tab) || [, ''])[1];
  const chips = role === 'org' ? ['이 화면에서 뭘 봐야 해?', '지금 먼저 처리할 일', '오늘 지연 현황', '우리 기관 계획 점검', '위험 어르신 보여줘', '보호자 안내 문자 초안']
    : ['이 화면에서 뭘 봐야 해?', '지금 먼저 처리할 일', '오늘 지연 현황', '의신면 독거 위험 어르신', '긴급 상황 처리 방법', '계획 승인할 때 확인할 점', '보호자 안내 문자 초안', '오늘 업무 보고서 초안', ...(role === 'admin' ? ['AI 설정 방법'] : [])];
  const msgs = VS.aichat.length ? VS.aichat.map(m => `<div class="aim ${m.me ? 'me' : 'ai'}">${m.html}${m.meta ? `<small class="aimeta">${m.meta}</small>` : ''}</div>`).join('')
    : `<div class="aim ai"><p>안녕하세요. 통합돌봄 업무를 돕는 AI 도우미입니다. 지금 <b>${esc(tabName)}</b> 화면을 보고 계십니다.</p><p>아래 버튼을 누르거나 궁금한 것을 적어 주세요. 답변은 시스템 기록으로 만든 참고 자료이고, 결정은 담당자가 합니다.</p></div>`;
  box.innerHTML = `<aside class="aipanel" role="dialog" aria-label="AI 도우미"><header><b>AI 도우미</b><small>${esc(aiEngine('chat').label)}</small><button class="btn sm" data-act="ai-clear" title="대화 지우기">지우기</button><button class="btn sm" data-act="ai-chat-close" aria-label="닫기">닫기</button></header>
    <div class="aimsgs" id="aimsgs">${msgs}</div>
    <div class="aichips">${chips.map(c => `<button data-act="ai-q" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <form class="aiin" id="aiform"><input id="aiq" placeholder="예: 진도읍 위험 어르신, 오늘 지연 현황" autocomplete="off" aria-label="질문"><button class="btn pri" type="submit">보내기</button></form>
    ${AI().mask ? '<p class="aipriv">AI에는 이름·연락처를 가린 정보만 보냅니다. 시제품은 외부로 아무것도 보내지 않습니다.</p>' : ''}</aside>`;
  const ms = document.getElementById('aimsgs'); if (ms) ms.scrollTop = ms.scrollHeight;
}
function aiAsk(q) {
  q = (q || '').trim(); if (!q) return;
  VS.aichat.push({ me: true, html: esc(q) });
  if (!aiOn()) VS.aichat.push({ html: `<p>${AI().enabled ? 'AI 하루 사용 한도에 도달해 답할 수 없습니다.' : 'AI 사용이 꺼져 있습니다.'} 위험 판정·긴급 알림·지연 표시는 규칙대로 계속 작동합니다.</p>` });
  else {
    const a = aiAnswer(q), eng = aiEngine(a.feat || 'chat');
    aiCount(); audit('ai_chat', a.feat || 'chat', q.slice(0, 80)); save();
    VS.aichat.push({ html: a.html, meta: `${esc(eng.label)}${a.basis ? ` · 근거: ${esc(a.basis)}` : ''}` });
  }
  if (VS.aichat.length > 40) VS.aichat.splice(0, VS.aichat.length - 40);
  aiChrome();
}
function aiAnswer(q) {
  const t = q.replace(/\s+/g, ' ');
  if (/보고서|업무 보고|일일 보고/.test(t)) return aiDailyReport();
  if (/문자|안내문/.test(t)) return aiSmsDraft();
  if (/설정|모델|api|키|연결/i.test(t)) return aiSettingsHelp();
  if (/긴급/.test(t)) return aiEmgGuide();
  if (/퇴원/.test(t)) return aiDcGuide();
  if (/승인|계획|점검/.test(t)) return aiPlanGuide();
  if (/먼저|우선|할 일|급한|처리할/.test(t)) return aiPriorities();
  if (/화면|뭘 봐|무엇을 봐|뭘 해야|설명/.test(t)) return aiScreen();
  if (/지연|늦|미시작|미수행/.test(t)) return aiLate();
  if (/나쁨|건강/.test(t)) return aiBad();
  const s = aiSearch(t); if (s) return s;
  return { feat: 'manual', html: `<p>이런 것을 도와드릴 수 있습니다.</p><ul><li>"이 화면에서 뭘 봐야 해?" — 지금 화면 설명</li><li>"지금 먼저 처리할 일" — 우선순위</li><li>"고군면 독거 주의 어르신", "목욕 위험 어르신" — 어르신 찾기</li><li>"오늘 지연 현황", "오늘 건강 나쁨" — 현황</li><li>"긴급 상황 처리 방법", "퇴원지원 처리 방법" — 업무 안내</li><li>"보호자 안내 문자 초안", "오늘 업무 보고서 초안" — 문서 초안</li></ul>` };
}
function aiScreen() {
  const tab = VS.tab, role = ROLE(), a = dayAgg(TODAYN), sum = k => VSV().reduce((s, S) => s + a[S.i][k], 0), rk = [...risk().values()];
  const h = (HELP[tab] || {})[role] || (HELP[tab] || {}).central || '';
  const by = {
    day: `<p>오늘 계획 ${fmt(sum('plan'))}건 중 완료 ${fmt(sum('done'))}건, 진행중 ${sum('prog')}건입니다. 먼저 <b>지연 ${sum('late')}건</b>과 <b>건강 '나쁨' ${sum('bad')}건</b>을 보세요. 오른쪽 "주의 필요"에 모여 있습니다.</p>`,
    month: `<p>달력의 숫자는 날짜별 계획·완료 건수입니다. 빨간 숫자가 있는 날은 미수행이 있었던 날이니 눌러서 확인하세요.</p>`,
    year: `<p>이행률이 낮은 서비스와 월을 찾는 화면입니다. 표에서 색이 옅은 칸(이행률 낮음)을 누르면 그 달로 이동합니다.</p>`,
    care: `<p>지금 위험 <b>${rk.filter(o => o.level === 3).length}명</b>, 주의 ${rk.filter(o => o.level === 2).length}명입니다. 위험 등급부터 전화·방문 조치를 하고, 처리 상태와 메모를 꼭 남기세요.</p>`,
    discharge: `<p>처리 중인 신청 ${STATE.reports.filter(x => x.st !== '종결').length}건, 그중 3일 안 퇴원 <b>${dcSoon()}명</b>입니다. 퇴원일이 가까운 순서로 연락하세요.</p>`,
    approve: `<p>승인 대기 계획 ${Object.values(STATE.plans).filter(p => p.st === '제출').length}건, 변경 요청 ${STATE.crs.filter(c => c.st === '대기').length}건입니다. 계획마다 자동 점검 결과(횟수 미달·시간 겹침)를 먼저 보세요.</p>`,
    plan: role === 'org' ? (() => { const ck = planCheck(ORG(), VS.pym); return `<p>${ymLabel(VS.pym)} 계획은 <b>${planOf(ORG(), VS.pym).st}</b> 상태입니다. 점검 결과 횟수 미달 ${ck.shortfall.length}명, 시간 겹침 ${ck.overlaps.length}건입니다.</p>`; })() : '',
    accounts: '<p>계정 목록에서 사용하지 않는 계정은 "사용 정지"로 바꾸세요. 비밀번호 초기화 후 나오는 처음 비밀번호는 한 번만 보입니다.</p>',
    audit: '<p>누가 언제 무엇을 보고 바꿨는지 확인하는 화면입니다. "AI 당직"으로 남은 기록은 AI가 한 일입니다.</p>',
    aiset: '<p>AI 연결과 기능별 모델, 당직 권한을 정하는 화면입니다. 실제 키는 서버 버전에서만 저장합니다.</p>',
  };
  return { feat: 'manual', basis: '오늘 현황 집계', html: `${h ? `<p>${esc(h)}</p>` : ''}${by[tab] || ''}` };
}
function aiPriorities() {
  const role = ROLE(), out = [];
  STATE.emgs.filter(m => m.st !== '조치완료' && visS(m.s)).forEach(m => { const r = R[m.rid]; out.push(`<b style="color:var(--st-miss)">긴급</b> ${aiLink(r)} · ${esc(m.kind)} (${esc(m.at)}) ${role !== 'viewer' ? `<button class="btn sm pri" data-act="emg" data-id="${m.id}">조치 입력</button>` : ''}`); });
  if (role !== 'org') STATE.reports.filter(x => x.st !== '종결' && x.ddn != null && x.ddn - TODAYN <= 3).forEach(x => out.push(`<b>퇴원 임박</b> ${esc(x.name)} · ${ddLabel(x.ddn)} · ${esc(x.st)} <button class="btn sm" data-act="dc-open" data-id="${esc(x.id)}">처리하기</button>`));
  const rk = risk(), danger = R.filter(r => rk.get(r.id).level === 3 && (ORG() == null || r.svc[ORG()]) && !(STATE.care[r.id] && STATE.care[r.id].st && STATE.care[r.id].st !== '미확인')).sort((a, b) => rk.get(b.id).score - rk.get(a.id).score);
  if (danger.length) out.push(`<b>위험 등급 미확인</b> ${danger.length}명: ${danger.slice(0, 4).map(aiLink).join(', ')}${danger.length > 4 ? ' 등' : ''} <button class="btn sm" data-act="tab" data-tab="care">집중관리</button>`);
  const late = visDay(TODAYN).filter(x => st(x) === 'late');
  if (late.length) out.push(`<b>방문 지연</b> ${late.length}건: ${late.slice(0, 3).map(x => `${aiLink(x.r)} ${SV[x.s].short} ${hm(x.t)}`).join(', ')}${late.length > 3 ? ' 등' : ''}`);
  if (role === 'central' || role === 'admin') { const p = Object.values(STATE.plans).filter(p => p.st === '제출').length, c = STATE.crs.filter(c => c.st === '대기').length; if (p + c) out.push(`<b>승인 대기</b> 계획 ${p}건, 변경 요청 ${c}건 <button class="btn sm" data-act="tab" data-tab="approve">계획 승인</button>`); }
  if (role === 'org') { const s = planOf(ORG(), NEXT_YM).st; if (s === '작성중' || s === '반려') out.push(`<b>다음 달 계획</b> ${s} 상태 · 마감 ${sdate(deadlineOf(NEXT_YM))} <button class="btn sm" data-act="tab" data-tab="plan">월간 계획</button>`); }
  return { feat: 'chat', basis: '긴급·퇴원지원·위험 판정·오늘 일정', html: out.length ? `<p>지금 먼저 처리할 일 순서입니다.</p><ol class="aiol">${out.map(x => `<li>${x}</li>`).join('')}</ol>` : '<p>지금 급하게 처리할 일은 없습니다. 오늘 지연·건강 이상도 없습니다.</p>' };
}
function aiSearch(t) {
  const emd = EMD.find(e => t.includes(e) || t.includes(e.slice(0, -1) + ' ') || t.startsWith(e.slice(0, -1)));
  const alone = /독거|혼자/.test(t), lv = /위험/.test(t) ? 3 : /주의/.test(t) ? 2 : /관심/.test(t) ? 1 : 0, S = SV.find(s => t.includes(s.short) || t.includes(s.name));
  const age = (t.match(/(\d{2})\s*세\s*이상/) || [])[1];
  if (!emd && !alone && !lv && !S && !age && !/어르신|찾|명단|누구|목록/.test(t)) return null;
  const rk = risk(), o = ORG();
  const list = R.filter(r => (o == null || r.svc[o]) && (!emd || EMD[r.e] === emd) && (!alone || r.alone) && (!lv || rk.get(r.id).level >= lv) && (!S || r.svc[S.i]) && (!age || r.age >= +age)).sort((a, b) => rk.get(b.id).score - rk.get(a.id).score);
  const cond = [emd, alone && '독거', lv && `${LV[lv]} 이상`, S && S.short, age && `${age}세 이상`].filter(Boolean).join(' · ') || '전체';
  return { feat: 'chat', basis: '어르신 기본정보·최근 14일 위험 판정', html: `<p>조건(${esc(cond)})에 맞는 어르신 <b>${list.length}명</b>${list.length > 10 ? ', 위험 점수 높은 10명' : ''}입니다.</p>${list.length ? `<ul class="aiul">${list.slice(0, 10).map(r => { const k = rk.get(r.id); return `<li>${aiLink(r)} ${riskBadge(k.level)} <small>${r.age}세 · ${EMD[r.e]} · ${HOUSE[r.house]} · ${k.score}점${k.reasons[0] ? ` · ${esc(k.reasons[0])}` : ''}</small></li>`; }).join('')}</ul><p class="aimuted">이름을 누르면 상세 기록이 열립니다.</p>` : ''}` };
}
function aiLate() {
  const late = visDay(TODAYN).filter(x => st(x) === 'late').sort((a, b) => a.t - b.t);
  let miss = 0; for (let d = TODAYN - 7; d < TODAYN; d++) miss += visDay(d).filter(x => st(x) === 'miss').length;
  return { feat: 'chat', basis: '오늘 일정·방문 기록', html: `<p>${hm(SIM.now)} 기준 방문 지연 <b>${late.length}건</b>, 최근 7일 미수행 ${miss}건입니다.</p>${late.length ? `<ul class="aiul">${late.slice(0, 10).map(x => `<li>${hm(x.t)} ${aiLink(x.r)} · ${SV[x.s].short} · 담당 ${esc(x.w.name)} <small>${SIM.now - x.t}분 지남 · ${HOUSE[x.r.house]}</small></li>`).join('')}</ul><p class="aimuted">독거 어르신부터 담당 수행자에게 연락해 보세요.</p>` : ''}` };
}
function aiBad() {
  const bad = visDay(TODAYN).map(x => [x, info(x)]).filter(([, i]) => i.s === 'done' && i.h === 2);
  return { feat: 'chat', basis: '오늘 방문 종료 기록', html: `<p>오늘 건강 '나쁨' 기록 <b>${bad.length}건</b>입니다.</p>${bad.length ? `<ul class="aiul">${bad.slice(0, 10).map(([x, i]) => `<li>${aiLink(x.r)} · ${SV[x.s].short} ${hm(i.end)} <small>${esc(i.flags.join(', ') || '상태 나쁨')}${i.note ? ` · ${esc(i.note)}` : ''}</small></li>`).join('')}</ul>` : ''}` };
}
function aiEmgGuide() {
  const open = STATE.emgs.filter(m => m.st !== '조치완료' && visS(m.s));
  return { feat: 'manual', basis: '통합돌봄 긴급 대응 절차', html: `<p>긴급 상황 처리 순서입니다.</p><ol class="aiol"><li>화면 맨 위 빨간 띠에서 어르신과 신고 내용을 확인합니다.</li><li>현장 수행자에게 전화해 119 신고 여부와 현재 상태를 확인합니다. (신고 전이면 바로 119)</li><li>보호자에게 연락하고, 병원 이송 여부를 확인합니다.</li><li>[조치 입력]에서 "확인 중"으로 기록하고, 마무리되면 "조치 완료"로 바꿉니다.</li><li>다음 날 담당 수행기관과 재방문 일정을 확인합니다.</li></ol>${open.length ? `<p>지금 처리 중인 긴급 <b>${open.length}건</b>: ${open.map(m => `${aiLink(R[m.rid])} (${esc(m.kind)}) <button class="btn sm pri" data-act="emg" data-id="${m.id}">조치 입력</button>`).join(' ')}</p>` : '<p>지금 처리 중인 긴급 상황은 없습니다.</p>'}` };
}
function aiDcGuide() {
  const open = STATE.reports.filter(x => x.st !== '종결').sort((a, b) => (a.ddn ?? 1e9) - (b.ddn ?? 1e9));
  return { feat: 'manual', basis: '퇴원환자 지원 절차·신청 목록', html: `<p>퇴원지원 신청 처리 순서입니다.</p><ol class="aiol"><li><b>접수</b>: 신청인에게 전화해 접수 사실을 알립니다.</li><li><b>상담·욕구조사</b>: 퇴원일, 거동, 식사, 가족 돌봄 여부를 확인합니다.</li><li><b>서비스연계</b>: 필요한 수행기관에 연결하고 첫 방문일을 정합니다.</li><li><b>종결</b>: 첫 방문이 이루어지면 마무리합니다.</li></ol>${open.length ? `<p>처리 중 ${open.length}건 (퇴원일 가까운 순):</p><ul class="aiul">${open.slice(0, 5).map(x => `<li>${esc(x.name)} · ${ddLabel(x.ddn)} · ${esc(x.st)} <small>AI 분류: ${aiDcNeeds(x).join(', ')}</small> ${ROLE() !== 'org' ? `<button class="btn sm" data-act="dc-open" data-id="${esc(x.id)}">처리하기</button>` : ''}</li>`).join('')}</ul>` : ''}` };
}
function aiPlanGuide() {
  const role = ROLE(), ym = role === 'org' ? VS.pym : VS.aym;
  const rows = VSV().map(S => { const p = planOf(S.i, ym), ck = planCheck(S.i, ym), n = ck.shortfall.length + ck.overlaps.length + (ck.sundays ? 1 : 0); return { S, p, ck, n }; }).filter(x => role === 'org' || x.p.st === '제출');
  return { feat: 'chat', basis: `${ymLabel(ym)} 계획 자동 점검`, html: `<p>계획을 볼 때 확인할 점입니다.</p><ol class="aiol"><li>어르신별 계약 횟수보다 적게 잡힌 일정(횟수 미달)</li><li>같은 담당자가 같은 시간에 두 곳 방문(시간 겹침)</li><li>일요일 일정 (스마트돌봄 제외)</li><li>지난달보다 크게 줄거나 늘어난 서비스</li></ol>${rows.length ? `<ul class="aiul">${rows.map(({ S, p, ck, n }) => `<li><b>${S.short}</b> ${pill(p.st)} 총 ${fmt(ck.total)}건 · 횟수 미달 ${ck.shortfall.length}명 · 겹침 ${ck.overlaps.length}건 · 일요일 ${ck.sundays}건 ${n ? '<b style="color:var(--st-late)">확인 필요</b>' : '<span style="color:var(--st-done)">문제 없음</span>'}${ck.shortfall[0] ? `<br><small>예: ${esc(ck.shortfall[0].name)} ${ck.shortfall[0].planned}/${ck.shortfall[0].expected}회</small>` : ''}</li>`).join('')}</ul>` : `<p>${ymLabel(ym)}에 승인 대기 중인 계획이 없습니다.</p>`}` };
}
function aiSmsDraft() {
  const rk = risk(), r = VS.drawer != null ? R[VS.drawer] : R.filter(x => ORG() == null || x.svc[ORG()]).sort((a, b) => rk.get(b.id).score - rk.get(a.id).score)[0];
  const o = rk.get(r.id), why = o.reasons[0] ? o.reasons[0].replace(/^최근 14일 /, '최근 2주 동안 ') : '최근 방문 기록';
  const txt = `[진도군 통합돌봄] 안녕하세요. ${r.name} 어르신 보호자님께 안내드립니다.\n${why} 확인되어 연락드립니다. 최근 방문에서 어르신의 상태가 평소보다 좋지 않으셨습니다.\n가능하시면 [날짜]까지 어르신과 통화하시거나 방문해 주시고, 병원 진료가 필요하면 함께 의논해 주세요.\n문의: 진도군 통합돌봄 담당 [전화번호]`;
  return { feat: 'draft', basis: `${r.name} 위험 판단 근거`, html: `<p>${VS.drawer != null ? '열어 둔 어르신' : '위험 점수가 가장 높은 어르신'}(${aiLink(r)}) 보호자 안내 문자 초안입니다. [ ] 안을 채우고, 내용을 확인한 뒤 보내세요.</p><div class="aidraft">${esc(txt)}</div><p><button class="btn sm" data-act="copy" data-v="${esc(txt)}">복사</button> <small class="aimuted">문자 끝에 "AI 도움으로 작성"을 표시하는 것을 권장합니다.</small></p>` };
}
function aiDailyReport() {
  const a = dayAgg(TODAYN), vs = VSV(), sum = k => vs.reduce((s, S) => s + a[S.i][k], 0), rk = [...risk().values()];
  const lines = [`■ ${dlabel(TODAYN)} 통합돌봄 업무 보고 (${hm(SIM.now)} 기준${ORG() != null ? ` · ${SV[ORG()].vendor}` : ''})`,
    `1. 서비스 제공: 계획 ${fmt(sum('plan'))}건 / 완료 ${fmt(sum('done'))}건 / 진행중 ${sum('prog')}건 / 지연 ${sum('late')}건 / 취소 ${sum('cancel')}건`,
    `   - 서비스별 완료: ${vs.map(S => `${S.short} ${a[S.i].done}/${a[S.i].plan}`).join(', ')}`,
    `2. 건강 이상: '나쁨' ${sum('bad')}건, 위험 등급 ${rk.filter(o => o.level === 3).length}명, 주의 ${rk.filter(o => o.level === 2).length}명`,
    `3. 긴급 상황: ${STATE.emgs.filter(m => visS(m.s)).length}건 (조치 완료 ${STATE.emgs.filter(m => visS(m.s) && m.st === '조치완료').length}건)`,
    ...(ORG() == null ? [`4. 퇴원환자 지원: 처리 중 ${STATE.reports.filter(x => x.st !== '종결').length}건 (3일 안 퇴원 ${dcSoon()}명), 신규 접수 ${STATE.reports.filter(x => x.st === '접수').length}건`,
      `5. 계획 승인: ${ymLabel(NEXT_YM)} 승인 ${SV.filter(S => planOf(S.i, NEXT_YM).st === '승인').length}개 기관 / 대기 ${SV.filter(S => planOf(S.i, NEXT_YM).st === '제출').length} / 작성중·반려 ${SV.filter(S => ['작성중', '반려'].includes(planOf(S.i, NEXT_YM).st)).length}, 변경 요청 대기 ${STATE.crs.filter(c => c.st === '대기').length}건`] : []),
    `※ 특이사항: [담당자가 작성]`];
  const txt = lines.join('\n');
  return { feat: 'draft', basis: '오늘 현황·위험 판정·긴급·퇴원지원·계획 상태', html: `<p>오늘 업무 보고서 초안입니다. 수치는 시스템 기록 그대로이고, 특이사항은 직접 적어 주세요.</p><div class="aidraft">${esc(txt)}</div><p><button class="btn sm" data-act="copy" data-v="${esc(txt)}">복사</button></p>` };
}
function aiSettingsHelp() {
  return { feat: 'manual', basis: 'AI 설정 안내', html: `<p>AI 모델은 <b>시스템 관리자</b>가 [AI 설정] 화면에서 바꿉니다.</p><ol class="aiol"><li>[연결 추가]에서 종류(OpenAI 호환·Anthropic·Google), 주소, 모델 이름, API 키를 넣습니다. 정부·내부 설치형 AI는 대부분 "OpenAI 호환"입니다.</li><li>[시험]으로 응답을 확인합니다.</li><li>"기능별 모델 지정"에서 기능마다 주 모델과 예비 모델을 고릅니다. 개인정보 전송이 금지된 연결은 개인정보가 들어가는 기능에 고를 수 없습니다.</li><li>AI 당직 단계와 허용할 일을 정합니다.</li></ol><p class="aimuted">실제 키는 서버 버전에서 암호화해 저장합니다. 시제품은 키 끝 4자리만 기억합니다.</p>${ROLE() === 'admin' ? '<button class="btn sm" data-act="tab" data-tab="aiset">AI 설정 화면</button>' : ''}` };
}
/** 조치·상담 메모 초안 (긴급 조치, 퇴원지원 처리 창의 [AI 초안] 버튼) */
function aiDraftMemo(kind, id) {
  if (kind === 'emg') { const m = STATE.emgs.find(z => z.id === +id), r = R[m.rid];
    return `${hm(SIM.now)} 현장 ${(findUser(m.by) || {}).name || m.by}님과 통화 — ${m.kind}. ${m.note || ''}\n119 신고: [예/아니오], 병원 이송: [병원명 또는 없음]\n보호자 연락: [이름·관계, 통화 결과]\n${SV[m.s].vendor}에 공유함. 내일 재방문 [시간] 확인 예정.`; }
  const x = STATE.reports.find(z => z.id === id);
  return `${dkey(TODAYN).slice(5).replace('-', '/')} ${x.kind || ''} ${x.by || ''}와 통화 [예정/완료]. ${ddLabel(x.ddn)} (${x.hosp || ''}).\n확인한 상황: [거동, 식사, 가족 돌봄 여부]\n신청한 서비스: ${x.needs.join(', ')} / 사연으로 본 필요 서비스(AI 분류): ${aiDcNeeds(x).join(', ')} — 담당자 확인 필요\n다음 할 일: [욕구조사 방문일, 수행기관 연락]`;
}

/* ---------- AI 설정 (시스템 관리자) ---------- */
function renderAISet() {
  const A = AI(); aiDayReset();
  const tst = c => !c.test ? '<span class="aimuted">시험 전</span>' : `<span class="pill" style="--c:${c.test.st === 'ok' ? 'var(--st-done)' : c.test.st === 'warn' ? 'var(--st-late)' : 'var(--st-miss)'}">${c.test.st === 'ok' ? '정상' : c.test.st === 'warn' ? '형식 확인' : '실패'}</span><small class="aimuted"> ${esc(c.test.msg)}</small>`;
  const used = id => AI_FEAT.filter(f => A.map[f.k].includes(id)).map(f => f.name.split(' ')[0] + (f.name.includes('도우미') ? ' 도우미' : '')).join(', ');
  const opt = (f, sel, allowNone) => `${allowNone ? `<option value="" ${!sel ? 'selected' : ''}>없음</option>` : ''}${A.conns.map(c => { const no = f.pi && !c.pi; return `<option value="${c.id}" ${c.id === sel ? 'selected' : ''} ${no ? 'disabled' : ''}>${esc(c.name)}${no ? ' (개인정보 금지)' : ''}</option>`; }).join('')}`;
  view.innerHTML = `<section class="vhead"><h2>AI 설정</h2><span class="sub">AI 모델 연결·교체, 기능별 모델, AI 당직 권한 · 시스템 관리자 전용</span></section>
  <div class="aiset">
    <div class="panel"><h3>AI 사용</h3>
      <div class="aiswitch"><label><input type="checkbox" data-ai="enabled" ${A.enabled ? 'checked' : ''}> <b>AI 기능 사용</b></label><span class="aimuted">꺼도 위험 판정·긴급 알림·지연 표시는 규칙대로 계속 작동합니다.</span></div>
      <div class="aiswitch"><label><input type="checkbox" data-ai="mask" ${A.mask ? 'checked' : ''}> AI로 보낼 때 이름·연락처 가리기 (가명처리)</label></div>
      <div class="aiswitch"><label><input type="checkbox" data-ai="guard" ${A.guard ? 'checked' : ''}> 실수 막기: 점검 결과에 문제가 있는 계획을 승인할 때 한 번 더 확인</label></div>
      <div class="aiswitch"><label>하루 사용 한도 <input type="number" min="10" max="100000" step="10" data-ai="limit" value="${A.limit}" style="width:90px"> 회</label><span class="aimuted">오늘 ${fmt(A.used)}회 사용 · 넘으면 AI만 멈추고 관리자에게 알림</span></div>
    </div>
    <div class="panel"><h3>AI 연결 <small>모델을 바꾸려면 연결을 추가한 뒤 아래에서 기능별로 고르세요</small><button class="btn sm pri" data-act="ai-conn" style="margin-left:auto">연결 추가</button></h3>
      <div class="tblwrap"><table><thead><tr><th>이름</th><th>종류</th><th>주소</th><th>모델</th><th>API 키</th><th>개인정보</th><th>상태</th><th></th></tr></thead><tbody>
      ${A.conns.map(c => `<tr><td><b>${esc(c.name)}</b>${used(c.id) ? `<br><small class="aimuted">사용: ${esc(used(c.id))}</small>` : ''}</td><td>${esc(AI_TYPES[c.type].label)}</td><td class="aiurl">${esc(c.url)}</td><td>${esc(c.model)}</td><td class="num">${c.type === 'demo' ? '-' : c.keyHint ? esc(c.keyHint) : '<span style="color:var(--st-late)">없음</span>'}</td>
        <td>${c.pi ? pill('허용') : '<span class="pill" style="--c:var(--st-miss)">금지</span>'}</td><td>${tst(c)}</td>
        <td class="aibtns"><button class="btn sm" data-act="ai-test" data-id="${c.id}">시험</button>${c.type !== 'demo' ? `<button class="btn sm" data-act="ai-conn" data-id="${c.id}">수정</button><button class="btn sm" data-act="ai-del" data-id="${c.id}">삭제</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="aimuted" style="margin:8px 0 0">시제품은 API 키를 저장하지 않고 끝 4자리만 기억하며, 외부 AI를 실제로 부르지 않습니다. 서버 버전에서는 키를 서버 DB에 암호화해 저장하고, 화면(브라우저)에는 키가 전달되지 않습니다.</p></div>
    <div class="panel"><h3>기능별 모델 지정 <small>주 모델이 응답하지 않으면 예비 모델로 자동 전환</small></h3>
      <div class="tblwrap"><table><thead><tr><th>기능</th><th>개인정보</th><th>주 모델</th><th>예비 모델</th></tr></thead><tbody>
      ${AI_FEAT.map(f => `<tr><td><b>${f.name}</b><br><small class="aimuted">${f.desc}</small></td><td>${f.pi ? '포함' : '없음'}</td><td><select data-ai="map" data-f="${f.k}" data-i="0" aria-label="${f.name} 주 모델">${opt(f, A.map[f.k][0], false)}</select></td><td><select data-ai="map" data-f="${f.k}" data-i="1" aria-label="${f.name} 예비 모델">${opt(f, A.map[f.k][1], true)}</select></td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="panel"><h3>AI 당직 권한</h3>
      <div class="ailv">${[1, 2, 3].map(l => `<label class="${A.level === l ? 'on' : ''}"><input type="radio" name="ailv" data-ai="level" value="${l}" ${A.level === l ? 'checked' : ''}><b>${AI_LV[l].n}</b><span>${AI_LV[l].d}</span></label>`).join('')}</div>
      <div class="aicols"><div><span class="label">3단계에서 AI가 직접 하는 일</span>${AI_ALLOW.map(([k, t]) => `<label class="aick"><input type="checkbox" data-ai="allow" data-k="${k}" ${A.allow[k] ? 'checked' : ''} ${A.level < 3 ? 'disabled' : ''}> ${t}</label>`).join('')}
          <p class="aimuted" style="margin:6px 0 0">긴급 상황의 비상 연락은 단계와 관계없이 규칙으로 바로 발송합니다.</p></div>
        <div><span class="label">AI가 절대 하지 않는 일</span><ul class="aineg">${AI_NEVER.map(t => `<li>${t}</li>`).join('')}</ul></div></div>
      <div class="aicols"><div><span class="label">비상 연락 순서</span>${A.contacts.map((c, i) => `<div class="aict"><span>${i + 1}순위</span><input data-ai="contact" data-i="${i}" data-k="name" value="${esc(c.name)}" aria-label="${i + 1}순위 이름"><input data-ai="contact" data-i="${i}" data-k="phone" value="${esc(c.phone)}" aria-label="${i + 1}순위 전화" inputmode="tel"></div>`).join('')}</div>
        <div><span class="label">자동 켜기</span><label class="aick"><input type="checkbox" data-ai="autoDuty" ${A.autoDuty ? 'checked' : ''}> 근무시간 외(18시 이후)에 AI 당직 자동으로 켜기</label></div></div></div>
    <div class="panel"><h3>AI 지시문 <small>모델을 바꿔도 그대로 쓰는 기능별 기본 지시</small></h3>
      ${AI_FEAT.map(f => `<details class="aipr"><summary>${f.name}</summary><textarea rows="3" data-ai="prompt" data-f="${f.k}" aria-label="${f.name} 지시문">${esc(A.prompts[f.k] || '')}</textarea></details>`).join('')}
      <button class="btn sm" data-act="ai-prompt-reset" style="margin-top:8px">기본 지시문으로 되돌리기</button></div>
  </div>`;
}
function aiConnModal(id) {
  const c = id ? aiConnOf(id) : { name: '', type: 'openai', url: AI_TYPES.openai.url, model: '', keyHint: '', pi: true };
  modal(`<h2>${id ? 'AI 연결 수정' : 'AI 연결 추가'}</h2><form class="form" id="aiconnform" data-id="${id || ''}">
    <label class="full">이름<input id="ac-name" value="${esc(c.name)}" required placeholder="예: 군청 내부 AI"></label>
    <label>종류<select id="ac-type">${Object.entries(AI_TYPES).filter(([k]) => k !== 'demo').map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <label>모델 이름<input id="ac-model" value="${esc(c.model)}" required placeholder="예: gov-llm-1"></label>
    <label class="full">접속 주소<input id="ac-url" value="${esc(c.url)}" required></label>
    <label class="full">API 키 <small>${c.keyHint ? `지금 ${esc(c.keyHint)} · 바꿀 때만 입력` : '시제품은 끝 4자리만 기억합니다. 실제 키는 서버 버전에서 입력하세요'}</small><input id="ac-key" type="password" autocomplete="off" placeholder="${c.keyHint ? '그대로 두려면 비워 두세요' : '시험용 아무 값'}"></label>
    <label class="full aick"><span><input type="checkbox" id="ac-pi" ${c.pi ? 'checked' : ''}> 개인정보 전송 허용 <small>(정부·군청 내부 AI처럼 개인정보 처리가 승인된 곳만)</small></span></label>
    <div class="full mact"><button type="button" class="btn" data-act="mclose">닫기</button><button class="btn pri" type="submit">저장</button></div></form>`);
}
function aiTest(id) {
  const c = aiConnOf(id); let t;
  if (c.type === 'demo') t = { st: 'ok', msg: '정상 응답 (0.2초)' };
  else if (!c.url || /\(.*\)/.test(c.url)) t = { st: 'fail', msg: '접속 주소를 입력하세요' };
  else if (!c.model || /\(.*\)/.test(c.model)) t = { st: 'fail', msg: '모델 이름을 입력하세요' };
  else if (!c.keyHint && c.type !== 'openai') t = { st: 'fail', msg: 'API 키가 없습니다' };
  else t = { st: 'warn', msg: '입력 형식 정상 · 실제 응답 시험은 서버 버전에서' };
  c.test = { ...t, at: nowStr() }; audit('ai_test', c.name, `${t.st} · ${t.msg}`); save(); render();
  toast(t.st === 'fail' ? `연결 시험 실패: ${t.msg}` : `연결 시험: ${t.msg}`);
}

/* ---------- 이벤트 ---------- */
// 실수 막기: 점검에 문제가 있는 계획 승인 전 한 번 더 확인 (app.js 클릭 처리보다 먼저 가로챔)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="approve"]'); if (!b || b.dataset.ok || !STATE.ai || !aiOn() || !AI().guard) return;
  const s = +b.dataset.s, ck = planCheck(s, VS.aym), n = ck.shortfall.length + ck.overlaps.length + (ck.sundays ? 1 : 0); if (!n) return;
  e.stopImmediatePropagation(); e.preventDefault();
  modal(`<h2>AI 도우미 확인 · ${SV[s].short} ${ymLabel(VS.aym)}</h2><p>이 계획의 자동 점검에서 확인할 항목이 있습니다.</p><ul class="aiul">${ck.shortfall.length ? `<li>횟수 미달 <b>${ck.shortfall.length}명</b> (예: ${esc(ck.shortfall[0].name)} ${ck.shortfall[0].planned}/${ck.shortfall[0].expected}회)</li>` : ''}${ck.overlaps.length ? `<li>같은 담당자 시간 겹침 <b>${ck.overlaps.length}건</b> (예: ${sdate(ck.overlaps[0].dn)} ${esc(ck.overlaps[0].worker)})</li>` : ''}${ck.sundays ? `<li>일요일 일정 <b>${ck.sundays}건</b></li>` : ''}</ul><p>어르신 요청 등 이유가 확인된 경우에만 승인하세요. 아니면 반려하고 사유를 적어 주세요.</p>
    <div class="mact"><button class="btn" data-act="mclose">다시 볼게요</button><button class="btn pri" data-act="approve" data-s="${s}" data-ok="1">확인했고 승인</button></div>`);
}, true);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !b.dataset.act.startsWith('ai-')) return;
  if (b.tagName === 'A') e.preventDefault();
  const a = b.dataset.act;
  switch (a) {
    case 'ai-chat': VS.aiopen = true; aiChrome(); { const i = document.getElementById('aiq'); if (i) i.focus(); } break;
    case 'ai-chat-close': VS.aiopen = false; aiChrome(); break;
    case 'ai-clear': VS.aichat = []; aiChrome(); break;
    case 'ai-q': aiAsk(b.dataset.q); break;
    case 'ai-duty': if (AI().duty && AI().duty.on) aiReport(false); else aiDutyModal(); break;
    case 'ai-duty-off': aiDutyStop(); mclose(); drawChrome(); render(); aiReport(false); toast('AI 당직을 끄고 업무로 돌아왔습니다'); break;
    case 'ai-report': aiReport(false); break;
    case 'ai-ack': { const it = AI().duty.items.find(i => i.id === +b.dataset.id); if (it) { it.ack = true; audit('ai_ack', it.target, it.title); save(); } aiReport(false); drawBanner(); break; }
    case 'ai-go': { const it = AI().duty.items.find(i => i.id === +b.dataset.id); if (!it) break; it.ack = true; save(); mclose(); drawBanner();
      if (it.ref.tab) { setTab(it.ref.tab); break; }
      if (it.kind === 'emg' || it.kind === 'dc') { const tmp = document.createElement('button'); tmp.hidden = true; tmp.dataset.act = it.kind === 'emg' ? 'emg' : 'dc-open'; tmp.dataset.id = it.ref.id; document.body.appendChild(tmp); tmp.click(); tmp.remove(); break; }
      const r = R[it.ref.rid]; VS.drawer = r.id; audit('view_recipient', r.code, r.name); save(); renderDrawer(); break; }
    case 'ai-draft': { const ta = document.getElementById(b.dataset.kind === 'emg' ? 'em-memo' : 'dc-memo'); if (!ta) break; if (!aiOn()) { toast('AI 사용이 꺼져 있습니다'); break; } ta.value = aiDraftMemo(b.dataset.kind, b.dataset.id); aiCount(); audit('ai_chat', 'draft', b.dataset.kind === 'emg' ? '긴급 조치 메모 초안' : '퇴원지원 상담 메모 초안'); save(); ta.focus(); toast('AI 초안을 넣었습니다. [ ] 부분을 확인하고 고친 뒤 저장하세요'); break; }
    case 'ai-conn': aiConnModal(b.dataset.id); break;
    case 'ai-test': aiTest(b.dataset.id); break;
    case 'ai-del': { const id = b.dataset.id, c = aiConnOf(id); if (AI_FEAT.some(f => AI().map[f.k].includes(id))) { toast('기능에 지정된 연결은 삭제할 수 없습니다. 먼저 다른 모델로 바꾸세요'); break; } AI().conns = AI().conns.filter(x => x.id !== id); audit('ai_config', c.name, '연결 삭제'); save(); render(); toast('연결을 삭제했습니다'); break; }
    case 'ai-prompt-reset': AI().prompts = { ...AI_PROMPTS }; audit('ai_config', '지시문', '기본값으로'); save(); render(); toast('기본 지시문으로 되돌렸습니다'); break;
  }
});
document.addEventListener('change', e => {
  const t = e.target, k = t.dataset && t.dataset.ai; if (!k || !STATE.ai) return;
  const A = AI(); let msg = '';
  if (k === 'enabled' || k === 'mask' || k === 'guard' || k === 'autoDuty') { A[k] = t.checked; msg = `${k} ${t.checked ? '켬' : '끔'}`; if (k === 'enabled' && !t.checked && A.duty && A.duty.on) aiDutyStop(); }
  else if (k === 'limit') { A.limit = Math.max(10, +t.value || 500); msg = `하루 한도 ${A.limit}회`; }
  else if (k === 'level') { A.level = +t.value; msg = AI_LV[A.level].n; }
  else if (k === 'allow') { A.allow[t.dataset.k] = t.checked; msg = `${t.dataset.k} ${t.checked ? '허용' : '금지'}`; }
  else if (k === 'map') { const f = AI_FEAT.find(x => x.k === t.dataset.f), c = aiConnOf(t.value); if (c && f.pi && !c.pi) { toast('개인정보 전송이 금지된 연결입니다'); render(); return; } A.map[f.k][+t.dataset.i] = t.value; msg = `${f.name} ${t.dataset.i === '0' ? '주' : '예비'} → ${c ? c.name : '없음'}`; }
  else if (k === 'contact') { A.contacts[+t.dataset.i][t.dataset.k] = t.value.trim(); msg = `비상 연락 ${+t.dataset.i + 1}순위`; }
  else if (k === 'prompt') { A.prompts[t.dataset.f] = t.value; msg = `${t.dataset.f} 지시문`; }
  else return;
  audit('ai_config', k, msg); save(); toast('AI 설정을 저장했습니다');
  if (['enabled', 'level', 'map'].includes(k)) { render(); drawChrome(); }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'aiform') { e.preventDefault(); e.stopImmediatePropagation(); const i = document.getElementById('aiq'); const q = i.value; i.value = ''; aiAsk(q); const j = document.getElementById('aiq'); if (j) j.focus(); return; }
  if (f.id === 'aidutyform') { e.preventDefault(); e.stopImmediatePropagation();
    AI().contacts.forEach((c, i) => { c.name = val('ad-c' + i) || c.name; c.phone = val('ad-p' + i) || c.phone; });
    aiDutyStart(STATE.session, val('ad-until')); mclose(); drawChrome(); render(); return; }
  if (f.id === 'aiconnform') { e.preventDefault(); e.stopImmediatePropagation();
    const id = f.dataset.id, name = val('ac-name'), model = val('ac-model'), url = val('ac-url'), key = document.getElementById('ac-key').value.trim();
    if (!name || !model || !url) { toast('이름·모델 이름·주소를 모두 적어 주세요'); return; }
    const pi = document.getElementById('ac-pi').checked, type = val('ac-type');
    let c = id ? aiConnOf(id) : null;
    if (!c) { c = { id: 'c' + nid(), test: null }; AI().conns.push(c); }
    Object.assign(c, { name, model, url, type, pi, test: null }); if (key) c.keyHint = '****' + key.slice(-4);
    if (!pi) AI_FEAT.forEach(ft => { const m = AI().map[ft.k]; if (ft.pi) AI().map[ft.k] = [m[0] === c.id ? 'demo' : m[0], m[1] === c.id ? '' : m[1]]; });
    audit('ai_config', name, `${id ? '연결 수정' : '연결 추가'} · ${AI_TYPES[type].label} · ${model}${key ? ' · 키 변경' : ''}`); save(); mclose(); render(); toast('연결을 저장했습니다. [시험]으로 확인하세요');
  }
}, true);
document.addEventListener('change', e => { if (e.target.id === 'ac-type') { const u = document.getElementById('ac-url'); if (u && (!u.value || Object.values(AI_TYPES).some(t => t.url === u.value))) u.value = AI_TYPES[e.target.value].url; } });

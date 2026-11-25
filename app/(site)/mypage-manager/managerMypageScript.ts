// @ts-nocheck — 예전 스크립트를 로직 그대로 옮긴 파일이라 타입 검사를 끕니다(옮긴 코드를 고치지 않기 위해).
//   호출하는 lib/api · lib/browser 모듈은 타입 검사를 받습니다. React 로 정리하면서 이 줄을 지우세요.
// 케어 매니저 마이페이지 동작 — 예전 mypage-manager.html 의 인라인 스크립트를 "로직 그대로" 옮긴 것입니다.
// (예약·결제·케어 리포트·어르신 프로필 등 기능이 많아 동작이 달라지지 않도록 줄 단위로 옮김)
// 화면 요소를 id 로 직접 다루는 코드라 타입을 느슨하게(any) 두었습니다. 상태 기반 React 로의 정리는 후속 과제입니다.
// DB 호출은 lib/api/manager-mypage.ts, 예전 전역 도우미(WBAuth 등)는 lib/browser/legacy-shims.ts 를 거칩니다.
/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const, no-var, @typescript-eslint/no-unused-vars */
import { getSupabase } from '@/lib/supabase/client';
// DB 호출 모듈 — 이름을 'api' 로 두면 아래 initManagerMypage 안의 데이터 계층 변수(let api = demoApi()/supabaseApi())
// 에 가려져 'managerApi.listMySchedules is not a function' 오류가 났습니다. 그래서 managerApi 로 부릅니다.
import * as managerApi from '@/lib/api/manager-mypage';
import { createLegacyShims } from '@/lib/browser/legacy-shims';
import { loadScript, SCRIPTS } from '@/lib/browser/load-script';
import { TELEGRAM_BOT_USERNAME } from '@/lib/config';

declare global {
  interface Window {
    daum?: any;
    WBPlaceSearch?: any;
    WBDatePicker?: any;
  }
}

/** 마이페이지 동작을 붙입니다 (공용 위젯 스크립트를 먼저 불러온 뒤 실행). 개발 모드의 이중 실행은 무시합니다. */
export function initManagerMypage(shimOpts: Parameters<typeof createLegacyShims>[0] = {}): void {
  const root = document.querySelector<HTMLElement>('main.mp-main');
  if (!root || root.dataset.wbInit === '1') return;
  root.dataset.wbInit = '1';
  Promise.allSettled([loadScript(SCRIPTS.datepicker)]).then(() =>
    run(createLegacyShims(shimOpts)),
  );
}

function run({ WBAuth, WBEdgeFn, PortOne, WBPrivacy }: ReturnType<typeof createLegacyShims>): void {
  const $id = (id: string): any => document.getElementById(id);
  const supabaseClient: any = getSupabase();
  const DEMO = new URLSearchParams(location.search).has('demo');
  const DEMO_SKIPS_AUTH = DEMO && ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const IS_LOCAL_DEV = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const DEV_FALLBACK_COORDS: Record<string, any> = { latitude: 37.5665, longitude: 126.9780, accuracy: 50 }; // 서울시청 (localhost 테스트 전용 기본 좌표)
  const $ = (id: any) => $id(id);
  const TAB_PANEL_ID: Record<string, any> = { today: 'todaySection', requests: 'requestSection', pendingReports: 'pendingReportsSection', history: 'reportCalendarSection' };
  const TAB_BTN_ID: Record<string, any> = { today: 'tabBtnToday', requests: 'tabBtnRequests', pendingReports: 'tabBtnPendingReports', history: 'tabBtnHistory' };
  function moveTabPill() {
    const pill = $('mgrTabPill');
    const activeBtn = document.querySelector<any>('.mgr-tab.is-active');
    if (!pill || !activeBtn) return;
    pill.style.width = activeBtn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + activeBtn.offsetLeft + 'px)';
  }
  function activateTab(name?: any) {
    Object.keys(TAB_PANEL_ID).forEach((key: any) => {
      const isActive = key === name;
      $(TAB_PANEL_ID[key]).hidden = !isActive;
      const btn = $(TAB_BTN_ID[key]);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    });
    moveTabPill();
  }
  Object.keys(TAB_BTN_ID).forEach((key: any) => {
    $(TAB_BTN_ID[key]).addEventListener('click', () => activateTab(key));
  });
  window.addEventListener('resize', moveTabPill);
  window.addEventListener('load', moveTabPill);
  moveTabPill();
  const EMERGENCY_PHONE = '01055305760';
  const emergencyReportModal = $('emergencyReportModal');
  function openEmergencyReportModal() { emergencyReportModal.hidden = false; }
  function closeEmergencyReportModal() { emergencyReportModal.hidden = true; }
  $('emergencyReportBtn').addEventListener('click', openEmergencyReportModal);
  $('emergencyCancelBtn').addEventListener('click', closeEmergencyReportModal);
  $('emergencyCallBtn').addEventListener('click', () => {
    closeEmergencyReportModal();
    window.location.href = 'tel:' + EMERGENCY_PHONE;
  });
  emergencyReportModal.addEventListener('mousedown', (e: any) => { if (e.target === emergencyReportModal) closeEmergencyReportModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !emergencyReportModal.hidden) closeEmergencyReportModal(); });
  const careIssueModal = $('careIssueModal');
  let careIssueTargetSchedule: any = null;
  function resetCareIssueForm() {
    document.querySelectorAll<any>('input[name="careIssueType"]').forEach((el: any) => { el.checked = false; });
    $('careIssueDetailInput').value = '';
    $('careIssueFormError').hidden = true;
  }
  function openCareIssueModal(s?: any) {
    careIssueTargetSchedule = s;
    resetCareIssueForm();
    $('careIssueTarget').textContent = (s.service_type || '동행 서비스') + ' · ' + seniorLabel(s);
    careIssueModal.hidden = false;
  }
  function closeCareIssueModal() { careIssueModal.hidden = true; careIssueTargetSchedule = null; }
  $('careIssueCancelBtn').addEventListener('click', closeCareIssueModal);
  careIssueModal.addEventListener('mousedown', (e: any) => { if (e.target === careIssueModal) closeCareIssueModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !careIssueModal.hidden) closeCareIssueModal(); });
  $('careIssueSubmitBtn').addEventListener('click', async () => {
    const s = careIssueTargetSchedule;
    if (!s) return;
    const typeEl = document.querySelector<any>('input[name="careIssueType"]:checked');
    const errorEl = $('careIssueFormError');
    if (!typeEl) {
      errorEl.textContent = '어떤 문제인지 선택해 주세요.';
      errorEl.hidden = false;
      return;
    }
    const detail = $('careIssueDetailInput').value.trim();
    const btn = $('careIssueSubmitBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '접수 중…';
    errorEl.hidden = true;
    try {
      const { error } = await managerApi.insertCareIssueReport(supabaseClient, s, currentUser, typeEl, detail);
      if (error) throw error;
      showToast('현장 이슈가 접수되었습니다. 운영진이 곧 확인합니다.');
      closeCareIssueModal();
    } catch (err: any) {
      console.error('[현장 이슈 접수] care_issue_reports insert 실패 (sql/care_issue_reports_manager_reporting.sql 실행 여부 확인):', err);
      errorEl.textContent = '접수 중 문제가 발생했어요. 급하면 위 "본사 고객센터 전화"로 바로 연락해 주세요.';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
  const ORDER = ['assigned', 'departed', 'arrived', 'treatment_done', 'returning', 'completed'];
  const FLOW = [
    { key: 'departed',       label: '출발 (이동 중)' },
    { key: 'arrived',        label: '병원 도착' },
    { key: 'treatment_done', label: '진료/대행 완료' },
    { key: 'returning',      label: '귀가 이동' },
    { key: 'completed',      label: '케어 완료' }
  ];
  const STATUS_TEXT: Record<string, any> = {
    pending: '신청 대기', assigned: '배정됨', departed: '이동 중', arrived: '병원 도착',
    treatment_done: '진료/대행 완료', returning: '귀가 이동', completed: '케어 완료'
  };
  const ACTION_BTN_TEXT: Record<string, any> = {
    departed: '출발 인증', arrived: '병원 도착 인증', treatment_done: '진료/대행 완료 인증',
    returning: '귀가 이동 인증', completed: '케어 완료 인증'
  };
  const SCHEDULE_VISIBLE_COUNT = 3; // '오늘의 배정 케어 일정' 기본 노출 건수 — 이 이상은 [더보기]를 눌러야 펼쳐짐
  const REPORT_PHOTO_MAX = 5;
  const settlementRequestedIds = new Set();
  const CHECKPOINT_STEPS = [
    { key: 'departure', label: '출발 (이동 중)', statusKey: 'departed' },
    { key: 'hospital_arrival', label: '병원 도착', statusKey: 'arrived' },
    { key: 'treatment_complete', label: '진료/대행 완료', statusKey: 'treatment_done' },
    { key: 'return_departure', label: '귀가 이동', statusKey: 'returning' },
    { key: 'return_complete', label: '케어 완료', statusKey: 'completed' }
  ];
  function serviceCatFor(serviceType?: any) {
    const t = String(serviceType || '');
    if (t.includes('복합')) return 'mixed';
    if (t.includes('병원')) return 'hospital';
    if (t.includes('생활')) return 'life';
    return 'hospital';
  }
  function scheduleServiceName(schedule?: any) {
    if (!schedule) return '';
    return schedule.service_type || parseScheduleNotes(schedule.notes).service || '';
  }
  const CHECKPOINT_STEP_ALIASES: Record<string, any> = {
    departure: 'departure',
    hospital_arrival: 'hospital_arrival', site_arrival: 'hospital_arrival',
    treatment_complete: 'treatment_complete', task_complete: 'treatment_complete',
    return_departure: 'return_departure',
    return_complete: 'return_complete'
  };
  function normalizeCheckpointStep(step?: any) { return CHECKPOINT_STEP_ALIASES[step] || null; }
  const REPORT_TIMELINE_LABELS = ['출발 (이동 중)', '병원 도착', '진료/대행 완료', '귀가 이동', '케어 완료'];
  const REPORT_TIMELINE_LABELS_BY_CAT: Record<string, any> = { hospital: REPORT_TIMELINE_LABELS, life: REPORT_TIMELINE_LABELS, mixed: REPORT_TIMELINE_LABELS };
  const PHYSICIAN_NOTES_TITLE_BY_CAT: Record<string, any> = {
    hospital: '진료 소견 · 의사 안내사항',
    life: '대행 업무 수행 내용 및 특이사항',
    mixed: '동행 및 대행 종합 소견'
  };
  function reportTimelineStepsFor(serviceType?: any) {
    const labels = REPORT_TIMELINE_LABELS_BY_CAT[serviceCatFor(serviceType)];
    return CHECKPOINT_STEPS.map((step: any, i: any) => ({ key: step.key, label: labels[i] }));
  }
  let currentUser: any = null;
  let api: any = null;
  let data: any = null;          // 마지막으로 불러온 결과 { manager, requests, assigned, completed, reports } 각각 { value } | { error }
  let reportTarget: any = null;  // 리포트 작성 모달 대상 일정
  let requestCarouselTimer: any = null; // 신청 대기 캐러셀 자동 슬라이드 setInterval id — 재렌더마다 이전 타이머를 반드시 정리해야 중복 실행을 막을 수 있음
  function h(tag?: any, className?: any, text?: any) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function svgChevronDown(className?: any) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg class="' + className + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    return wrap.firstElementChild;
  }
  const won = (n: any) => Number(n || 0).toLocaleString('ko-KR');
  function toKst(iso?: any) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : new Date(d.getTime() + 9 * 60 * 60 * 1000);
  }
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  function kstMidnight(offsetDays?: any) {
    const shifted = new Date(Date.now() + KST_OFFSET_MS); // "KST 벽시계"를 UTC getter 로 읽기 위한 시프트
    const ms = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + (offsetDays || 0)) - KST_OFFSET_MS;
    return new Date(ms);
  }
  const fmtTime = (iso: any) => {
    const k = toKst(iso);
    return k ? String(k.getUTCHours()).padStart(2, '0') + ':' + String(k.getUTCMinutes()).padStart(2, '0') : '';
  };
  const fmtDate = (iso: any) => {
    const k = toKst(iso);
    return k ? k.getUTCFullYear() + '.' + String(k.getUTCMonth() + 1).padStart(2, '0') + '.' + String(k.getUTCDate()).padStart(2, '0') : '';
  };
  const fmtDay = (iso: any) => {
    const k = toKst(iso);
    return k ? (k.getUTCMonth() + 1) + '월 ' + k.getUTCDate() + '일 (' + '일월화수목금토'[k.getUTCDay()] + ')' : '';
  };
  const fmtDateWithDow = (iso: any) => {
    const k = toKst(iso);
    return k ? fmtDate(iso) + ' (' + '일월화수목금토'[k.getUTCDay()] + ')' : '';
  };
  const SENIOR_PLACEHOLDER_RE = /^어르신(\s*\(.*\))?$/;
  function seniorLabel(s?: any) {
    const raw = (s && s.senior_name) ? String(s.senior_name).trim() : '';
    const hasRealName = raw && !SENIOR_PLACEHOLDER_RE.test(raw);
    const name = hasRealName ? (raw.includes('어르신') ? raw : raw + ' 어르신') : '어르신';
    const extras: any[] = [];
    if (s && s.senior_age != null) extras.push('만 ' + s.senior_age + '세');
    if (s && s.senior_note) extras.push(s.senior_note);
    return extras.length ? name + ' (' + extras.join(', ') + ')' : name;
  }
  const ESC_MAP: Record<string, any> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (str: any) => String(str == null ? '' : str).replace(/[&<>"']/g, (c: any) => ESC_MAP[c]); // innerHTML 템플릿에 사용자 입력을 넣기 전 XSS 방지용 이스케이프
  const PHONE_RE = /01[016-9][-. ]?\d{3,4}[-. ]?\d{4}/;
  function parseRequestDetails(text?: any) {
    const out = { when: '', mobility: '', purpose: '', note: '' };
    const src = String(text == null ? '' : text).trim();
    if (!src) return out;
    const KEYS: Record<string, any> = { '희망 일시': 'when', '어르신 거동 상태': 'mobility', '세부 목적': 'purpose', '요청 상세': 'note' };
    let current = null, matched = false;
    src.split('\n').forEach((line: any) => {
      const m = /^\s*(희망 일시|어르신 거동 상태|세부 목적|요청 상세)\s*:\s*(.*)$/.exec(line);
      if (m) { current = KEYS[m[1]]; matched = true; out[current] = m[2].trim(); }
      else if (current === 'note') out.note += '\n' + line;
    });
    out.note = out.note.trim();
    if (!matched) out.note = src;
    return out;
  }
  function parseScheduleNotes(notes?: any) {
    const src = String(notes == null ? '' : notes).trim();
    if (!src) return { service: '', when: '', mobility: '', note: '' };
    const m = /^\s*\[([^\]]*)\]\s*\n?([\s\S]*)$/.exec(src);
    const det = parseRequestDetails(m ? m[2] : src);
    return { service: m ? m[1].trim() : '', when: det.when, mobility: det.mobility, purpose: det.purpose, note: det.note };
  }
  const ADDON_LABELS: Record<string, any> = { URGENT_MATCHING: '긴급 매칭 서비스' };
  function addonLabels(codes?: any) {
    return (Array.isArray(codes) ? codes : []).map((code: any) => ADDON_LABELS[code] || code);
  }
  function applicationToRequest(a?: any) {
    const det = parseRequestDetails(a.request_details);
    const contact = String(a.user_contact || '');
    const phone = PHONE_RE.exec(contact);
    const name = contact.replace(PHONE_RE, '').replace(/^[\s\/,·-]+|[\s\/,·-]+$/g, '');
    const addr = String(a.address || '').trim();
    const sep = addr.indexOf(' / '); // 신청서는 '출발지 / 목적지' 로 한 칸에 저장
    return {
      source: 'application', id: a.id, created_at: a.created_at,
      service_type: a.service_type || '동행 서비스', user_relation: a.user_relation || '',
      when_text: det.when, mobility: det.mobility, purpose: det.purpose, notes: det.note,
      addons: addonLabels(a.addon_codes),
      origin: sep >= 0 ? addr.slice(0, sep).trim() : '', destination: sep >= 0 ? addr.slice(sep + 3).trim() : addr,
      origin_lat: typeof a.origin_lat === 'number' ? a.origin_lat : null,
      origin_lng: typeof a.origin_lng === 'number' ? a.origin_lng : null,
      guardian_name: name || '보호자', guardian_phone: phone ? phone[0] : '',
      is_mine: !!(currentUser && a.user_id && a.user_id === currentUser.id) // 내가 직접 낸 신청 (테스트용 표시)
    };
  }
  function relTime(iso?: any) {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!(min >= 1)) return '방금 전'; // 1분 미만 (기기 시계가 조금 앞서 음수가 되어도 '방금 전')
    if (min < 60) return min + '분 전';
    const hr = Math.floor(min / 60);
    return hr < 48 ? hr + '시간 전' : Math.floor(hr / 24) + '일 전';
  }
  const ACCEPT_WINDOW_HOURS = 48;
  const URGENT_WITHIN_HOURS = 12;
  function isPendingApplicationStatus(raw?: any) {
    const original = raw == null ? '' : String(raw);
    const s = original.trim().toLowerCase();
    if (s === 'cancelled' || s === 'canceled' || s === 'cancel' || original.indexOf('취소') !== -1) return false;
    const SYNONYMS = ['matching_pending', '', 'pending', 'new', 'received', 'submitted', 'waiting', 'requested', 'waiting_matching'];
    if (SYNONYMS.indexOf(s) !== -1) return true;
    return /접수|대기|신청/.test(original);
  }
  const BASE_FEE_BY_SERVICE: Record<string, any> = { '시니어 병원 동행': 50000, '생활 편의 대행': 40000, '복합 매칭 서비스': 60000 };
  const BASE_DURATION_LABEL = '기본 2시간';
  const KAKAO_REST_API_KEY = '4e94e702177afc63f2f05c3abfffdf3c';
  const GPS_MATCH_RADIUS_M = 1000; // 출발지 인증(방법 1)에 쓰는 반경(m)
  const ARRIVAL_RADIUS_M = 1000;
  const ARRIVAL_ACCURACY_DEGRADED_M = 100;
  function getCurrentPositionAsync(options?: any) {
    return new Promise((resolve: any, reject: any) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
  }
  async function kakaoLocalGet(url?: any) {
    const res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_API_KEY } });
    if (!res.ok) throw new Error('kakao local api ' + res.status);
    return res.json();
  }
  async function reverseGeocode(lat?: any, lng?: any) {
    if (!KAKAO_REST_API_KEY) return null;
    try {
      const data = await kakaoLocalGet(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`);
      const doc = data.documents && data.documents[0];
      if (!doc) return null;
      const detail = (doc.road_address && doc.road_address.address_name) || (doc.address && doc.address.address_name);
      return detail || null;
    } catch (e: any) { console.warn('[카카오 지오코딩] 좌표→지명 변환 실패:', e.message); return null; }
  }
  const reverseGeocodeCache = new Map();
  async function reverseGeocodeCached(lat?: any, lng?: any) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    const key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key);
    const result = await reverseGeocode(lat, lng);
    reverseGeocodeCache.set(key, result);
    return result;
  }
  async function geocodeAddress(text?: any) {
    if (!KAKAO_REST_API_KEY || !String(text || '').trim()) return null;
    const q = encodeURIComponent(text.trim());
    const tryUrl = async (url: any) => {
      try {
        const data = await kakaoLocalGet(url);
        const doc = data.documents && data.documents[0];
        return doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
      } catch (e: any) { return null; }
    };
    return (await tryUrl(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`))
        || (await tryUrl(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}`));
  }
  function distanceMeters(lat1?: any, lng1?: any, lat2?: any, lng2?: any) {
    const R = 6371000;
    const toRad = (d: any) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  function acceptRemainMs(createdIso?: any) {
    if (!createdIso || isNaN(new Date(createdIso).getTime())) return null;
    return new Date(createdIso).getTime() + ACCEPT_WINDOW_HOURS * 3600e3 - Date.now();
  }
  function remainLabel(ms?: any) {
    if (ms >= 3 * 3600e3) return Math.ceil(ms / 3600e3) + '시간'; // 넉넉히 남았으면 시간 단위로 (반올림)
    const m = Math.max(1, Math.ceil(ms / 60000));
    const hr = Math.floor(m / 60), mm = m % 60;
    return hr ? (mm ? hr + '시간 ' + mm + '분' : hr + '시간') : mm + '분';
  }
  function urgentChipLabel(createdIso?: any) {
    const ms = acceptRemainMs(createdIso);
    if (ms === null || ms <= 0 || ms > URGENT_WITHIN_HOURS * 3600e3) return null;
    return '마감 임박 (' + remainLabel(ms) + ' 남음)';
  }
  function acceptState(createdIso?: any) {
    const ms = acceptRemainMs(createdIso);
    if (ms === null) return 'none';
    if (ms <= 0) return 'overdue';
    if (ms <= URGENT_WITHIN_HOURS * 3600e3) return 'urgent';
    return 'normal';
  }
  function tickRequestTimes() {
    const box = $('requestList');
    if (!box) return;
    const changed = [...box.querySelectorAll<any>('.req-card[data-created]')]
      .some((card: any) => acceptState(card.dataset.created) !== card.dataset.acceptState);
    if (changed) { renderRequests(); return; }
    box.querySelectorAll<any>('[data-rel]').forEach((el: any) => { el.textContent = relTime(el.dataset.rel); });
    box.querySelectorAll<any>('[data-urgent-chip]').forEach((el: any) => { el.textContent = urgentChipLabel(el.dataset.created); });
  }
  setInterval(tickRequestTimes, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickRequestTimes(); });
  const DISMISS_KEY = 'wb_manager_dismissed_requests';
  const requestKey = (r: any) => r.source + ':' + r.id;
  function loadDismissedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); }
    catch (e: any) { return new Set(); }
  }
  function dismissRequest(r?: any) {
    const set = loadDismissedSet();
    set.add(requestKey(r));
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set])); } catch (e: any) { /* 저장 실패(사생활 보호 모드 등)해도 화면에서는 즉시 숨김 */ }
  }
  function guessDateTime(text?: any) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fallback = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 10, 0);
    const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text || '');
    if (!md) return fallback;
    let d = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]), 10, 0);
    if (isNaN(d.getTime())) return fallback;
    if (d < today) { // 이미 지난 날짜: 연말에 적은 내년 일정만 인정
      const next = new Date(d); next.setFullYear(next.getFullYear() + 1);
      if (next - today > 120 * 864e5) return fallback;
      d = next;
    }
    const t = /(오전|오후|낮|저녁)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/.exec(text) || /()(\d{1,2}):(\d{2})/.exec(text);
    if (t) {
      let hour = Number(t[2]);
      if ((t[1] === '오후' || t[1] === '저녁' || t[1] === '낮') && hour < 12) hour += 12;
      if (t[1] === '오전' && hour === 12) hour = 0;
      if (hour <= 23) d.setHours(hour, t[4] === '반' ? 30 : Number(t[3] || 0));
    }
    return d;
  }
  const pad2 = (n: any) => String(n).padStart(2, '0');
  const toLocalInput = (d: any) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  function fmtKoreanDateTime(d?: any) {
    const h24 = d.getHours();
    const ampm = h24 < 12 ? '오전' : '오후';
    const h12 = h24 % 12 || 12;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' (' + '일월화수목금토'[d.getDay()] + ') ' + ampm + ' ' + h12 + ':' + pad2(d.getMinutes());
  }
  let toastTimer: any = null;
  function showToast(message?: any) {
    const t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }
  function errorBox(container?: any, err?: any, retry?: any) {
    container.textContent = '';
    const box = h('div', 'error-box', '데이터를 불러오지 못했습니다.');
    if (err && ['PGRST205', '42P01', 'PGRST202', '42883', '42703'].includes(err.code)) {
      box.appendChild(h('small', '', 'DB 테이블/함수가 아직 준비되지 않았습니다. supabase-manager-schema.sql 을 Supabase SQL Editor 에서 (다시) 실행해 주세요.'));
    } else {
      box.appendChild(h('small', '', (err && err.message) || '알 수 없는 오류'));
    }
    const b = h('button', 'btn btn-sm btn-ghost', '다시 시도');
    b.type = 'button';
    b.addEventListener('click', retry);
    box.appendChild(b);
    container.appendChild(box);
  }
  function emptyBox(container?: any, title?: any, desc?: any) {
    container.textContent = '';
    const e = h('div', 'empty');
    e.appendChild(h('strong', '', title));
    e.appendChild(h('span', '', desc));
    container.appendChild(e);
  }
  function supabaseApi(user?: any) {
    const must = ({ data: d, error }: any) => { if (error) throw error; return d; };
    const startOfDay = () => kstMidnight(0);
    return {
      async loadManager() {
        return must(await managerApi.getMyManagerProfile(supabaseClient, user));
      },
      async loadReviewStats() {
        const rows = must(await managerApi.getMyReviewStats(supabaseClient));
        return (rows && rows[0]) || { avg_rating: null, review_count: 0 };
      },
      async setActivity(status) {
        const row = must(await managerApi.updateMyActivityStatus(supabaseClient, status, user));
        if (!row) throw new Error('변경할 수 없습니다. 매니저 정보가 등록되어 있는지 확인해 주세요.');
        return row;
      },
      async hasActiveSchedule() {
        const rows = must(await managerApi.findMyActiveSchedule(supabaseClient, user));
        return rows.length > 0;
      },
      async loadRequests() {
        const APP_COLS = 'id, created_at, user_id, service_type, user_relation, user_contact, address, request_details, status, addon_codes, origin_lat, origin_lng';
        const acceptCutoffIso = new Date(Date.now() - ACCEPT_WINDOW_HOURS * 3600e3).toISOString();
        let dbSetupPending = false;
        try {
          const certCheck = await managerApi.getMyManagerVerification(supabaseClient, user);
          if (certCheck.error) {
            console.warn('[신청 대기][디버그] 내 managers 행 조회 실패:', certCheck.error.code, certCheck.error.message);
          } else if (!certCheck.data) {
            console.warn('[신청 대기][디버그] ⚠ managers 테이블에 내 id(' + user.id + ') 행이 없습니다 → is_manager() 가 ' +
              '항상 false 라 service_applications_select_managers RLS가 모든 신청서를 숨깁니다. 매니저 승인' +
              '(approve_manager_application)이 끝났는지 확인하세요.');
          } else if (certCheck.data.certification_verified !== true) {
            console.warn('[신청 대기][디버그] ⚠ 내 managers.certification_verified = ' + certCheck.data.certification_verified +
              ' (true 아님) → is_manager() 가 false 로 판정되어 RLS가 모든 신청서를 숨깁니다.');
          } else {
            console.log('[신청 대기][디버그] 내 managers 행 정상(certification_verified=true, activity_status=' +
              certCheck.data.activity_status + ') — is_manager() RLS 조건은 통과합니다.');
          }
        } catch (e: any) {
          console.warn('[신청 대기][디버그] managers 자가조회 중 예외:', e);
        }
        const fetchApps = async () => {
          const res = await managerApi.listOpenApplicationsWithManagerColumn(supabaseClient, APP_COLS, acceptCutoffIso);
          if (res.error && res.error.code === '42703') {
            dbSetupPending = true;
            return managerApi.listOpenApplications(supabaseClient, APP_COLS, acceptCutoffIso);
          }
          return res;
        };
        const [apps, sched] = await Promise.all([
          fetchApps(),
          managerApi.listOpenCareRequests(supabaseClient, startOfDay, acceptCutoffIso)
        ]);
        const list: any[] = [];
        let sourceError: any = null;
        if (apps.error) {
          sourceError = apps.error;
          console.warn('[신청 대기] 웹 신청서(service_applications)를 불러오지 못했습니다:', apps.error.code, apps.error.message,
                       '→ supabase-applications-to-manager.sql 을 실행했는지, 이 계정의 certification_verified 가 true 인지 확인하세요.');
        } else {
          console.log('[신청 대기][디버그] service_applications 원본 조회 결과 — cutoff=' + acceptCutoffIso +
            ' (manager_id IS NULL 조건 포함), ' + (apps.data || []).length + '건:',
            (apps.data || []).map((a: any) => ({ id: a.id, status: a.status, manager_id: a.manager_id, created_at: a.created_at })));
          const open = (apps.data || []).filter((a: any) => {
            const managerOk = !a.manager_id;
            const statusOk = isPendingApplicationStatus(a.status);
            if (!managerOk || !statusOk) {
              console.warn('[신청 대기][디버그] ⚠ 클라이언트 필터에서 제외된 건 — id=' + a.id +
                ', status="' + a.status + '"(대기 상태 판정=' + statusOk + ')' +
                ', manager_id=' + JSON.stringify(a.manager_id) + '(미배정 판정=' + managerOk + ')');
            }
            return managerOk && statusOk;
          });
          open.forEach((a: any) => {
            const r = applicationToRequest(a);
            if (dbSetupPending) r.acceptDisabled = true; // 수락 함수/컬럼이 아직 없어서 수락할 수 없음
            list.push(r);
          });
          if (dbSetupPending) {
            console.warn('[신청 대기] service_applications 에 manager_id 컬럼이 없습니다(42703) → 조회만 가능하고 수락은 막았습니다. ' +
                         'supabase-applications-to-manager.sql 을 실행하세요.');
          }
          if (open.length === 0) {
            console.info('[신청 대기][디버그] 최종 0건. 위 "원본 조회 결과"가 0건이면 RLS/48시간 cutoff에서 이미 걸린 것이고' +
                         '(managers 자가조회 로그로 is_manager() 여부부터 확인하세요), 원본은 있는데 여기가 0건이면 바로 위' +
                         ' "클라이언트 필터에서 제외된 건" 로그에 어떤 신청서가 왜 빠졌는지 나와 있습니다. ' +
                         '(1) 신청 행의 status 가 대기 상태이고 manager_id 가 비었는지 (2) certification_verified = true 인지 ' +
                         '(3) supabase-applications-to-manager.sql 이 적용됐는지 확인하세요.');
          }
        }
        if (sched.error) {
          if (apps.error) throw sched.error; // 두 곳 모두 실패하면 목록 전체를 오류로 표시
          sourceError = sched.error;
          console.warn('[신청 대기] care_schedules 조회 실패:', sched.error.code, sched.error.message);
        } else {
          (sched.data || []).forEach((s: any) => list.push(Object.assign({ source: 'schedule' }, s)));
        }
        list._sourceError = sourceError;
        list._dbSetupPending = dbSetupPending && !apps.error;
        return list;
      },
      async acceptApplication(applicationId, scheduledAtIso) {
        return must(await managerApi.acceptServiceApplication(supabaseClient, applicationId, scheduledAtIso));
      },
      async loadAssigned() {
        return must(await managerApi.listMySchedules(supabaseClient, user, startOfDay));
      },
      async acceptRequest(scheduleId) {
        return must(await managerApi.acceptCareRequest(supabaseClient, scheduleId));
      },
      async loadCompleted() { // 전체 완료 건 (정산 집계 · 리포트 대기 목록 + 월간 캘린더에 사용)
        return must(await managerApi.listMyCompletedSchedules(supabaseClient, user));
      },
      async loadReports() {
        return must(await managerApi.listMyCareReports(supabaseClient, user));
      },
      async advance(scheduleId, status) {
        try {
          return must(await managerApi.advanceCareStatus(supabaseClient, scheduleId, status));
        } catch (err: any) {
          const msg = String((err && err.message) || err);
          const isMissingFn = (err && (err.code === 'PGRST202' || err.code === '42883')) || /advance_care_status/i.test(msg);
          if (!isMissingFn) throw err;
          console.warn('[상태 변경] advance_care_status RPC 를 찾을 수 없어(코드: ' + (err && err.code) + ') care_schedules.status 만 직접 업데이트합니다(신청서 status 미러링 안 됨). ' +
                       'supabase-fix-status-sync.sql 을 Supabase SQL Editor 에서 실행하세요.', err);
          return must(await managerApi.updateScheduleStatusDirect(supabaseClient, status, scheduleId, user));
        }
      },
      async verifyAdvance(scheduleId, status, location, photo, authMethod, authReason) {
        try {
          return must(await managerApi.recordCareVerification(supabaseClient, scheduleId, status, location, photo, authMethod, authReason));
        } catch (err: any) {
          const msg = String((err && err.message) || err);
          const isMissingFn = (err && (err.code === 'PGRST202' || err.code === '42883')) || /record_care_verification/i.test(msg);
          if (!isMissingFn) throw err; // 그 외 오류(권한·상태 순서 위반 등)는 그대로 위로 던져 호출부가 처리
          console.warn('[출발/도착 인증] record_care_verification RPC 를 찾을 수 없어(코드: ' + (err && err.code) + ') 위치/사진 없이 상태만 업데이트합니다. ' +
                       'supabase-fix-status-sync.sql 을 Supabase SQL Editor 에서 실행하면 위치/사진 저장 + 보호자 화면 동기화가 모두 정상화됩니다.', err);
          const row = await api.advance(scheduleId, status); // advance_care_status RPC 로 최소한 상태 미러링은 살리려는 시도 (그마저 없으면 안에서 또 raw update 로 내려감)
          row._verificationSkipped = true;
          return row;
        }
      },
      async submitReport(scheduleId, physicianNotes, seniorCondition, extra = {}) {
        must(await managerApi.insertCareReport(supabaseClient, scheduleId, user, physicianNotes, seniorCondition, extra));
      },
      async generateAiDraft({ careType, tags, memo, hasPhoto, seniorName }) {
        const { data, error } = await WBEdgeFn.invoke(supabaseClient, 'generate-care-report', { careType, tags, memo, hasPhoto, seniorName });
        if (error) throw new Error(error.message || 'AI 리포트 초안 생성에 실패했습니다.');
        return data && data.draft;
      },
      async logArrivalVerification({ scheduleId, verificationType, status, lat, lng, accuracy, distance, watermarkedPhoto, rawPhoto }) {
        must(await managerApi.insertArrivalVerificationLog(supabaseClient, scheduleId, user, verificationType, status, lat, lng, accuracy, distance, watermarkedPhoto, rawPhoto));
      },
      async saveCheckpoint(scheduleId, step, location, photo) {
        return must(await managerApi.insertCareCheckpoint(supabaseClient, scheduleId, user, step, location, photo));
      },
      async loadCheckpoints(scheduleIds) {
        if (!scheduleIds || !scheduleIds.length) return [];
        return must(await managerApi.listCareCheckpointsFor(supabaseClient, scheduleIds));
      },
      async reportDuration(scheduleId, actualDurationMinutes) {
        return must(await managerApi.reportCareDurationAndBillExtra(supabaseClient, scheduleId, actualDurationMinutes));
      }
    };
  }
  function demoApi() {
    const now = new Date();
    const at = (h24: any, m: any) => { const d = new Date(now); d.setHours(h24, m, 0, 0); return d.toISOString(); };
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0);
    const past = (i: any) => new Date(Math.min(now.getTime() - 3600e3, monthStart.getTime() + i * 2 * 864e5)).toISOString();
    const manager = { certification: '요양보호사', certification_verified: true, activity_status: 'online' };
    const inDays = (n: any, h24: any, m: any) => { const d = new Date(now); d.setDate(d.getDate() + n); d.setHours(h24, m, 0, 0); return d.toISOString(); };
    const assigned = [
      { id: 'd1', senior_name: '홍길동 어르신', origin: '인천 남동구 소래역로 93', destination: '서울아산병원 내과', scheduled_at: at(9, 30), guardian_name: '홍보호', guardian_phone: '010-1234-5678', status: 'completed', payout_amount: 44000 },
      { id: 'd2', senior_name: '김순자 어르신', origin: '인천 부평구 부평대로 12', destination: '부평세림병원 정형외과', scheduled_at: at(14, 0), guardian_name: '김보호', guardian_phone: '010-2345-6789', status: 'departed', payout_amount: 44000 },
      { id: 'd3', senior_name: '박영수 어르신', origin: '경기 부천시 길주로 88', destination: '순천향대부천병원 신경과', scheduled_at: at(17, 0), guardian_name: '박보호', guardian_phone: '010-3456-7890', status: 'assigned', payout_amount: 50000 },
      { id: 'd4', senior_name: '송미자 어르신', origin: '인천 연수구 송도과학로 15', destination: '인하대병원 순환기내과', scheduled_at: inDays(2, 11, 0), guardian_name: '송보호', guardian_phone: '010-4567-8901', status: 'assigned', payout_amount: 44000 }
    ];
    const requests = [
      { source: 'application', id: 'a1', created_at: new Date(now.getTime() - 25 * 60e3).toISOString(), service_type: '시니어 병원 동행', user_relation: '자녀', when_text: '다음 주 화요일 오전 10시', mobility: '지팡이 사용', notes: '내과 진료 후 약 수령까지 도와주세요', origin: '마포구 아현동', destination: '신촌세브란스병원', guardian_name: '이보호', guardian_phone: '010-7777-8888', is_mine: true },
      { id: 'p1', created_at: new Date(now.getTime() - 6 * 3600e3).toISOString(), senior_name: '윤정숙 어르신', origin: '인천 남동구 구월로 120', destination: '가천대길병원 내과', scheduled_at: inDays(1, 10, 30), notes: '휠체어 이용, 보청기 착용\n진료 후 약국 동행 요청', guardian_name: '윤보호', guardian_phone: '010-5678-9012', status: 'pending', manager_id: null, payout_amount: 44000 },
      { id: 'p2', created_at: new Date(now.getTime() - 50 * 3600e3).toISOString(), senior_name: '한동석 어르신', origin: '인천 서구 청라대로 60', destination: '인천성모병원 정형외과', scheduled_at: inDays(3, 14, 0), notes: '', guardian_name: '한보호', guardian_phone: '010-6789-0123', status: 'pending', manager_id: null, payout_amount: 50000 }, // 접수 50시간 전 → 수락 기한(48시간) 초과라 renderRequests() 가 자동으로 목록에서 제외하는 데모(화면엔 안 보임)
      { id: 'p3', created_at: new Date(now.getTime() - 40 * 3600e3).toISOString(), senior_name: '강말순 어르신', origin: '인천 미추홀구 학익소로 30', destination: '인하대병원 정형외과', scheduled_at: inDays(1, 9, 0), notes: '휠체어 이용', guardian_name: '강보호', guardian_phone: '010-8901-2345', status: 'pending', manager_id: null, payout_amount: 44000 } // 접수 40시간 전 → 마감 8시간 남음(마감 임박) 데모
    ];
    const completed = [
      { id: 'd1', senior_name: '홍길동 어르신', origin: assigned[0].origin, destination: '서울아산병원 내과', scheduled_at: assigned[0].scheduled_at, completed_at: new Date(now.getTime() - 1800e3).toISOString(), payout_amount: 44000, guardian_name: assigned[0].guardian_name, guardian_phone: assigned[0].guardian_phone },
      { id: 'c1', senior_name: '이복순 어르신', origin: '인천 미추홀구 학익소로 25', destination: '인하대병원 안과', scheduled_at: past(1), completed_at: past(1), payout_amount: 44000, guardian_name: '이대현', guardian_phone: '010-2222-3333' },
      { id: 'c2', senior_name: '최말순 어르신', origin: '인천 남동구 만수로 100', destination: '성모병원 내과', scheduled_at: past(2), completed_at: past(2), payout_amount: 36000, guardian_name: '최영호', guardian_phone: '010-3333-4444' },
      { id: 'c3', senior_name: '정수남 어르신', origin: '인천 부평구 산곡로 55', destination: '가천대길병원 재활의학과', scheduled_at: past(3), completed_at: past(3), payout_amount: 50000, guardian_name: '정미경', guardian_phone: '010-4444-5555' },
      { id: 'c4', senior_name: '배점례 어르신', origin: '인천 서구 가정로 200', destination: '인천성모병원 이비인후과', scheduled_at: new Date(new Date(past(3)).getTime() + 3 * 3600e3).toISOString(), completed_at: new Date(new Date(past(3)).getTime() + 3 * 3600e3).toISOString(), payout_amount: 40000, guardian_name: '배진우', guardian_phone: '010-5555-6666' }, // c3 와 같은 날 → 날짜 칸에 '2건' 배지 데모
      { id: 'c5', senior_name: '서말자 어르신', origin: '인천 계양구 계산로 12', destination: '연세같은내과', scheduled_at: past(7), completed_at: past(7), payout_amount: 38000, guardian_name: '서준혁', guardian_phone: '010-6666-7777' } // 리포트 미제출 상태 데모 (reports 목록에 없음)
    ];
    const reports = [
      { id: 'r1', schedule_id: 'c1', physician_notes: '백내장 초기, 3개월 후 재검진 안내.\n안약 처방 1개월분 수령.', senior_condition: '시력 불편 호소 외 컨디션 양호. 귀가 후 안약 사용법 안내 완료.',
        condition_tags: ['양호', '자립 보행'], next_visit_date: null, photos: [], created_at: past(1) },
      { id: 'r2', schedule_id: 'c2', physician_notes: '혈압약 용량 조정 없음. 다음 진료 4주 후.', senior_condition: '대기 시간이 길어 피로감이 있었으나 식사 후 안정.',
        condition_tags: ['피곤/기력저하', '부축 보행'], next_visit_date: new Date(now.getTime() + 28 * 86400e3).toISOString().slice(0, 10),
        photos: [{ url: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#E9EBE1"/><text x="150" y="155" font-size="22" text-anchor="middle" fill="#4E5746">처방전 (예시)</text></svg>'), label: '처방전' }],
        created_at: past(2) }
    ];
    const wait = () => new Promise((r: any) => setTimeout(r, 250));
    return {
      async loadManager() { await wait(); return manager; },
      async loadReviewStats() { await wait(); return { avg_rating: 3.0, review_count: 2 }; },
      async setActivity(status) { await wait(); manager.activity_status = status; return { activity_status: status }; },
      async hasActiveSchedule() {
        await wait();
        return assigned.some((s: any) => ['assigned', 'departed', 'arrived', 'treatment_done', 'returning'].includes(s.status));
      },
      async loadRequests() { await wait(); return requests.map((s: any) => ({ ...s })); },
      async loadAssigned() { await wait(); return assigned.map((s: any) => ({ ...s })); },
      async loadCompleted() { await wait(); return completed.map((s: any) => ({ ...s })); },
      async loadReports() { await wait(); return reports.map((r: any) => ({ ...r })); },
      async acceptRequest(id) {
        await wait();
        const i = requests.findIndex((x: any) => x.id === id);
        if (i < 0) throw new Error('REQUEST_UNAVAILABLE');
        const [s] = requests.splice(i, 1);
        assigned.push({ ...s, status: 'assigned', manager_id: 'demo' });
        assigned.sort((a: any, b: any) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
      },
      async acceptApplication(id, scheduledAtIso) { // 웹 신청서 수락: 확인한 일시로 '배정됨' 일정을 만듭니다 (실제로는 DB 함수가 처리)
        await wait();
        const i = requests.findIndex((x: any) => x.id === id);
        if (i < 0) throw new Error('REQUEST_UNAVAILABLE');
        const [a] = requests.splice(i, 1);
        assigned.push({ id: 'd' + Date.now(), senior_name: a.user_relation ? '어르신 (' + a.user_relation + ' 신청)' : '어르신', origin: a.origin, destination: a.destination,
          scheduled_at: scheduledAtIso, notes: a.notes, guardian_name: a.guardian_name, guardian_phone: a.guardian_phone, status: 'assigned', manager_id: 'demo', payout_amount: 0 });
        assigned.sort((x: any, y: any) => new Date(x.scheduled_at) - new Date(y.scheduled_at));
      },
      async advance(id, status) {
        await wait();
        const s = assigned.find((x: any) => x.id === id);
        s.status = status;
        if (status === 'completed') completed.unshift({ id: s.id, senior_name: s.senior_name, destination: s.destination, scheduled_at: s.scheduled_at, completed_at: new Date().toISOString(), payout_amount: s.payout_amount });
      },
      async verifyAdvance(id, status, location, photo, authMethod, authReason) {
        await wait();
        const s = assigned.find((x: any) => x.id === id);
        s.status = status;
        if (status === 'departed') {
          s.departed_at = new Date().toISOString(); s.departed_location = location || null; s.departed_photo = photo || null;
          s.departure_auth_method = authMethod || null; s.departure_auth_reason = authReason || null;
        }
        if (status === 'arrived') { s.arrived_at = new Date().toISOString(); s.arrived_location = location || null; s.arrived_photo = photo || null; }
      },
      async logArrivalVerification(payload) {
        await wait();
        console.log('[데모] arrival_verification_logs insert:', { ...payload, watermarkedPhoto: payload.watermarkedPhoto ? '(data URL)' : null, rawPhoto: payload.rawPhoto ? '(data URL)' : null });
      },
      async saveCheckpoint(scheduleId, step, location, photo) {
        await wait();
        console.log('[데모] care_checkpoints insert:', { scheduleId, step, location, photo: photo ? '(data URL)' : null });
        return { schedule_id: scheduleId, step, checkpoint_at: new Date().toISOString() };
      },
      async loadCheckpoints() { await wait(); return []; }, // 데모 데이터는 이미 전 단계가 채워져 있어 별도 조회가 필요 없음
      async reportDuration(scheduleId, actualDurationMinutes) {
        await wait();
        console.log('[데모] report_care_duration_and_bill_extra:', { scheduleId, actualDurationMinutes });
      },
      async submitReport(scheduleId, physicianNotes, seniorCondition, extra = {}) {
        await wait();
        const s = completed.find((x: any) => x.id === scheduleId);
        reports.unshift({ id: 'r' + Date.now(), schedule_id: scheduleId, physician_notes: physicianNotes || null, senior_condition: seniorCondition,
          condition_tags: extra.conditionTags || [], next_visit_date: extra.nextVisitDate || null, photos: extra.photos || [],
          created_at: new Date().toISOString(),
          care_type: extra.careType || 'senior', quick_tags: extra.quickTags || [],
          manager_memo: extra.managerMemo || null, ai_message: extra.aiMessage || null,
          care_schedules: { senior_name: s.senior_name, destination: s.destination, scheduled_at: s.scheduled_at } });
      },
      async generateAiDraft({ careType, tags, memo, hasPhoto, seniorName }) {
        await wait();
        const who = seniorName || (careType === 'child' ? '아이' : '어르신');
        const greeting = careType === 'child'
          ? who + '와 즐거운 시간 보내고 왔어요! 오늘 케어 소식을 전해드려요.'
          : who + '님과 함께한 오늘 동행을 안심하고 보실 수 있도록 전해드립니다.';
        const bullets = (tags.length ? tags : ['케어 진행']).map((t: any) => '· ' + t).join('\n');
        const closing = careType === 'child' ? '다음에도 안전하고 즐겁게 함께하겠습니다.' : '앞으로도 정성껏 살펴보겠습니다.';
        return [greeting, bullets, memo ? '· ' + memo : null, hasPhoto ? '· 현장 사진 촬영 완료' : null, closing].filter(Boolean).join('\n');
      }
    };
  }
  async function settle(promise?: any) {
    try { return { value: await promise }; } catch (error: any) { return { error }; }
  }
  async function loadAll() {
    const [manager, requests, assigned, completed, reports, reviewStats] = await Promise.all([
      settle(api.loadManager()), settle(api.loadRequests()), settle(api.loadAssigned()),
      settle(api.loadCompleted()), settle(api.loadReports()), settle(api.loadReviewStats())
    ]);
    data = { manager, requests, assigned, completed, reports, reviewStats };
    if (!data.assigned.error && !data.requests.error) {
      const localConfirmed = buildLocalConfirmedSchedules(data.requests.value);
      if (localConfirmed.length) data.assigned.value = data.assigned.value.concat(localConfirmed);
    }
    if (!data.assigned.error) {
      const scheduleIds = data.assigned.value.filter((s: any) => s.id && !s._isLocalProposal).map((s: any) => s.id);
      const checkpoints = await settle(api.loadCheckpoints(scheduleIds));
      const bySchedule: any = {};
      (checkpoints.value || []).forEach((r: any) => {
        const key = normalizeCheckpointStep(r.step);
        if (!key) return; // 알 수 없는 step 값은 무시
        const hasAny = r.checkpoint_at || r.created_at || r.lat != null || r.lng != null || r.photo_url;
        if (!hasAny) return; // 완전히 빈 행이 이전 값을 밀어내지 않도록
        const bucket = bySchedule[r.schedule_id] || (bySchedule[r.schedule_id] = {});
        bucket[key] = { at: r.checkpoint_at || r.created_at, location: (r.lat != null && r.lng != null) ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy } : null, photo: r.photo_url };
      });
      data.assigned.value.forEach((s: any) => { s._checkpoints = bySchedule[s.id] || s._checkpoints || {}; });
    }
    renderProfile();
    renderSummary();
    renderRequests();
    renderToday();
    renderPendingReportsTab();
    renderReportCalendar();
  }
  const reportedIds = () => new Set(((data.reports.value) || []).map((r: any) => r.schedule_id));
  function displayName() {
    const meta = currentUser.user_metadata || {};
    return meta.name || meta.full_name || meta.nickname || meta.preferred_username ||
           (currentUser.email ? currentUser.email.split('@')[0] : '매니저');
  }
  function renderProfile() {
    const name = displayName();
    $('mgrName').textContent = name + ' 매니저';
    const meta = currentUser.user_metadata || {};
    const avatar = (meta.avatar_url || meta.picture || '').replace(/^http:\/\//i, 'https://');
    const av = $('mgrAvatar');
    av.textContent = '';
    if (avatar) {
      const img = h('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = avatar;
      img.onerror = () => { av.textContent = name.charAt(0); };
      av.appendChild(img);
    } else {
      av.textContent = name.charAt(0);
    }
    const tags = $('mgrTags');
    tags.textContent = '';
    const m = data.manager.value;
    if (data.manager.error) {
      tags.appendChild(h('span', 'tag', '자격 정보를 불러오지 못했습니다'));
    } else {
      const cert = m && typeof m.certification === 'string' ? m.certification.trim() : '';
      let text = '자격 미등록', cls = 'tag';
      if (cert && m.certification_verified === true) { text = '자격 완료'; cls = 'tag is-verified'; }
      else if (cert) { text = '자격 확인 중'; cls = 'tag is-pending'; }
      const badge = h('span', cls, text);
      if (cert) badge.title = cert; // 마우스를 올리면 자격증 이름(예: 요양보호사)
      tags.appendChild(badge);
    }
    if (!data.reviewStats || !data.reviewStats.error) {
      const rs = data.reviewStats ? data.reviewStats.value : null;
      const hasReviews = rs && rs.review_count > 0 && rs.avg_rating != null;
      const ratingBadge = h('span', 'tag is-rating');
      ratingBadge.appendChild(h('span', 'tag-star', '★'));
      ratingBadge.appendChild(document.createTextNode(
        hasReviews ? ' ' + Number(rs.avg_rating).toFixed(1) + ' (리뷰 ' + rs.review_count + '개)' : ' - (리뷰 없음)'
      ));
      tags.appendChild(ratingBadge);
    }
    renderActivity();
    renderDutyToggle();
    refreshTelegramLinkStatus();
  }
  // 봇 아이디는 환경마다 다름 — lib/config.ts TELEGRAM_BOT_USERNAME(환경 변수 TELEGRAM_BOT_USERNAME)
  function setTelegramLinkBtnUI(state?: any) { // 'checking' | 'linked' | 'unlinked' | 'busy'
    const wrap = $('telegramLinkWrap');
    const btn = $('telegramLinkBtn');
    const label = $('telegramLinkText');
    if (!wrap || !btn || !label) return;
    wrap.hidden = false;
    btn.disabled = state === 'checking' || state === 'busy';
    wrap.classList.toggle('is-linked', state === 'linked');
    label.textContent = state === 'linked' ? '텔레그램 연결됨 (끊기)'
      : state === 'busy' ? '연결 처리 중…'
      : state === 'checking' ? '불러오는 중'
      : '텔레그램 알림 연결';
  }
  async function refreshTelegramLinkStatus() {
    const wrap = $('telegramLinkWrap');
    if (!wrap) return;
    if (DEMO || !supabaseClient || !currentUser) { wrap.hidden = true; return; }
    setTelegramLinkBtnUI('checking');
    try {
      const { data: row, error } = await managerApi.getMyTelegramLink(supabaseClient, currentUser);
      if (error) throw error;
      setTelegramLinkBtnUI(row ? 'linked' : 'unlinked');
    } catch (err: any) {
      console.warn('[텔레그램 연결 상태] 조회 실패(DB 설정 전일 수 있음):', (err && err.message) || err);
      wrap.hidden = true;
    }
  }
  async function handleTelegramLinkClick() {
    const wrap = $('telegramLinkWrap');
    if (!wrap) return;
    const isLinked = wrap.classList.contains('is-linked');
    if (isLinked) {
      if (!confirm('텔레그램 알림 연결을 끊을까요? 이후 신규 신청 알림이 더 이상 오지 않습니다.')) return;
      setTelegramLinkBtnUI('busy');
      try {
        const { error } = await managerApi.deleteMyTelegramLink(supabaseClient, currentUser);
        if (error) throw error;
        setTelegramLinkBtnUI('unlinked');
        showToast('텔레그램 연결을 끊었습니다.');
      } catch (err: any) {
        setTelegramLinkBtnUI('linked');
        alert('연결을 끊지 못했습니다: ' + ((err && err.message) || err));
      }
      return;
    }
    setTelegramLinkBtnUI('busy');
    try {
      const { data: token, error } = await managerApi.requestTelegramLinkToken(supabaseClient);
      if (error) throw error;
      window.open('https://t.me/' + TELEGRAM_BOT_USERNAME + '?start=' + token, '_blank');
      showToast('열린 텔레그램 창에서 [시작] 버튼을 눌러 연결을 완료해 주세요.');
      setTelegramLinkBtnUI('unlinked');
      setTimeout(refreshTelegramLinkStatus, 4000);
    } catch (err: any) {
      setTelegramLinkBtnUI('unlinked');
      alert('연결 토큰을 발급하지 못했습니다: ' + ((err && err.message) || err));
    }
  }
  $('telegramLinkBtn').addEventListener('click', handleTelegramLinkClick);
  function setDutyToggleUI(status?: any, opts?: any) {
    const btn = $('dutySwitchBtn');
    const label = $('dutySwitchLabel');
    if (!btn || !label) return;
    const isOn = status === 'online';
    btn.setAttribute('aria-checked', String(isOn));
    btn.classList.toggle('is-on', isOn);
    btn.disabled = !!(opts && opts.busy);
    label.textContent = isOn ? '근무 중' : '휴식 중';
  }
  function renderDutyToggle() {
    const box = $('dutyToggleBox');
    const m = data.manager.value;
    if (!box) return;
    if (!m) { box.hidden = true; return; }
    box.hidden = false;
    setDutyToggleUI(m.activity_status || 'break');
  }
  async function handleDutyToggleClick() {
    const m = data.manager.value;
    if (!m) return;
    const current = m.activity_status || 'break';
    const next = current === 'online' ? 'break' : 'online';
    if (next === 'break') {
      let blocked = false;
      setDutyToggleUI(current, { busy: true });
      try {
        blocked = await api.hasActiveSchedule();
      } catch (err: any) {
        setDutyToggleUI(current);
        alert('진행 중인 일정을 확인하지 못했습니다: ' + ((err && err.message) || err));
        return;
      }
      if (blocked) {
        setDutyToggleUI(current);
        openDutyBlockedModal();
        return;
      }
    }
    setDutyToggleUI(next, { busy: true });
    try {
      const row = await api.setActivity(next);
      m.activity_status = row.activity_status;
      setDutyToggleUI(m.activity_status);
      showToast(m.activity_status === 'online' ? '출근 상태로 전환했습니다.' : '휴식 상태로 전환했습니다.');
    } catch (err: any) {
      setDutyToggleUI(current);
      const msg = (err && err.message) || '';
      if (msg.includes('진행 중인 동행 예약')) openDutyBlockedModal();
      else alert('상태를 변경하지 못했습니다: ' + (msg || err));
    }
  }
  $('dutySwitchBtn').addEventListener('click', handleDutyToggleClick);
  const dutyBlockedModal = $('dutyBlockedModal');
  function openDutyBlockedModal() { dutyBlockedModal.hidden = false; }
  function closeDutyBlockedModal() { dutyBlockedModal.hidden = true; }
  $('dutyBlockedCloseBtn').addEventListener('click', closeDutyBlockedModal);
  dutyBlockedModal.addEventListener('mousedown', (e: any) => { if (e.target === dutyBlockedModal) closeDutyBlockedModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !dutyBlockedModal.hidden) closeDutyBlockedModal(); });
  function renderActivity() {
    const hint = $('activityHint');
    const m = data.manager.value;
    hint.hidden = true;
    if (!m) {
      setActivityBadge('completed', data.manager.error ? '확인 불가' : '미등록');
      hint.textContent = data.manager.error ? '활동 상태를 불러오지 못했습니다.' : '매니저 정보가 등록되지 않았습니다. 관리자에게 문의해 주세요.';
      hint.hidden = false;
    }
  }
  function setActivityBadge(tone?: any, text?: any) {
    const badge = $('activityBadge');
    badge.className = 'status-tag st-' + tone;
    badge.textContent = text;
  }
  function updateActivityBadge(todayItems?: any) {
    if (!data.manager.value) return; // 매니저 정보 자체가 없으면 renderActivity() 가 이미 안내를 채워 둠 — 덮어쓰지 않음
    if (todayItems === null) { setActivityBadge('completed', '확인 불가'); return; }
    const n = todayItems.length;
    if (n === 0) { setActivityBadge('completed', '오늘 일정 없음'); return; }
    if (todayItems.some((s: any) => s.status === 'arrived')) { setActivityBadge('arrived', '병원 동행 진행 중'); return; }
    if (todayItems.some((s: any) => s.status === 'departed')) { setActivityBadge('departed', '병원 동행 이동 중'); return; }
    if (todayItems.some((s: any) => s.status === 'assigned')) { setActivityBadge('assigned', '진행 대기 중'); return; }
    setActivityBadge('completed', '오늘 케어 ' + n + '건'); // 오늘 일정은 있지만(1건 이상) 전부 완료 처리된 경우
  }
  function updatePastUnverifiedAlert(count?: any) {
    const bar = $('verifyAlertBar');
    if (!bar) return;
    if (!count) { bar.hidden = true; return; }
    $('verifyAlertText').textContent = '미완료 인증 케어가 ' + count + '건 있습니다. 인증을 완료해 주세요.';
    bar.hidden = false;
  }
  $('verifyAlertBar').addEventListener('click', () => {
    activateTab('today');
    const toggleBtn = $('pastUnverifiedToggleBtn');
    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') toggleBtn.click();
    const anchor = $('pastUnverifiedAnchor');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  function renderSummary() {
    const nowKst = toKst(new Date().toISOString());
    const nowYear = nowKst.getUTCFullYear();
    const nowMonth = nowKst.getUTCMonth();
    $('summaryMonth').textContent = nowYear + '년 ' + (nowMonth + 1) + '월';
    const box = $('summaryBody');
    if (data.completed.error) { errorBox(box, data.completed.error, loadAll); return; }
    const monthDone = data.completed.value.filter((s: any) => {
      const d = toKst(s.completed_at);
      return d && d.getUTCFullYear() === nowYear && d.getUTCMonth() === nowMonth;
    });
    const payout = monthDone.reduce((sum: any, s: any) => sum + (s.payout_amount || 0), 0);
    const reported = reportedIds();
    const pending = data.completed.value.filter((s: any) => !reported.has(s.id)).length;
    box.textContent = '';
    const tiles = h('div', 'tiles');
    const tile = (tone, label, chip, num, unit, sub) => {
      const t = h('div', 'tile' + (tone ? ' tone-' + tone : ''));
      const head = h('div', 'tile-head');
      head.appendChild(h('div', 'tile-label', label));
      head.appendChild(h('span', 'tile-chip', chip)); // 아이콘 대신 오른쪽 위의 작은 글자 배지
      t.appendChild(head);
      const n = h('div', 'tile-num', num);
      if (unit) n.appendChild(h('small', '', unit));
      t.appendChild(n);
      t.appendChild(h('div', 'tile-sub', sub));
      t.appendChild(h('span', 'tile-chevron', '›')); // 아이콘 대신 오른쪽 아래 셰브런으로 '더보기' 느낌만 살림
      return t;
    };
    tiles.appendChild(tile('', '완료 케어', '이번 달', String(monthDone.length), '건', '완료 처리된 동행 기준'));
    tiles.appendChild(tile('indigo', '예상 정산 금액', '정산 예정', won(payout), '원', '완료 건의 정산액 합계'));
    tiles.appendChild(tile('amber', '리포트 작성 대기', '작성 필요', String(pending), '건', pending ? '제출하면 보호자께 공유돼요' : '모두 제출했어요'));
    box.appendChild(tiles);
    box.appendChild(h('p', 'card-note', '* 예상 금액이며, 실제 정산 금액은 정산일에 확정됩니다.'));
  }
  const dayTag = (iso: any) => {
    const k = toKst(iso);
    if (!k) return '';
    const ms = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST_OFFSET_MS;
    if (ms === kstMidnight(0).getTime()) return '오늘';
    return (k.getUTCMonth() + 1) + '/' + k.getUTCDate() + '(' + '일월화수목금토'[k.getUTCDay()] + ')';
  };
  function daysOverdueFromToday(iso?: any) {
    const k = toKst(iso);
    if (!k) return null;
    const scheduledDayMs = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST_OFFSET_MS;
    return Math.round((kstMidnight(0).getTime() - scheduledDayMs) / (24 * 60 * 60 * 1000));
  }
  function routeCell(s?: any) {
    const dd = h('dd');
    dd.append(s.origin || '출발지 미입력', h('span', 'arrow', '→'), s.destination);
    return dd;
  }
  function guardianCell(s?: any) {
    const dd = h('dd');
    dd.append((s.guardian_name || '보호자') + ' ');
    if (s.guardian_phone) {
      const tel = h('a', 'tel', s.guardian_phone);
      tel.href = 'tel:' + s.guardian_phone.replace(/[^0-9+]/g, '');
      dd.appendChild(tel);
    } else {
      dd.append('(연락처 미등록)');
    }
    return dd;
  }
  const REQUEST_REGION_GROUPS: Record<string, any> = {
    all:      { label: '전체', match: null, districts: [] },
    incheon:  { label: '인천', match: '인천', districts: [
      { key: 'all',      label: '인천 전체', match: '인천' },
      { key: 'namdong',  label: '남동구',     match: '남동구' },
      { key: 'yeonsu',   label: '연수구',     match: '연수구' },
      { key: 'michuhol', label: '미추홀구',   match: '미추홀구' },
      { key: 'bupyeong', label: '부평구',     match: '부평구' },
      { key: 'gyeyang',  label: '계양구',     match: '계양구' },
      { key: 'dong',     label: '동구',       match: /(?<!남)동구/ },
      { key: 'jung',     label: '중구',       match: '중구' },
      { key: 'seo',      label: '서구',       match: '서구' },
    ] },
    gyeonggi: { label: '경기', match: '경기', districts: [
      { key: 'all',     label: '경기 전체',           match: '경기' },
      { key: 'siheung', label: '시흥시',             match: '시흥시' },
      { key: 'ansan',   label: '안산시 (단원구/상록구)', match: '안산시' },
      { key: 'bucheon', label: '부천시',             match: '부천시' },
      { key: 'gwangmyeong', label: '광명시',          match: '광명시' },
    ] },
  };
  let requestRegionGroupKey = 'all';
  let requestRegionDistrictKey = 'all';
  function addressMatches(address?: any, matcher?: any) {
    const str = String(address || '');
    return matcher instanceof RegExp ? matcher.test(str) : str.includes(matcher);
  }
  function matchesRegionFilter(r?: any) {
    const group = REQUEST_REGION_GROUPS[requestRegionGroupKey];
    if (!group || !group.match) return true; // '전체'
    const district = group.districts.find((d: any) => d.key === requestRegionDistrictKey) || group.districts[0];
    const matcher = (district && district.match) || group.match;
    return addressMatches(r.origin, matcher) || addressMatches(r.destination, matcher);
  }
  const requestRegionFilterBar = $('requestRegionFilterBar');
  const requestDistrictSelect = $('requestDistrictSelect');
  function refreshDistrictSelect() {
    const group = REQUEST_REGION_GROUPS[requestRegionGroupKey];
    if (!group || !group.districts.length) { requestDistrictSelect.hidden = true; return; }
    requestDistrictSelect.innerHTML = '';
    group.districts.forEach((d: any) => {
      const opt = document.createElement('option');
      opt.value = d.key; opt.textContent = d.label;
      requestDistrictSelect.appendChild(opt);
    });
    requestRegionDistrictKey = 'all';
    requestDistrictSelect.value = 'all';
    requestDistrictSelect.hidden = false;
  }
  if (requestRegionFilterBar) {
    requestRegionFilterBar.addEventListener('click', (e: any) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      requestRegionGroupKey = btn.dataset.group;
      requestRegionFilterBar.querySelectorAll<any>('.chip-btn').forEach((b: any) => b.classList.toggle('is-selected', b === btn));
      refreshDistrictSelect();
      renderRequests();
    });
  }
  if (requestDistrictSelect) {
    requestDistrictSelect.addEventListener('change', () => {
      requestRegionDistrictKey = requestDistrictSelect.value;
      renderRequests();
    });
  }
  let requestSortKey = 'relevance';
  let managerSortProfile: any = null;       // { address, activity_areas } — manager_applications 최신 승인 지원서
  let managerSortProfilePromise: any = null;
  let managerBaseCoord: any = null;         // { lat, lng } — managerSortProfile.address 를 지오코딩한 결과
  let managerBaseCoordPromise: any = null;
  async function ensureManagerSortProfile() {
    if (managerSortProfilePromise) return managerSortProfilePromise;
    managerSortProfilePromise = (async () => {
      if (DEMO || !supabaseClient || !currentUser) { managerSortProfile = { address: '', activity_areas: [] }; return; }
      try {
        const { data, error } = await managerApi.getMyApprovedApplicationArea(supabaseClient, currentUser);
        if (error) throw error;
        managerSortProfile = data || { address: '', activity_areas: [] };
      } catch (e: any) {
        console.warn('[신청 대기 정렬] manager_applications(지역/주소) 조회 실패 — 관련도순은 임박도만으로, 거리순은 비활성됩니다:', (e && e.message) || e);
        managerSortProfile = { address: '', activity_areas: [] };
      }
    })();
    return managerSortProfilePromise;
  }
  async function ensureManagerBaseCoord() {
    if (managerBaseCoordPromise) return managerBaseCoordPromise;
    managerBaseCoordPromise = (async () => {
      await ensureManagerSortProfile();
      if (managerSortProfile && managerSortProfile.address) {
        managerBaseCoord = await geocodeAddress(managerSortProfile.address);
        if (!managerBaseCoord) {
          console.warn('[신청 대기 정렬] 등록 주소 좌표 변환 실패 — 거리순을 쓸 수 없습니다:', managerSortProfile.address);
        }
      }
    })();
    return managerBaseCoordPromise;
  }
  function isRegionRelevant(r?: any) {
    const areas = (managerSortProfile && managerSortProfile.activity_areas) || [];
    if (!areas.length) return false;
    const addr = (r.origin || '') + ' ' + (r.destination || '');
    return areas.some((area: any) => {
      const token = String(area || '').trim().split(/\s+/).pop();
      return token && addr.includes(token);
    });
  }
  function requestDistanceMeters(r?: any) {
    if (!managerBaseCoord || typeof r.origin_lat !== 'number' || typeof r.origin_lng !== 'number') return null;
    return distanceMeters(managerBaseCoord.lat, managerBaseCoord.lng, r.origin_lat, r.origin_lng);
  }
  function sortRequests(arr?: any) {
    const items = arr.slice();
    if (requestSortKey === 'latest') {
      items.sort((a: any, b: any) => new Date(b.created_at) - new Date(a.created_at)); // 등록 시간 내림차순
    } else if (requestSortKey === 'distance') {
      items.sort((a: any, b: any) => {
        const da = requestDistanceMeters(a), db = requestDistanceMeters(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;  // 좌표 없는 건은 뒤로
        if (db === null) return -1;
        return da - db;
      });
    } else { // 관련도순(기본): 내 활동 지역 일치 → 마감 임박도 순
      items.sort((a: any, b: any) => {
        const ra = isRegionRelevant(a) ? 0 : 1, rb = isRegionRelevant(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        const ua = acceptRemainMs(a.created_at), ub = acceptRemainMs(b.created_at);
        return (ua === null ? Infinity : ua) - (ub === null ? Infinity : ub);
      });
    }
    return items;
  }
  const requestSortBar = $('requestSortBar');
  if (requestSortBar) {
    requestSortBar.addEventListener('click', async (e: any) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn || btn.dataset.sort === requestSortKey) return;
      requestSortKey = btn.dataset.sort;
      requestSortBar.querySelectorAll<any>('.chip-btn').forEach((b: any) => b.classList.toggle('is-selected', b === btn));
      renderRequests(); // 데이터가 아직 없어도(관련도=임박도만, 거리=null 취급) 일단 즉시 재정렬해 반응성부터 보여줌
      if (requestSortKey === 'relevance') await ensureManagerSortProfile();
      else if (requestSortKey === 'distance') await ensureManagerBaseCoord();
      if (requestSortKey === btn.dataset.sort) renderRequests(); // 그 사이 다른 탭으로 또 바뀌지 않았을 때만 최종 결과 반영
    });
  }
  ensureManagerSortProfile().then(() => { if (requestSortKey === 'relevance' && data && data.requests) renderRequests(); });
  function renderRequests() {
    const box = $('requestList');
    const badge = $('requestBadge');
    if (requestCarouselTimer) { clearInterval(requestCarouselTimer); requestCarouselTimer = null; }
    if (data.requests.error) { badge.hidden = true; $('requestTabLabel').textContent = '신청대기'; errorBox(box, data.requests.error, reloadRequests); return; }
    const rawList = data.requests.value;
    const dismissed = loadDismissedSet();
    const notExpired = rawList.filter((r: any) => acceptState(r.created_at) !== 'overdue');
    const notConfirmed = notExpired.filter((r: any) => {
      if (r.source !== 'application') return true;
      const p = getScheduleProposal(r.id);
      return !(p && CONFIRMED_PROPOSAL_STATUSES.includes(p.status));
    });
    const list = notConfirmed.filter((r: any) => !dismissed.has(requestKey(r)));
    list._sourceError = rawList._sourceError;
    list._dbSetupPending = rawList._dbSetupPending;
    badge.hidden = list.length === 0;
    badge.className = 'badge is-live';
    badge.textContent = list.length + '건 대기 중';
    $('requestTabLabel').textContent = list.length > 0 ? '신청대기 (' + list.length + ')' : '신청대기';
    moveTabPill();
    const sourceNote = () => box.appendChild(h('p', 'card-note is-warn',
      '일부 신청을 불러오지 못했어요. 웹 신청서가 안 보이면 관리자에게 DB 설정(supabase-applications-to-manager.sql)과 매니저 인증 상태를 확인해 달라고 요청해 주세요.' +
      (list._sourceError && list._sourceError.code ? ' (오류 ' + list._sourceError.code + ')' : '')));
    const setupNote = () => box.appendChild(h('p', 'card-note is-warn',
      '수락 기능의 DB 설정(supabase-applications-to-manager.sql)이 아직 적용되지 않았어요. 지금은 신청 내용만 볼 수 있고 수락은 설정 후에 가능해요. 관리자에게 실행을 요청해 주세요.'));
    const appendNotes = () => {
      if (list._dbSetupPending) setupNote();
      if (list._sourceError) sourceNote();
    };
    if (list.length === 0) {
      if (notConfirmed.length > 0) {
        emptyBox(box, '모든 신청을 숨겼습니다', '숨긴 신청을 다시 보려면 새로고침을 눌러도 유지돼요. 브라우저 저장공간을 지우면 다시 나타나요.');
      } else {
        emptyBox(box, '현재 대기 중인 신청 건이 없습니다.', '새 동행 신청이 들어오면 이곳에 표시돼요. 잠시 후 새로고침으로 다시 확인해 보세요.');
      }
      appendNotes();
      return;
    }
    const filtered = sortRequests(list.filter(matchesRegionFilter));
    if (filtered.length === 0) {
      emptyBox(box, '이 지역에는 대기 중인 신청이 없어요', '다른 지역 필터를 선택하거나 [전체]를 눌러 모든 신청을 확인해 주세요.');
      appendNotes();
      return;
    }
    box.textContent = '';
    box.appendChild(buildRequestCarousel(filtered));
    appendNotes();
  }
  function buildRequestCarousel(list?: any) {
    const carousel = h('div', 'req-carousel');
    const track = h('div', 'req-carousel-track');
    list.forEach((r: any) => {
      const slide = h('div', 'req-carousel-slide');
      slide.appendChild(requestCard(r));
      track.appendChild(slide);
    });
    carousel.appendChild(track);
    if (list.length <= 1) return carousel; // 1건: 점·자동 재생 없이 카드만
    let current = 0;
    const dotEls: any[] = [];
    const goTo = (i: any) => {
      current = ((i % list.length) + list.length) % list.length; // 마지막에서 다음으로 넘기면 처음으로 순환
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      dotEls.forEach((d: any, idx: any) => d.classList.toggle('is-active', idx === current));
    };
    const dots = h('div', 'req-carousel-dots');
    list.forEach((_: any, i: any) => {
      const dot = h('button', 'req-carousel-dot' + (i === 0 ? ' is-active' : ''));
      dot.type = 'button';
      dot.setAttribute('aria-label', (i + 1) + '번째 신청 보기');
      dot.addEventListener('click', () => goTo(i));
      dots.appendChild(dot);
      dotEls.push(dot);
    });
    carousel.appendChild(dots);
    const AUTOPLAY_MS = 4000;
    const stopAutoplay = () => { if (requestCarouselTimer) { clearInterval(requestCarouselTimer); requestCarouselTimer = null; } };
    const startAutoplay = () => { stopAutoplay(); requestCarouselTimer = setInterval(() => goTo(current + 1), AUTOPLAY_MS); };
    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('touchstart', stopAutoplay, { passive: true });
    carousel.addEventListener('touchend', startAutoplay, { passive: true });
    startAutoplay();
    return carousel;
  }
  const ICON_CLOCK = '<svg class="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
  const ICON_CHEVRON = '<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  function createCardHTML(r?: any) {
    const isApp = r.source === 'application'; // 웹 신청서에서 온 신청 (care_schedules 행이 아님)
    const serviceName = escapeHtml(r.service_type || '시니어 병원 동행');
    const hasSchedule = r.scheduled_at && !isNaN(new Date(r.scheduled_at).getTime());
    let scheduleCompactHtml: any, scheduleNoteHtml: any;
    if (isApp) {
      scheduleCompactHtml = '<strong>' + escapeHtml(fmtKoreanDateTime(guessDateTime(r.when_text))) + '</strong>';
      scheduleNoteHtml = r.when_text
        ? '보호자 작성: “' + escapeHtml(r.when_text) + '”'
        : '정확한 일시는 확인 전화 시 협의';
    } else {
      scheduleCompactHtml = hasSchedule
        ? '<strong>' + escapeHtml(fmtKoreanDateTime(new Date(r.scheduled_at))) + '</strong>'
        : '일정 협의 필요';
      scheduleNoteHtml = '';
    }
    const createdIso = r.created_at || '';
    const appliedText = createdIso && !isNaN(new Date(createdIso).getTime()) ? relTime(createdIso) : '신청 시각 미상';
    const acceptRemain = acceptRemainMs(createdIso);
    const acceptCaption = acceptRemain === null ? '' : ' · ' + ACCEPT_WINDOW_HOURS + '시간 내 수락 가능';
    const designatedBadgeHtml = r.is_designated
      ? '<span class="bg-amber-500 text-white text-xs px-2 py-1 rounded font-semibold">지정요청</span>' : '';
    const urgentLabel = urgentChipLabel(createdIso);
    const urgentBadgeHtml = urgentLabel
      ? `<span class="bg-red-50 text-red-700 border border-red-200 text-xs font-semibold px-2.5 py-1 rounded-full" data-urgent-chip data-created="${escapeHtml(createdIso)}">${escapeHtml(urgentLabel)}</span>` : '';
    const addons = Array.isArray(r.addons) ? r.addons : [];
    const addonBadgesHtml = addons
      .map((label: any) => `<span class="req-addon-badge">${escapeHtml(label)}</span>`)
      .join('');
    const fee = r.payout_amount > 0 ? r.payout_amount : (BASE_FEE_BY_SERVICE[r.service_type] || null);
    const feeValueHtml = (fee ? '<strong>' + won(fee) + '원</strong>' : '협의 예정') + ' · ' + escapeHtml(BASE_DURATION_LABEL);
    const hasOrigin = !!(r.origin && String(r.origin).trim());
    const hasDest = !!(r.destination && String(r.destination).trim());
    const locationHtml = (hasOrigin || hasDest)
      ? `${hasOrigin ? escapeHtml(r.origin) : '출발지 미정'} <span class="text-gray-400">➔</span> <strong class="font-semibold text-gray-900">${hasDest ? escapeHtml(r.destination) : '목적지 미정'}</strong>`
      : '장소 미지정';
    const locationTitle = (hasOrigin || hasDest)
      ? escapeHtml((hasOrigin ? r.origin : '출발지 미정') + ' → ' + (hasDest ? r.destination : '목적지 미정'))
      : '';
    const mobilityValue = r.mobility ? escapeHtml(r.mobility) : '<span class="text-gray-400">정보 없음</span>';
    const acceptLabel = r.acceptDisabled ? '수락하기 (DB 설정 후 가능)' : '수락하기';
    const phoneHtml = r.guardian_phone
      ? `<a href="tel:${escapeHtml(String(r.guardian_phone).replace(/[^0-9+]/g, ''))}" class="font-semibold text-gray-900" style="text-decoration:none;">${escapeHtml(r.guardian_phone)}</a>`
      : '<span class="text-gray-400 font-normal">연락처 미등록</span>';
    const applicantLabel = isApp ? '신청자 이름' : '어르신 성함';
    const applicantValue = isApp ? (r.guardian_name || '보호자') : (r.senior_name || '어르신');
    const avatarInitial = escapeHtml((r.senior_name || r.guardian_name || '신').charAt(0));
    const fieldRow = (label: any, valueHtml: any) => `
        <div class="sched-detail-row">
          <span class="sched-detail-label">${escapeHtml(label)}</span>
          <span class="sched-detail-value">${valueHtml}</span>
        </div>`;
    const detailRows = [
      fieldRow('연락처', phoneHtml),
      fieldRow(applicantLabel, escapeHtml(applicantValue)),
      isApp && r.user_relation ? fieldRow('관계', escapeHtml(r.user_relation)) : '',
      isApp && addons.length ? fieldRow('선택 옵션', escapeHtml(addons.join(', '))) : '',
      r.purpose ? fieldRow('세부 목적', escapeHtml(r.purpose)) : '',
      scheduleNoteHtml ? fieldRow('희망 일시 안내', scheduleNoteHtml) : '',
      fieldRow('신청 시각', `<span${createdIso ? ` data-rel="${escapeHtml(createdIso)}"` : ''}>${escapeHtml(appliedText)}</span>${escapeHtml(acceptCaption)}`),
      fieldRow('요청 사항', r.notes ? escapeHtml(r.notes) : '요청 사항 없음'),
    ].join('');
    return `
      <div class="req-top">
        <div class="sched-avatar">${avatarInitial}</div>
        <div class="req-badges">
          <span class="badge req-service-badge">${serviceName}</span>
          <span class="status-tag st-pending">배정 대기중</span>
          ${addonBadgesHtml}
          ${designatedBadgeHtml}
          ${urgentBadgeHtml}
        </div>
      </div>
      <div class="req-compact-rows">
        <div class="req-compact-row"><span class="req-compact-label">일시</span><span class="req-compact-value">${scheduleCompactHtml}</span></div>
        <div class="req-compact-row"><span class="req-compact-label">장소</span><span class="req-compact-value"${locationTitle ? ` title="${locationTitle}"` : ''}>${locationHtml}</span></div>
        <div class="req-compact-row"><span class="req-compact-label">거동</span><span class="req-compact-value">${mobilityValue}</span></div>
        <div class="req-compact-row"><span class="req-compact-label">보수</span><span class="req-compact-value">${feeValueHtml}</span></div>
      </div>
      <div class="sched-action-bar">
        <button type="button" data-role="hide" class="sched-tel-btn is-neutral">숨기기</button>
        <button type="button" data-role="accept" class="action-btn">${escapeHtml(acceptLabel)}</button>
      </div>
      <button type="button" class="schedule-more-btn req-detail-toggle" data-role="toggle-detail" aria-expanded="false">
        <span data-role="toggle-label">상세 정보 보기</span>
        ${ICON_CHEVRON}
      </button>
      <div class="sched-detail" data-role="detail-body" hidden>${detailRows}</div>`;
  }
  function requestCard(r?: any) {
    const wrap = h('div', 'req-card');
    wrap.innerHTML = createCardHTML(r);
    if (r.created_at) { wrap.dataset.created = r.created_at; wrap.dataset.acceptState = acceptState(r.created_at); }
    const acceptBtn = wrap.querySelector<any>('[data-role="accept"]');
    const hideBtn = wrap.querySelector<any>('[data-role="hide"]');
    if (r.acceptDisabled) {
      acceptBtn.disabled = true;
      acceptBtn.title = 'supabase-applications-to-manager.sql 을 실행하면 수락할 수 있어요';
    }
    acceptBtn.addEventListener('click', () => onAccept(r, acceptBtn));
    hideBtn.addEventListener('click', () => {
      openHideConfirmModal(() => {
        dismissRequest(r);
        renderRequests();
      });
    });
    const toggleBtn = wrap.querySelector<any>('[data-role="toggle-detail"]');
    const detailBody = wrap.querySelector<any>('[data-role="detail-body"]');
    const toggleLabel = wrap.querySelector<any>('[data-role="toggle-label"]');
    toggleBtn.addEventListener('click', () => {
      const open = detailBody.hidden;
      detailBody.hidden = !open;
      toggleBtn.classList.toggle('is-open', open);
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleLabel.textContent = open ? '상세 정보 숨기기' : '상세 정보 보기';
    });
    return wrap;
  }
  const hideConfirmModal = $('hideConfirmModal');
  let hideConfirmOnOk: any = null;
  function openHideConfirmModal(onOk?: any) {
    hideConfirmOnOk = onOk;
    hideConfirmModal.hidden = false;
  }
  function closeHideConfirmModal() { hideConfirmModal.hidden = true; hideConfirmOnOk = null; }
  $('hideConfirmCancelBtn').addEventListener('click', closeHideConfirmModal);
  $('hideConfirmOkBtn').addEventListener('click', () => {
    const onOk = hideConfirmOnOk;
    closeHideConfirmModal();
    if (onOk) onOk();
  });
  hideConfirmModal.addEventListener('mousedown', (e: any) => { if (e.target === hideConfirmModal) closeHideConfirmModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !hideConfirmModal.hidden) closeHideConfirmModal(); });
  async function onAccept(req?: any, button?: any) {
    if (req.source === 'application') { openAcceptModal(req); return; } // 웹 신청서: 동행 일시를 확인한 뒤 수락
    const summary = req.senior_name + '\n' + fmtDay(req.scheduled_at) + ' ' + fmtTime(req.scheduled_at) + '\n' +
                    (req.origin || '출발지 미입력') + ' → ' + req.destination;
    if (!confirm(summary + '\n\n이 동행 신청을 수락할까요?')) return;
    button.disabled = true;
    button.textContent = '수락 중…';
    let accepted = false;
    try {
      await api.acceptRequest(req.id);
      accepted = true;
      showToast('신청을 수락했습니다. 배정 일정에 추가되었어요.');
    } catch (err: any) {
      console.error('신청 수락 실패:', err);
      const msg = String((err && err.message) || err);
      if (msg.includes('REQUEST_UNAVAILABLE')) showToast('이미 다른 매니저가 수락했거나 취소된 신청이에요.');
      else if (msg.includes('NOT_A_MANAGER')) alert('매니저로 등록된 계정만 수락할 수 있습니다. 관리자에게 문의해 주세요.');
      else alert('신청을 수락하지 못했습니다: ' + msg);
    }
    await loadAll(); // 신청 대기 목록에서 빠지고 '배정된 일정'에 나타나도록 서버 상태 기준으로 다시 그림
    if (accepted) { activateTab('today'); $('todaySection').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  async function reloadRequests() {
    if (!data) return;
    const btn = $('requestRefreshBtn');
    btn.disabled = true;
    data.requests = await settle(api.loadRequests());
    renderRequests();
    btn.disabled = false;
  }
  $('requestRefreshBtn').addEventListener('click', reloadRequests);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadRequests(); });
  window.addEventListener('storage', (e: any) => {
    if (e.key !== SCHEDULE_PROPOSAL_KEY || !data) return;
    if (!data.assigned.error && !data.requests.error) {
      const real = data.assigned.value.filter((s: any) => !s._isLocalProposal);
      data.assigned.value = real.concat(buildLocalConfirmedSchedules(data.requests.value));
    }
    renderRequests();
    renderToday();
  });
  function scheduleRank(s?: any) { return s.status === 'completed' ? 1 : 0; }
  function sortScheduleList(items?: any) {
    return items.slice().sort((a: any, b: any) => {
      const ra = scheduleRank(a), rb = scheduleRank(b);
      if (ra !== rb) return ra - rb;
      return new Date(a.scheduled_at) - new Date(b.scheduled_at);
    });
  }
  let pastUnverifiedExpanded = false;
  function renderToday() {
    const box = $('todayList');
    $('todayBadge').textContent = fmtDay(new Date());
    if (data.assigned.error) {
      errorBox(box, data.assigned.error, loadAll); updateActivityBadge(null); updatePastUnverifiedAlert(0);
      $('todayTabLabel').textContent = '오늘 (0)'; moveTabPill();
      return;
    }
    const all = data.assigned.value;
    if (all.length === 0) {
      emptyBox(box, '배정된 케어 일정이 없습니다', '위 「배정 신청 대기」 탭에서 신청을 수락하면 이곳에 바로 나타나요.');
      updateActivityBadge([]);
      updatePastUnverifiedAlert(0);
      $('todayTabLabel').textContent = '오늘 (0)'; moveTabPill();
      return;
    }
    const todayStart = kstMidnight(0);
    const tomorrow = kstMidnight(1);
    const todayItems = sortScheduleList(all.filter((s: any) => {
      const t = new Date(s.scheduled_at).getTime();
      return t >= todayStart.getTime() && t < tomorrow.getTime();
    }));
    const pastUnverified = sortScheduleList(all.filter((s: any) =>
      new Date(s.scheduled_at).getTime() < todayStart.getTime() && s.status !== 'completed'
    ));
    const upcoming = all.filter((s: any) => new Date(s.scheduled_at).getTime() >= tomorrow.getTime());    // 내일 이후
    updateActivityBadge(todayItems);
    updatePastUnverifiedAlert(pastUnverified.length);
    $('todayTabLabel').textContent = '오늘 (' + todayItems.length + ')';
    moveTabPill(); // 탭 글자 폭이 건수에 따라 바뀌므로 필 위치도 다시 맞춰야 함
    box.textContent = '';
    const build = (items, isUpcoming, showDayTag, showOverdueBadge) => {
      const ul = h('ul', 'list');
      items.forEach((s: any) => {
        const li = h('li');
        li.appendChild(scheduleCard(s, isUpcoming, showDayTag, showOverdueBadge));
        ul.appendChild(li);
      });
      return ul;
    };
    if (pastUnverified.length || upcoming.length) box.appendChild(h('p', 'group-label', '오늘 · ' + todayItems.length + '건'));
    if (todayItems.length) {
      const visible = todayItems.slice(0, SCHEDULE_VISIBLE_COUNT);
      const rest = todayItems.slice(SCHEDULE_VISIBLE_COUNT);
      box.appendChild(build(visible, false));
      if (rest.length) {
        const moreContainer = h('div', 'schedule-more-container');
        moreContainer.style.display = 'none';
        moreContainer.appendChild(build(rest, false));
        box.appendChild(moreContainer);
        const moreBtn = h('button', 'schedule-more-btn');
        moreBtn.type = 'button';
        const moreLabel = h('span', '', '');
        const chevron = svgChevronDown('chevron');
        moreBtn.append(moreLabel, chevron);
        const setLabel = (expanded: any) => {
          moreLabel.textContent = expanded ? '오늘 케어 일정 접기' : '오늘 케어 일정 ' + rest.length + '건 더보기';
        };
        setLabel(false);
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.addEventListener('click', () => {
          const expanded = moreContainer.style.display === 'none';
          moreContainer.style.display = expanded ? 'block' : 'none';
          if (expanded) requestAnimationFrame(() => moreContainer.classList.add('is-visible'));
          else moreContainer.classList.remove('is-visible');
          moreBtn.classList.toggle('is-open', expanded);
          moreBtn.setAttribute('aria-expanded', String(expanded));
          setLabel(expanded);
        });
        box.appendChild(moreBtn);
      }
    } else {
      const e = h('div', 'empty');
      e.appendChild(h('strong', '', '오늘 진행할 케어 일정은 없어요'));
      e.appendChild(h('span', '', '아래 다가오는 일정을 확인해 주세요.'));
      box.appendChild(e);
    }
    if (pastUnverified.length) {
      const warnLabel = h('p', 'group-label is-warn', '미인증 케어(지난 일정) · ' + pastUnverified.length + '건');
      warnLabel.id = 'pastUnverifiedAnchor';
      box.appendChild(warnLabel);
      const pastContainer = h('div', 'schedule-more-container');
      pastContainer.id = 'pastUnverifiedContainer';
      pastContainer.style.display = pastUnverifiedExpanded ? 'block' : 'none';
      if (pastUnverifiedExpanded) pastContainer.classList.add('is-visible');
      pastContainer.appendChild(build(pastUnverified, false, true, true));
      box.appendChild(pastContainer);
      const pastToggleBtn = h('button', 'schedule-more-btn is-warn');
      pastToggleBtn.type = 'button';
      pastToggleBtn.id = 'pastUnverifiedToggleBtn';
      const pastToggleLabel = h('span', '', '');
      pastToggleBtn.append(pastToggleLabel, svgChevronDown('chevron'));
      const setPastLabel = (expanded: any) => {
        pastToggleLabel.textContent = expanded ? '미인증 케어 접기' : '미인증 케어 ' + pastUnverified.length + '건 보기';
      };
      setPastLabel(pastUnverifiedExpanded);
      pastToggleBtn.classList.toggle('is-open', pastUnverifiedExpanded);
      pastToggleBtn.setAttribute('aria-expanded', String(pastUnverifiedExpanded));
      pastToggleBtn.addEventListener('click', () => {
        const expanded = pastContainer.style.display === 'none';
        pastUnverifiedExpanded = expanded; // 다음 renderToday() 재호출(인증 제출 등) 때도 이 상태를 그대로 복원
        pastContainer.style.display = expanded ? 'block' : 'none';
        if (expanded) requestAnimationFrame(() => pastContainer.classList.add('is-visible'));
        else pastContainer.classList.remove('is-visible');
        pastToggleBtn.classList.toggle('is-open', expanded);
        pastToggleBtn.setAttribute('aria-expanded', String(expanded));
        setPastLabel(expanded);
      });
      box.appendChild(pastToggleBtn);
    }
    if (upcoming.length) {
      box.appendChild(h('p', 'group-label', '다가오는 배정 일정 · ' + upcoming.length + '건'));
      box.appendChild(build(upcoming, true));
    }
  }
  function scheduleCard(s?: any, isUpcoming?: any, showDayTag?: any, showOverdueBadge?: any) {
    const cur = ORDER.indexOf(s.status);
    const card = h('div', 'sched-compact' + (s.status === 'completed' ? ' is-completed' : ''));
    card.dataset.scheduleId = s.id; // 출발 인증 지오펜싱(renderGeofenceSlots)이 카드를 다시 찾아 들어가는 키
    const isReported = s.status === 'completed' && reportedIds().has(s.id);
    const isSettling = s.status === 'completed' && !isReported && settlementRequestedIds.has(s.id);
    let chipTone = s.status, chipLabel = STATUS_TEXT[s.status] || s.status;
    if (s._isLocalProposal) { chipTone = 'assigned'; chipLabel = '제안 확정 · 로컬'; }
    else if (isSettling) { chipTone = 'settlement'; chipLabel = '정산 대기 중'; }
    else if (isReported) { chipTone = 'completed'; chipLabel = '리포트 제출 완료'; }
    const head = h('div', 'sched-head');
    head.appendChild(h('div', 'sched-avatar', (s.senior_name || '어').charAt(0)));
    const headInfo = h('div', 'sched-head-info');
    headInfo.appendChild(h('span', 'sched-time-lg', fmtTime(s.scheduled_at)));
    const senior = h('span', 'sched-senior');
    senior.appendChild(h('b', '', seniorLabel(s)));
    senior.append(' (' + (s.guardian_name || '보호자') + ')' + ((isUpcoming || showDayTag) ? ' · ' + dayTag(s.scheduled_at) : ''));
    headInfo.appendChild(senior);
    head.appendChild(headInfo);
    const headBadges = h('div', 'sched-head-badges');
    headBadges.appendChild(h('span', 'status-tag st-' + chipTone, chipLabel));
    if (showOverdueBadge) {
      const overdueDays = daysOverdueFromToday(s.scheduled_at);
      if (overdueDays != null) {
        headBadges.appendChild(h('span', 'overdue-badge' + (overdueDays >= 3 ? ' is-danger' : ''), overdueDays + '일 경과'));
      }
    }
    head.appendChild(headBadges);
    card.appendChild(head);
    const routeBox = h('div', 'sched-route-box');
    const addRouteRow = (label: any, address: any) => {
      const row = h('div', 'sched-route-row');
      row.appendChild(h('span', 'sched-route-label', label));
      const valueLine = h('div', 'sched-route-value-line');
      valueLine.appendChild(h('span', 'sched-route-value', address || '주소 미입력'));
      if (address) {
        const navBtn = h('a', 'sched-nav-btn', '길안내');
        navBtn.href = 'https://map.kakao.com/link/search/' + encodeURIComponent(address);
        navBtn.target = '_blank';
        navBtn.rel = 'noopener noreferrer';
        valueLine.appendChild(navBtn);
      }
      row.appendChild(valueLine);
      routeBox.appendChild(row);
    };
    addRouteRow('출발', s.origin);
    addRouteRow('도착', s.destination);
    card.appendChild(routeBox);
    const det = parseScheduleNotes(s.notes);
    const detail = h('div', 'sched-detail');
    const addDetailRow = (label: any, value: any) => {
      const row = h('div', 'sched-detail-row');
      row.appendChild(h('span', 'sched-detail-label', label));
      row.appendChild(h('span', 'sched-detail-value', value));
      detail.appendChild(row);
    };
    if (det.service || s.service_type) addDetailRow('서비스', det.service || s.service_type);
    if (det.when) addDetailRow('희망 일시', det.when);
    if (det.mobility) addDetailRow('거동 상태', det.mobility);
    if (det.purpose) addDetailRow('세부 목적', det.purpose);
    addDetailRow('요청 사항', det.note || '요청사항 없음');
    card.appendChild(detail);
    const actionBar = h('div', 'sched-action-bar');
    if (s.guardian_phone) {
      const tel = h('a', 'sched-tel-btn', '보호자 연락처');
      tel.href = 'tel:' + s.guardian_phone.replace(/[^0-9+]/g, '');
      actionBar.appendChild(tel);
    } else {
      const disabledTel = h('span', 'sched-tel-btn is-disabled', '연락처 미등록');
      actionBar.appendChild(disabledTel);
    }
    if (isUpcoming) { card.appendChild(actionBar); return card; }
    if (s._isLocalProposal) {
    } else if (s.status === 'completed') {
      if (isReported) {
        actionBar.appendChild(h('span', 'action-btn is-done', '리포트 제출됨'));
      } else {
        const btn = h('button', 'action-btn is-accent', '리포트 작성 및 제출');
        btn.type = 'button';
        btn.addEventListener('click', () => openReportModal(s));
        actionBar.appendChild(btn);
      }
    } else {
      const issueBtn = h('button', 'sched-tel-btn sched-issue-btn', '이슈 보고');
      issueBtn.type = 'button';
      issueBtn.addEventListener('click', () => openCareIssueModal(s));
      actionBar.appendChild(issueBtn);
      const next = FLOW[cur]; // 다음 단계 (배정됨→출발, 이동 중→병원 도착, 병원 도착→진료/대행 완료, 진료/대행 완료→귀가 이동, 귀가 이동→케어 완료)
      if (next && next.key === 'departed') {
        const slot = h('div', 'geofence-slot');
        slot.hidden = true;
        card.appendChild(slot);
      }
      const btn = h('button', 'action-btn' + (next && next.key === 'completed' ? ' is-accent' : '') + (next && next.key === 'departed' ? ' sched-main-action-btn' : ''), ACTION_BTN_TEXT[next.key]);
      btn.type = 'button';
      btn.addEventListener('click', () => onAdvance(s, next, btn));
      actionBar.appendChild(btn);
    }
    card.appendChild(actionBar);
    return card;
  }
  function onAdvance(schedule?: any, step?: any, button?: any) {
    if (step.key === 'completed') {
      openCompleteModal(schedule, step, button);
      return;
    }
    openDepartureModal(schedule, step, button);
  }
  const CARE_CHECKPOINTS_KEY = 'wb_care_checkpoints';
  const careCheckpointsChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('wb_care_checkpoints') : null;
  function saveCareCheckpoint(scheduleId?: any, checkpoint?: any) {
    if (!scheduleId) return;
    let all: any = {};
    try { all = JSON.parse(localStorage.getItem(CARE_CHECKPOINTS_KEY) || '{}'); } catch (e: any) { /* 손상된 값은 새로 시작 */ }
    all[scheduleId] = Object.assign({}, all[scheduleId], checkpoint);
    const persisted = (WBPrivacy && WBPrivacy.stripCheckpointPii) ? WBPrivacy.stripCheckpointPii(all) : {};
    try { localStorage.setItem(CARE_CHECKPOINTS_KEY, JSON.stringify(persisted)); }
    catch (e: any) { /* 사생활 보호 모드 등으로 저장이 안 돼도 완료 처리 자체는 계속 진행 */ }
    if (careCheckpointsChannel) {
      try { careCheckpointsChannel.postMessage({ scheduleId, entry: all[scheduleId] }); }
      catch (e: any) { /* 구조화 복제가 안 되는 값이 섞여도(이론상 없음) 로컬 저장은 이미 끝났으므로 무시 */ }
    }
  }
  async function recordCheckpoint(schedule?: any, stepKey?: any, location?: any, photo?: any) {
    const at = new Date().toISOString();
    let saved = true;
    if (!CHECKPOINT_STEPS.some((s: any) => s.key === stepKey)) {
      saved = false;
      console.error('[체크포인트] 잘못된 step 값 — care_checkpoints_step_check 제약 위반이 예상되어 저장을 건너뜁니다. stepKey =', stepKey,
        '(허용값:', CHECKPOINT_STEPS.map((s: any) => s.key), ')');
    } else {
      try {
        const row = await api.saveCheckpoint(schedule.id, stepKey, location, photo);
        console.log('[체크포인트] care_checkpoints 저장 완료:', {
          schedule_id: schedule.id, step: stepKey,
          lat: row && row.lat, lng: row && row.lng, accuracy: row && row.accuracy,
          has_photo: !!(row && row.photo_url), checkpoint_at: row && row.checkpoint_at
        });
      } catch (err: any) {
        saved = false;
        console.error('[체크포인트] care_checkpoints 저장 실패 — step =', stepKey, ', schedule_id =', schedule.id,
          ', 에러 코드:', err && err.code, ', 메시지:', err && err.message, '(sql/care_checkpoints_hardening.sql 을 ' +
          'Supabase SQL Editor 에서 실행해 컬럼/제약을 보강해 주세요 — 테이블이 예전 스키마로 이미 만들어져 ' +
          '있으면 "create table if not exists" 는 컬럼을 덮어쓰지 않습니다):', err);
      }
    }
    const entry = { at, location: location || null, photo: photo || null };
    schedule._checkpoints = schedule._checkpoints || {};
    schedule._checkpoints[stepKey] = entry;
    saveCareCheckpoint(schedule.id, { checkpoints: { [stepKey]: entry } });
    return saved;
  }
  const completeModal = $('completeModal');
  const completeActualEnd = $('completeActualEnd');
  const completeEarlyInfoBox = $('completeEarlyInfoBox');
  const completeOverReasonField = $('completeOverReasonField');
  const completeOverReason = $('completeOverReason');
  const completeOverReasonEtcField = $('completeOverReasonEtcField');
  const completeOverReasonEtc = $('completeOverReasonEtc');
  const completeProofBox = $('completeProofBox');
  const completeProofInput = $('completeProofInput');
  const completeProofDropText = $('completeProofDropText');
  const completePhysicianNotes = $('completePhysicianNotes');
  const completeNextVisitDate = $('completeNextVisitDate');
  const completeConditionChip = createChipGroup($('completeConditionChipGroup'));
  const completeMobilityChip = createChipGroup($('completeMobilityChipGroup'));
  const completeSeniorCondition = $('completeSeniorCondition');
  const completePhotoUploader = createPhotoUploader($('completePhotoInput'), $('completePhotoGrid'), $('completePhotoCount'));
  const completeFormError = $('completeFormError');
  let completeState: any = null; // { schedule, step, button }
  const COMPLETE_END_PILL_TEXT: Record<string, any> = { early: '조기 종료', ontime: '정시 완료', over: '초과 시간' };
  const COMPLETE_END_OPTIONS = [
    { value: '-60', label: '11:00 (-1시간)', tone: 'early' },
    { value: '-30', label: '11:30 (-30분)', tone: 'early' },
    { value: '0', label: '12:00 (정시 완료)', tone: 'ontime' },
    { value: '30', label: '12:30 (+30분)', tone: 'over' },
    { value: '60', label: '13:00 (+1시간)', tone: 'over' },
    { value: '90', label: '13:30 (+1시간 30분)', tone: 'over' }
  ];
  const COMPLETE_REASON_OPTIONS = [
    { value: '', label: '선택 안 함' },
    { value: 'hospital_wait', label: '병원 진료/수납 대기 지연' },
    { value: 'pharmacy_wait', label: '약국 처방 대기' },
    { value: 'senior_care', label: '어르신 상태 보살핌/이동 지연' },
    { value: 'etc', label: '기타 (직접 입력)' }
  ];
  function buildCustomDropdown(selectEl?: any, triggerEl?: any, menuEl?: any, options?: any, defaultValue?: any) {
    selectEl.textContent = '';
    options.forEach((o: any) => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      selectEl.appendChild(opt);
    });
    selectEl.value = defaultValue;
    menuEl.textContent = '';
    const textEl = triggerEl.querySelector<any>('.cdrop-trigger-text');
    const pillEl = triggerEl.querySelector<any>('.cdrop-pill');
    const items = options.map((o: any) => {
      const li = h('li', 'cdrop-option');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.dataset.value = o.value;
      li.appendChild(h('span', '', o.label));
      if (pillEl && o.tone) li.appendChild(h('span', 'cdrop-pill tone-' + o.tone, COMPLETE_END_PILL_TEXT[o.tone]));
      li.addEventListener('click', () => selectValue(o.value));
      li.addEventListener('keydown', onOptionKeydown);
      menuEl.appendChild(li);
      return li;
    });
    function sync() {
      const opt = options.find((o: any) => o.value === selectEl.value) || options[0];
      textEl.textContent = opt ? opt.label : '';
      if (pillEl) {
        if (opt && opt.tone) { pillEl.hidden = false; pillEl.textContent = COMPLETE_END_PILL_TEXT[opt.tone]; pillEl.className = 'cdrop-pill tone-' + opt.tone; }
        else pillEl.hidden = true;
      }
      items.forEach((li: any) => {
        const selected = li.dataset.value === selectEl.value;
        li.classList.toggle('is-selected', selected);
        li.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
    }
    function isOpen() { return menuEl.classList.contains('is-open'); }
    function open() {
      if (triggerEl.disabled || isOpen()) return;
      menuEl.classList.add('is-open');
      triggerEl.classList.add('is-open');
      triggerEl.setAttribute('aria-expanded', 'true');
      const current = items.find((li: any) => li.dataset.value === selectEl.value) || items[0];
      if (current) current.focus();
      document.addEventListener('mousedown', onOutsideClick);
    }
    function close() {
      if (!isOpen()) return;
      menuEl.classList.remove('is-open');
      triggerEl.classList.remove('is-open');
      triggerEl.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutsideClick);
    }
    function onOutsideClick(e?: any) {
      if (!triggerEl.contains(e.target) && !menuEl.contains(e.target)) close();
    }
    function selectValue(value?: any) {
      if (selectEl.value !== value) {
        selectEl.value = value;
        selectEl.dispatchEvent(new Event('change'));
      }
      close();
      triggerEl.focus();
    }
    function onOptionKeydown(e?: any) {
      const idx = items.indexOf(e.currentTarget);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectValue(e.currentTarget.dataset.value); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); triggerEl.focus(); }
      else if (e.key === 'Tab') { close(); }
    }
    triggerEl.addEventListener('click', () => { isOpen() ? close() : open(); });
    triggerEl.addEventListener('keydown', (e: any) => {
      if (!isOpen() && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); }
      else if (isOpen() && e.key === 'Escape') { e.preventDefault(); close(); }
    });
    selectEl.addEventListener('change', sync);
    sync();
    return {
      setValue(value) { selectEl.value = value; sync(); },
      setDisabled(disabled) { triggerEl.disabled = disabled; selectEl.disabled = disabled; if (disabled) close(); }
    };
  }
  const completeEndDropdown = buildCustomDropdown(completeActualEnd, $('completeActualEndTrigger'), $('completeActualEndMenu'), COMPLETE_END_OPTIONS, '0');
  const completeReasonDropdown = buildCustomDropdown(completeOverReason, $('completeOverReasonTrigger'), $('completeOverReasonMenu'), COMPLETE_REASON_OPTIONS, '');
  function updateCompleteOverageUI() {
    const overMinutes = Number(completeActualEnd.value || 0);
    const isEarly = overMinutes < 0;
    const needsReasonAndProof = overMinutes >= 30;
    completeEarlyInfoBox.hidden = !isEarly;
    completeOverReasonField.hidden = !needsReasonAndProof;
    completeReasonDropdown.setDisabled(!needsReasonAndProof);
    if (!needsReasonAndProof) {
      completeReasonDropdown.setValue('');
      completeOverReasonEtcField.hidden = true;
      completeOverReasonEtc.value = '';
    }
    completeProofBox.hidden = !needsReasonAndProof;
    completeProofBox.classList.toggle('is-required', needsReasonAndProof);
    completeProofInput.disabled = !needsReasonAndProof;
    if (!needsReasonAndProof) {
      completeProofInput.value = '';
      completeProofDropText.textContent = '＋ 병원 영수증 / 대기표 사진 첨부하기';
    }
    completeFormError.hidden = true;
  }
  completeActualEnd.addEventListener('change', updateCompleteOverageUI);
  completeOverReason.addEventListener('change', () => {
    completeOverReasonEtcField.hidden = completeOverReason.value !== 'etc';
    if (completeOverReason.value !== 'etc') completeOverReasonEtc.value = '';
  });
  completeProofInput.addEventListener('change', () => {
    const file = completeProofInput.files && completeProofInput.files[0];
    completeProofDropText.textContent = file ? '✓ ' + file.name : '＋ 병원 영수증 / 대기표 사진 첨부하기';
    completeFormError.hidden = true;
  });
  function openCompleteModal(schedule?: any, step?: any, button?: any) {
    completeState = { schedule, step, button };
    $('completeTarget').textContent = fmtTime(schedule.scheduled_at) + ' · ' + (schedule.senior_name || '어르신') + ' (' + (schedule.guardian_name || '보호자') + ')';
    completeEndDropdown.setValue('0');
    completeReasonDropdown.setValue('');
    completeOverReasonEtcField.hidden = true;
    completeOverReasonEtc.value = '';
    completeProofInput.value = '';
    completeProofDropText.textContent = '＋ 병원 영수증 / 대기표 사진 첨부하기';
    completePhysicianNotes.value = '';
    completeNextVisitDate.value = '';
    completeConditionChip.reset();
    completeMobilityChip.reset();
    completeSeniorCondition.value = '';
    completePhotoUploader.reset();
    completeFormError.hidden = true;
    updateCompleteOverageUI();
    completeModal.hidden = false;
  }
  function closeCompleteModal() { completeModal.hidden = true; completeState = null; }
  $('completeCancelBtn').addEventListener('click', closeCompleteModal);
  completeModal.addEventListener('mousedown', (e: any) => { if (e.target === completeModal) closeCompleteModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !completeModal.hidden) closeCompleteModal(); });
  $('completeSubmitBtn').addEventListener('click', async (event: any) => {
    event.preventDefault();
    if (!completeState) return;
    const overMinutes = Number(completeActualEnd.value || 0);
    if (overMinutes >= 30 && !(completeProofInput.files && completeProofInput.files[0])) {
      completeFormError.textContent = '30분 이상 초과된 건은 증빙 자료(영수증/대기표 사진)를 첨부해 주세요.';
      completeFormError.hidden = false;
      return;
    }
    if (completeOverReason.value === 'etc' && !completeOverReasonEtc.value.trim()) {
      completeFormError.textContent = '기타 사유를 직접 입력해 주세요.';
      completeFormError.hidden = false;
      return;
    }
    const physicianNotes = completePhysicianNotes.value.trim();
    const seniorCondition = completeSeniorCondition.value.trim();
    if (!physicianNotes) {
      alert('보호자에게 전달할 진료 소견을 작성해 주세요.');
      completePhysicianNotes.focus();
      return; // 모달을 닫지 않고 그대로 유지 — 작성 전에는 완료 처리로 넘어가지 않습니다.
    }
    if (!completeConditionChip.value || !completeMobilityChip.value) {
      alert('어르신 컨디션과 보행 상태를 선택해 주세요.');
      return;
    }
    const { schedule, step, button } = completeState;
    const submitBtn = event.currentTarget;
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '처리 중…';
    completeFormError.hidden = true;
    try {
      await api.submitReport(schedule.id, physicianNotes, seniorCondition, {
        conditionTags: [completeConditionChip.value, completeMobilityChip.value],
        nextVisitDate: completeNextVisitDate.value || null,
        photos: completePhotoUploader.value
      });
      await performAdvance(schedule, step, button, true, null, null);
      if (schedule.status !== step.key) return; // performAdvance 가 내부적으로 실패를 알리고 이미 재동기화함 — 모달은 열어 둔 채 재시도할 수 있게 둡니다.
      try {
        await api.reportDuration(schedule.id, 120 + overMinutes);
      } catch (durationErr: any) {
        console.error('[케어 완료] 초과 요금 자동 산정 실패:', durationErr);
        showToast('완료 처리는 끝났지만 초과 요금 자동 계산에는 실패했어요. 필요하면 관리자에게 수동 청구를 요청해 주세요.');
      }
      settlementRequestedIds.add(schedule.id); // 정산 요청 전송 완료 → 카드 뱃지를 '정산 대기 중'으로 전환
      closeCompleteModal();
    } catch (err: any) {
      console.error('케어 리포트 저장 실패:', err);
      completeFormError.textContent = '케어 리포트 저장에 실패했습니다: ' + (err.message || err);
      completeFormError.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
  async function performAdvance(schedule?: any, step?: any, button?: any, needsFullReload?: any, location?: any, photo?: any, authInfo?: any) {
    button.disabled = true;
    try {
      let verificationSkipped = false; // true: RPC 미배포로 위치/사진 없이 상태만 저장됨(verifyAdvance() fallback 참고)
      if (step.key === 'departed' || step.key === 'arrived') {
        const result = await api.verifyAdvance(schedule.id, step.key, location, photo,
          authInfo && authInfo.method, authInfo && authInfo.reason); // 인증 데이터와 함께 저장 → 보호자 화면에서 그대로 보여 줌
        verificationSkipped = !!(result && result._verificationSkipped);
        if (step.key === 'departed') {
          schedule.departed_at = (result && result.departed_at) || new Date().toISOString();
          schedule.departed_location = (result && result.departed_location) || location || null;
          schedule.departed_photo = (result && result.departed_photo) || photo || null;
          schedule.departure_auth_method = (result && result.departure_auth_method) || (authInfo && authInfo.method) || null;
          schedule.departure_auth_reason = (result && result.departure_auth_reason) || (authInfo && authInfo.reason) || null;
        } else {
          schedule.arrived_at = (result && result.arrived_at) || new Date().toISOString();
          schedule.arrived_location = (result && result.arrived_location) || location || null;
          schedule.arrived_photo = (result && result.arrived_photo) || photo || null;
        }
      } else {
        await api.advance(schedule.id, step.key);
      }
      schedule.status = step.key; // 성공 시 화면에도 바로 반영 (보호자 화면은 DB update 를 Realtime Postgres Changes 로 직접 구독해 반영 — supabase-guardian-realtime.sql 참고)
      console.log('[Manager] Updated status:', step.key, '| schedule id:', schedule.id, '| verificationSkipped:', verificationSkipped);
      const checkpointKey = {
        departed: 'departure', arrived: 'hospital_arrival', treatment_done: 'treatment_complete',
        returning: 'return_departure', completed: 'return_complete'
      }[step.key];
      const checkpointSaved = checkpointKey ? await recordCheckpoint(schedule, checkpointKey, location, photo) : true;
      if (verificationSkipped) {
        showToast('"' + step.label + '" 상태로 업데이트했지만, 위치/사진은 저장하지 못했어요. 관리자에게 DB 설정을 요청해 주세요.');
      } else if (!checkpointSaved) {
        showToast('"' + step.label + '" 상태로 업데이트했지만, 동행 타임라인 기록(care_checkpoints)은 저장하지 못했어요. 콘솔 로그를 확인하거나 관리자에게 문의해 주세요.');
      } else {
        showToast(step.key === 'completed' ? '케어 완료 처리와 케어 리포트 전달을 모두 마쳤습니다.' : '"' + step.label + '" 상태로 업데이트했습니다.');
      }
      if (needsFullReload) await loadAll();
      else renderToday();
    } catch (err: any) {
      console.error('상태 업데이트 실패:', err);
      alert('상태를 업데이트하지 못했습니다: ' + (err.message || err));
      await loadAll(); // 실패 시 서버 상태 기준으로 다시 동기화
    }
  }
  const departureModal = $('departure-modal');
  let depState: any = null; // { schedule, step, button, location, photo }
  function updateDepSubmitState() {
    const btn = $('btn-submit-departure');
    if (!depState) { btn.disabled = true; return; }
    if (depState.step.key !== 'arrived') {
      btn.disabled = !(depState.location || depState.photo);
      return;
    }
    btn.disabled = !(depState.gpsStrongOk || depState.photo);
  }
  function openDepartureModal(schedule?: any, step?: any, button?: any) {
    depState = { schedule, step, button, location: null, photo: null, rawPhoto: null, gpsStrongOk: false, distance: null, locationUnverifiable: false };
    $('departureModalTitle').textContent = step.label + ' 인증';
    $('btn-submit-departure').textContent = '인증 완료 · ' + step.label; // FLOW 라벨과 같은 문구(출발 (이동 중)/병원 도착)로 버튼도 동기화
    $('depTargetTime').textContent = fmtTime(schedule.scheduled_at) + ' 방문 예정';
    const nameEl = $('depTargetName');
    nameEl.textContent = '';
    nameEl.append((schedule.senior_name || '어르신') + ' ');
    nameEl.appendChild(h('small', '', '(' + (schedule.guardian_name || '보호자') + ')'));
    const needsTargetAddr = step.key === 'departed' || step.key === 'arrived';
    $('depTargetAddrRow').hidden = !needsTargetAddr;
    if (needsTargetAddr) {
      $('depTargetAddrLabel').textContent = step.key === 'departed' ? '출발지 주소 ' : '목적지 주소 ';
      $('depTargetAddress').textContent = step.key === 'departed' ? (schedule.origin || '출발지 미입력') : (schedule.destination || '목적지 미입력');
    }
    $('gps-icon').classList.remove('spin');
    $('gps-btn-text').textContent = '현재 위치 측정하기';
    $('btn-get-gps').disabled = false;
    $('gps-success-box').classList.add('hidden');
    $('gps-success-box').classList.remove('is-warn');
    setGpsStatusIcon('ok');
    $('gps-error-text').classList.add('hidden');
    $('input-camera').value = '';
    $('photo-status-text').innerHTML = '<strong>터치하여 카메라로 촬영</strong> (실시간 촬영 전용)';
    $('dep-photo-guide').hidden = step.key !== 'arrived'; // 병원 도착 인증에서만 촬영 가이드(간판·접수처·층수 안내판) 노출
    updateDepSubmitState();
    departureModal.classList.remove('hidden');
  }
  function closeDepartureModal() { departureModal.classList.add('hidden'); depState = null; }
  $('btn-close-modal').addEventListener('click', closeDepartureModal);
  $('btn-cancel-modal').addEventListener('click', closeDepartureModal);
  departureModal.addEventListener('mousedown', (e: any) => { if (e.target === departureModal) closeDepartureModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !departureModal.classList.contains('hidden')) closeDepartureModal(); });
  function setGpsStatusIcon(kind?: any) {
    $('gpsStatusIcon').innerHTML = kind === 'warn'
      ? '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>'
      : '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
  }
  function highlightPhotoMethod() {
    const drop = $('dep-photo-drop');
    drop.classList.remove('is-suggested'); // 애니메이션 재시작을 위해 한 번 떼었다가 다시 붙임
    void drop.offsetWidth;
    drop.classList.add('is-suggested');
    $('dep-photo-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => drop.classList.remove('is-suggested'), 3000);
  }
  $('btn-get-gps').addEventListener('click', async () => {
    if (!depState) return;
    const btn = $('btn-get-gps');
    const errEl = $('gps-error-text');
    errEl.classList.add('hidden');
    if (!('geolocation' in navigator)) {
      errEl.textContent = '이 기기·브라우저는 위치 확인을 지원하지 않아요. 아래 "방법 2. 현장 사진 촬영"으로 인증해 주세요.';
      errEl.classList.remove('hidden');
      highlightPhotoMethod();
      return;
    }
    btn.disabled = true;
    $('gps-icon').classList.add('spin');
    $('gps-btn-text').textContent = '위치 수신 중...';
    let pos: any;
    try {
      pos = await getCurrentPositionAsync({ enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 });
    } catch (err: any) {
      if (IS_LOCAL_DEV) {
        console.warn('[GPS] localhost 개발 환경 → 위치 확인 실패를 무시하고 테스트 기본 좌표(서울시청)로 진행합니다:', err.message || err);
        pos = { coords: DEV_FALLBACK_COORDS };
      } else {
        btn.disabled = false;
        $('gps-icon').classList.remove('spin');
        $('gps-btn-text').textContent = '현재 위치 측정하기';
        const timedOut = err.code === err.TIMEOUT;
        const deniedPermission = err.code === err.PERMISSION_DENIED;
        errEl.textContent = (
          timedOut ? '위치 확인이 너무 오래 걸려요. 실내이거나 신호가 약한 곳일 수 있어요.'
          : deniedPermission ? '위치 권한이 꺼져 있어요.'
          : '위치를 확인하지 못했어요(' + (err.message || '알 수 없는 오류') + ').'
        ) + ' 아래 "방법 2. 현장 사진 촬영"으로 인증해 주세요.';
        errEl.classList.remove('hidden');
        highlightPhotoMethod();
        return;
      }
    }
    const lat = pos.coords.latitude, lng = pos.coords.longitude, accuracy = Math.round(pos.coords.accuracy);
    depState.location = { lat, lng, accuracy };
    depState.gpsStrongOk = false;
    $('gps-icon').classList.remove('spin');
    $('gps-btn-text').textContent = '위치 확인 완료';
    if (depState.step.key === 'treatment_done' || depState.step.key === 'returning') {
      const placeName = await reverseGeocode(lat, lng);
      const box = $('gps-success-box');
      box.classList.remove('is-warn', 'hidden');
      depState.locationUnverifiable = false;
      setGpsStatusIcon('ok');
      $('gps-address-text').textContent = '✓ 현재 위치: ' + (placeName || '위치 확인됨');
      updateDepSubmitState();
      return;
    }
    const isDeparted = depState.step.key === 'departed';
    const targetLabel = isDeparted ? '출발지' : '목적지';
    const targetAddr = isDeparted ? (depState.schedule.origin || '') : (depState.schedule.destination || '');
    const radius = isDeparted ? GPS_MATCH_RADIUS_M : ARRIVAL_RADIUS_M;
    const storedPoint = isDeparted
      ? { lat: depState.schedule.origin_lat, lng: depState.schedule.origin_lng }
      : { lat: depState.schedule.destination_lat, lng: depState.schedule.destination_lng };
    const hasStoredPoint = typeof storedPoint.lat === 'number' && typeof storedPoint.lng === 'number';
    const [placeName, liveGeocodedPoint] = await Promise.all([
      reverseGeocode(lat, lng),
      hasStoredPoint ? Promise.resolve(null) : geocodeAddress(targetAddr)
    ]);
    const targetPoint = hasStoredPoint ? storedPoint : liveGeocodedPoint;
    const box = $('gps-success-box');
    box.classList.remove('is-warn');
    depState.locationUnverifiable = false; // 아래에서 좌표를 전혀 못 구한 경우에만 true 로 바뀌어 제출을 막습니다
    if (!targetAddr) {
      depState.distance = null;
      depState.locationUnverifiable = true;
      box.classList.add('is-warn');
      setGpsStatusIcon('warn');
      $('gps-address-text').textContent = targetLabel + ' 위치 정보가 등록되지 않은 건입니다.';
    } else if (!targetPoint) {
      depState.distance = null;
      depState.locationUnverifiable = true;
      box.classList.add('is-warn');
      setGpsStatusIcon('warn');
      $('gps-address-text').textContent = targetLabel + ' 주소의 위치 정보를 찾을 수 없습니다. (올바른 주소인지 확인해주세요)';
    } else {
      const dist = Math.round(distanceMeters(lat, lng, targetPoint.lat, targetPoint.lng));
      depState.distance = dist;
      const accuracyOk = accuracy <= ARRIVAL_ACCURACY_DEGRADED_M;
      if (dist <= radius && (isDeparted || accuracyOk)) {
        depState.gpsStrongOk = !isDeparted; // 도착 인증에서만 이 값으로 SUCCESS/PENDING_REVIEW 를 가릅니다
        setGpsStatusIcon('ok');
        $('gps-address-text').textContent = '✓ 현재 위치: ' + (placeName || '위치 확인됨') + ' (' + targetLabel + '와 약 ' + dist.toLocaleString() + 'm 거리)';
      } else if (dist <= radius && !accuracyOk) {
        box.classList.add('is-warn');
        setGpsStatusIcon('warn');
        $('gps-address-text').textContent = '위치는 ' + targetLabel + '와 가깝지만 GPS 오차범위가 약 ' + accuracy + 'm 로 커서 정확하지 않을 수 있어요. ' +
          '아래 "방법 2. 현장 사진"도 함께 촬영해 주세요.';
        highlightPhotoMethod();
      } else {
        box.classList.add('is-warn');
        setGpsStatusIcon('warn');
        $('gps-address-text').textContent = targetLabel + '와 현재 위치가 ' + dist.toLocaleString() + 'm 떨어져 있습니다.' +
          (isDeparted ? ' 현장에 도착 후 다시 시도해주세요.' : ' 아래 "방법 2. 현장 사진"을 함께 촬영해 인증해 주세요.');
        if (!isDeparted) highlightPhotoMethod();
      }
    }
    box.classList.remove('hidden');
    updateDepSubmitState();
  });
  function loadImageFromFile(file?: any) {
    return new Promise((resolve: any, reject: any) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다')); };
      img.src = url;
    });
  }
  function fmtWatermarkDateTime(d?: any) {
    const p = (n: any) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  async function buildVerificationPhoto(file?: any, location?: any) {
    const img = await loadImageFromFile(file);
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / img.width);
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = w; rawCanvas.height = h;
    rawCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const rawDataUrl = rawCanvas.toDataURL('image/jpeg', 0.75);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const lines = [
      '촬영 일시: ' + fmtWatermarkDateTime(new Date()),
      location ? ('GPS: ' + location.lat.toFixed(6) + ', ' + location.lng.toFixed(6) + ' (오차 ±' + Math.round(location.accuracy) + 'm)') : 'GPS: 위치 확인 안 됨',
      '매니저: ' + displayName()
    ];
    const fontSize = Math.max(14, Math.round(w / 42));
    const lineHeight = Math.round(fontSize * 1.5);
    const padding = Math.round(fontSize * 0.7);
    const barHeight = lineHeight * lines.length + padding * 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, h - barHeight, w, barHeight);
    ctx.font = fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    lines.forEach((line: any, i: any) => ctx.fillText(line, padding, h - barHeight + padding + i * lineHeight));
    return { rawDataUrl, watermarkedDataUrl: canvas.toDataURL('image/jpeg', 0.8) };
  }
  const DEPARTURE_PHOTO_BUCKET = 'care-departure-photos'; // 비공개 버킷 — sql/private_storage_and_pii_hardening.sql
  async function uploadDeparturePhoto(scheduleId?: any, dataUrl?: any) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = scheduleId + '/' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.jpg';
    const { error } = await managerApi.uploadDeparturePhoto(supabaseClient, DEPARTURE_PHOTO_BUCKET, path, blob);
    if (error) throw error;
    const { data } = managerApi.getDeparturePhotoPublicUrl(supabaseClient, DEPARTURE_PHOTO_BUCKET, path);
    if (!data || !data.publicUrl) throw new Error('PUBLIC_URL_UNAVAILABLE');
    return data.publicUrl;
  }
  function createChipGroup(containerEl?: any) {
    const buttons = Array.from(containerEl.querySelectorAll<any>('.chip-btn'));
    let value: any = null;
    buttons.forEach((btn: any) => {
      btn.addEventListener('click', () => {
        value = btn.dataset.value;
        buttons.forEach((b: any) => b.classList.toggle('is-selected', b === btn));
      });
    });
    return {
      get value() { return value; },
      reset() { value = null; buttons.forEach((b: any) => b.classList.remove('is-selected')); }
    };
  }
  function createMultiChipGroup(containerEl?: any) {
    const buttons = Array.from(containerEl.querySelectorAll<any>('.chip-btn'));
    let values: any[] = [];
    buttons.forEach((btn: any) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.value;
        if (values.includes(v)) { values = values.filter((x: any) => x !== v); btn.classList.remove('is-selected'); }
        else { values.push(v); btn.classList.add('is-selected'); }
      });
    });
    return {
      get value() { return values.slice(); },
      reset() { values = []; buttons.forEach((b: any) => b.classList.remove('is-selected')); },
      setVisibleFor(careType) {
        buttons.forEach((b: any) => {
          const show = b.dataset.for === 'both' || b.dataset.for === careType;
          b.hidden = !show;
          if (!show && values.includes(b.dataset.value)) {
            values = values.filter((x: any) => x !== b.dataset.value);
            b.classList.remove('is-selected');
          }
        });
      }
    };
  }
  async function resizeReceiptPhoto(file?: any) {
    const img = await loadImageFromFile(file);
    const maxWidth = 1000;
    const scale = Math.min(1, maxWidth / img.width);
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.72);
  }
  function createPhotoUploader(inputEl?: any, gridEl?: any, countEl?: any) {
    let items: any[] = []; // [{ url, label: '' }]
    const addSlot = h('label', 'photo-add-slot');
    addSlot.setAttribute('for', inputEl.id);
    addSlot.setAttribute('aria-label', '사진 추가');
    addSlot.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg><span>추가</span>';
    gridEl.appendChild(addSlot);
    function render() {
      gridEl.querySelectorAll<any>('.report-photo-thumb').forEach((el: any) => el.remove());
      items.forEach((item: any, idx: any) => {
        const thumb = h('div', 'report-photo-thumb');
        const img = document.createElement('img');
        img.src = item.url; img.alt = '증빙 사진';
        const del = h('button', 'report-photo-thumb-remove', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', '사진 삭제');
        del.addEventListener('click', () => { items.splice(idx, 1); render(); });
        thumb.append(img, del);
        gridEl.appendChild(thumb);
      });
      addSlot.classList.toggle('is-full', items.length >= REPORT_PHOTO_MAX);
      if (countEl) countEl.textContent = items.length + '/' + REPORT_PHOTO_MAX;
    }
    inputEl.addEventListener('change', async () => {
      const files = Array.from(inputEl.files || []);
      for (const file of files) {
        if (items.length >= REPORT_PHOTO_MAX) break;
        try {
          const url = await resizeReceiptPhoto(file);
          items.push({ url, label: '' });
        } catch (err: any) {
          console.warn('[케어 리포트] 증빙 사진을 읽을 수 없습니다:', err);
        }
      }
      inputEl.value = '';
      render();
    });
    render();
    return {
      get value() { return items.map((item: any) => ({ url: item.url, label: item.label })); },
      reset() { items = []; render(); }
    };
  }
  $('input-camera').addEventListener('change', async () => {
    if (!depState) return;
    const file = $('input-camera').files && $('input-camera').files[0];
    if (!file) { depState.photo = null; depState.rawPhoto = null; updateDepSubmitState(); return; }
    try {
      if (!depState.location && 'geolocation' in navigator) {
        try {
          const pos = await getCurrentPositionAsync({ enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 });
          depState.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
        } catch (e: any) {
          console.warn('[현장 사진] 촬영 시점 GPS 측정 실패(사진 인증은 계속 진행):', e.message || e);
        }
      }
      const { rawDataUrl, watermarkedDataUrl } = await buildVerificationPhoto(file, depState.location);
      depState.rawPhoto = rawDataUrl;
      depState.photo = watermarkedDataUrl;
      if (depState.step.key === 'departed') {
        $('photo-status-text').textContent = '촬영 완료 — 업로드 중…';
        try {
          depState.photo = await uploadDeparturePhoto(depState.schedule.id, watermarkedDataUrl);
        } catch (uploadErr: any) {
          console.warn('[출발 인증 · 현장 사진] Storage 업로드 실패 — data URL 로 대체합니다:', uploadErr.message || uploadErr);
        }
      }
      $('photo-status-text').textContent = '촬영 완료 (인증 워터마크 적용됨)';
    } catch (err: any) {
      $('gps-error-text').textContent = '사진을 처리하지 못했어요. 다시 시도하거나 GPS로 인증해 주세요.';
      $('gps-error-text').classList.remove('hidden');
      depState.photo = null;
      depState.rawPhoto = null;
    }
    updateDepSubmitState();
  });
  async function logArrivalVerificationBestEffort(snapshot?: any) {
    try {
      const hasGps = !!snapshot.location;
      const hasPhoto = !!snapshot.photo;
      const verificationType = hasGps && hasPhoto ? 'GPS_PHOTO' : hasGps ? 'GPS' : 'PHOTO';
      const status = snapshot.gpsStrongOk ? 'SUCCESS' : 'PENDING_REVIEW'; // 방법1 만으로 반경+오차 기준을 통과했을 때만 SUCCESS
      await api.logArrivalVerification({
        scheduleId: snapshot.schedule.id,
        verificationType, status,
        lat: snapshot.location ? snapshot.location.lat : null,
        lng: snapshot.location ? snapshot.location.lng : null,
        accuracy: snapshot.location ? snapshot.location.accuracy : null,
        distance: (typeof snapshot.distance === 'number') ? snapshot.distance : null,
        watermarkedPhoto: snapshot.photo || null,
        rawPhoto: snapshot.rawPhoto || null
      });
    } catch (err: any) {
      console.warn('[병원 도착 인증 로그] arrival_verification_logs 저장 실패(도착 처리에는 영향 없음, supabase-arrival-verification-logs.sql 배포 필요할 수 있음):', err.message || err);
    }
  }
  function departureAuthInfoFromModal(snapshot?: any) {
    if (snapshot.step.key !== 'departed') return undefined;
    const distText = (typeof snapshot.distance === 'number') ? ('(거리 약 ' + snapshot.distance.toLocaleString() + 'm)') : '';
    if (snapshot.photo) {
      return {
        method: 'photo_fallback',
        reason: snapshot.location
          ? ('현장 사진으로 대체 인증' + distText)
          : '위치 확인 실패(권한 거부 또는 GPS 오류) → 현장 사진으로 대체 인증'
      };
    }
    if (snapshot.location) {
      return { method: 'manual_gps_fallback', reason: '자동 감지 배너 없이 매니저가 직접 위치를 측정해 통과' + distText };
    }
    return undefined;
  }
  $('btn-submit-departure').addEventListener('click', async (e: any) => {
    e.preventDefault();
    if (!depState) return;
    const snapshot = { ...depState };
    const submitBtn = $('btn-submit-departure');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '처리 중…';
    try {
      await performAdvance(snapshot.schedule, snapshot.step, snapshot.button, false, snapshot.location, snapshot.photo,
        departureAuthInfoFromModal(snapshot));
      if (snapshot.schedule.status !== snapshot.step.key) return;
      closeDepartureModal();
      if (snapshot.step.key === 'arrived') await logArrivalVerificationBestEffort(snapshot);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
  let calMonth: any = null;       // 지금 보고 있는 달 (해당 월 1일 0시, Date)
  let calSelectedKey: any = null; // 선택한 날짜 'YYYY-MM-DD' (달을 넘기면 초기화)
  const calDateKey = (d: any) => {
    const k = toKst(d);
    return k ? k.getUTCFullYear() + '-' + String(k.getUTCMonth() + 1).padStart(2, '0') + '-' + String(k.getUTCDate()).padStart(2, '0') : '';
  };
  function calendarSchedules() {
    const byId = new Map();
    [].concat(data.assigned.value || [], data.completed.value || []).forEach((s: any) => {
      if (s.status === 'completed') byId.set(s.id, s);
    });
    return Array.from(byId.values());
  }
  function groupScheduleByDay(list?: any) {
    const map = new Map();
    (list || []).forEach((s: any) => {
      if (!s.completed_at || isNaN(new Date(s.completed_at).getTime())) return;
      const key = calDateKey(s.completed_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    map.forEach((arr: any) => arr.sort((a: any, b: any) => new Date(a.completed_at) - new Date(b.completed_at)));
    return map;
  }
  function getPendingReports() {
    if (!data || !data.completed || !data.completed.value) return [];
    const reported = reportedIds();
    return data.completed.value
      .filter((s: any) => !reported.has(s.id))
      .sort((a: any, b: any) => new Date(b.completed_at) - new Date(a.completed_at));
  }
  function renderPendingReportsTab() {
    const box = $('pendingReportsList');
    if (!box) return;
    if (data.completed.error) { errorBox(box, data.completed.error, loadAll); return; }
    const pendingReports = getPendingReports();
    $('pendingReportsTabLabel').textContent = pendingReports.length > 0 ? '리포트 (' + pendingReports.length + ')' : '리포트';
    $(TAB_BTN_ID.pendingReports).classList.toggle('is-warn', pendingReports.length > 0);
    moveTabPill();
    if (pendingReports.length === 0) {
      emptyBox(box, '작성할 리포트가 없어요', '완료한 케어의 리포트를 모두 제출했습니다. 수고하셨어요!');
      return;
    }
    box.textContent = '';
    const list = h('div', 'report-pending-list');
    pendingReports.forEach((s: any) => list.appendChild(calCaseCard(s, null)));
    box.appendChild(list);
  }
  function renderReportCalendar() {
    const box = $('reportCalendar');
    if (data.assigned.error || data.completed.error) { errorBox(box, data.assigned.error || data.completed.error, loadAll); return; }
    if (!calMonth) calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const byDay = groupScheduleByDay(calendarSchedules());
    const year = calMonth.getFullYear(), month = calMonth.getMonth();
    box.textContent = '';
    const split = h('div', 'cal-split');
    const left = h('div', 'cal-left');
    const right = h('div', 'cal-right');
    const head = h('div', 'cal-head');
    const nav = h('div', 'cal-nav');
    const prevBtn = h('button', 'cal-nav-btn', '‹');
    prevBtn.type = 'button'; prevBtn.setAttribute('aria-label', '이전 달');
    prevBtn.addEventListener('click', () => { calMonth = new Date(year, month - 1, 1); calSelectedKey = null; renderReportCalendar(); });
    const nextBtn = h('button', 'cal-nav-btn', '›');
    nextBtn.type = 'button'; nextBtn.setAttribute('aria-label', '다음 달');
    nextBtn.addEventListener('click', () => { calMonth = new Date(year, month + 1, 1); calSelectedKey = null; renderReportCalendar(); });
    nav.append(prevBtn, h('div', 'cal-month', year + '년 ' + (month + 1) + '월'), nextBtn);
    head.appendChild(nav);
    left.appendChild(head);
    const grid = h('div', 'cal-grid');
    ['일', '월', '화', '수', '목', '금', '토'].forEach((d: any, i: any) => {
      grid.appendChild(h('div', 'cal-dow' + (i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''), d));
    });
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = calDateKey(new Date());
    for (let i = 0; i < firstDow; i++) grid.appendChild(h('div', 'cal-cell is-pad'));
    for (let day = 1; day <= daysInMonth; day++) {
      const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const items = byDay.get(key) || [];
      const dow = new Date(year, month, day).getDay();
      let cls = 'cal-cell' + (dow === 0 ? ' is-sun' : dow === 6 ? ' is-sat' : '');
      if (key === todayKey) cls += ' is-today';
      if (key === calSelectedKey) cls += ' is-selected';
      const cell = h('div', cls);
      cell.appendChild(h('span', 'cal-daynum', String(day)));
      if (items.length) cell.appendChild(h('span', 'cal-count', items.length + '건'));
      cell.addEventListener('click', () => { calSelectedKey = key; renderReportCalendar(); });
      grid.appendChild(cell);
    }
    left.appendChild(grid);
    let monthCount = 0, monthPayout = 0;
    byDay.forEach((arr: any, key: any) => {
      const [ky, km] = key.split('-').map(Number);
      if (ky === year && km === month + 1) {
        monthCount += arr.length;
        arr.forEach((s: any) => { monthPayout += (s.payout_amount || 0); });
      }
    });
    right.appendChild(h('p', 'cal-right-title', (month + 1) + '월 요약'));
    const summary = h('div', 'cal-summary-v');
    const countStat = h('span', 'cal-stat'); countStat.append('총 수행 건수', h('b', '', monthCount + '건'));
    const doneStat = h('span', 'cal-stat'); doneStat.append('완료', h('b', '', monthCount + '건'));
    const payoutStat = h('span', 'cal-stat'); payoutStat.append('예상 정산 금액', h('b', '', won(monthPayout) + '원'));
    summary.append(countStat, doneStat, payoutStat);
    right.appendChild(summary);
    split.append(left, right);
    box.appendChild(split);
    const detail = h('div', 'cal-detail');
    if (!calSelectedKey) {
      detail.appendChild(h('p', 'cal-detail-title', '날짜를 선택하면 그 날 완료한 케어를 볼 수 있어요'));
    } else {
      const [sy, sm, sd] = calSelectedKey.split('-').map(Number);
      detail.appendChild(h('p', 'cal-detail-title', sy + '년 ' + sm + '월 ' + sd + '일 완료된 케어'));
      const items = byDay.get(calSelectedKey) || [];
      if (items.length === 0) {
        detail.appendChild(h('div', 'cal-detail-empty', '해당 날짜에 완료된 케어가 없습니다.'));
      } else {
        const reportByScheduleId = new Map((data.reports.value || []).map((r: any) => [r.schedule_id, r]));
        items.forEach((s: any) => detail.appendChild(calCaseCard(s, reportByScheduleId.get(s.id))));
      }
    }
    box.appendChild(detail);
  }
  function getScheduleReview(s?: any) {
    const r = s && s.care_reviews;
    if (!r) return null;
    return Array.isArray(r) ? (r[0] || null) : r;
  }
  function calCaseCard(s?: any, report?: any) {
    const card = h('div', 'cal-case');
    const top = h('div', 'cal-case-top');
    const whenIso = s.scheduled_at || s.completed_at;
    const time = h('div', 'cal-case-time');
    time.appendChild(h('span', 'cal-case-date', fmtDateWithDow(whenIso)));
    time.appendChild(document.createTextNode(' ' + fmtTime(whenIso)));
    time.appendChild(h('small', '', s.service_type || '시니어 병원 동행'));
    top.appendChild(time);
    const badges = h('div', 'cal-case-badges');
    badges.appendChild(h('span', 'status-tag st-completed', '케어 완료'));
    if (s.payout_amount > 0) badges.appendChild(h('span', 'badge', won(s.payout_amount) + '원'));
    top.appendChild(badges);
    card.appendChild(top);
    const dl = h('dl', 'kv');
    dl.appendChild(h('dt', '', '어르신')); dl.appendChild(h('dd', '', seniorLabel(s)));
    dl.appendChild(h('dt', '', '이동 경로')); dl.appendChild(routeCell(s));
    dl.appendChild(h('dt', '', '보호자')); dl.appendChild(guardianCell(s));
    const review = getScheduleReview(s);
    if (review && review.rating) {
      dl.appendChild(h('dt', '', '보호자 평가'));
      const reviewDd = h('dd', '');
      reviewDd.appendChild(h('span', 'cal-case-stars', '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)));
      if (review.review_text) reviewDd.appendChild(h('span', 'cal-case-review-text', review.review_text));
      dl.appendChild(reviewDd);
    }
    card.appendChild(dl);
    const foot = h('div', 'sched-foot');
    if (report) {
      const viewBtn = h('button', 'btn-outline-emerald', '제출한 리포트 보기');
      viewBtn.type = 'button';
      viewBtn.addEventListener('click', () => openReportViewModal(s, report));
      foot.appendChild(viewBtn);
    } else {
      foot.appendChild(h('span', '', '아직 리포트를 작성하지 않았어요.'));
      const writeBtn = h('button', 'btn btn-sm', '케어 리포트 작성');
      writeBtn.type = 'button';
      writeBtn.addEventListener('click', () => openReportModal(s));
      foot.appendChild(writeBtn);
    }
    card.appendChild(foot);
    return card;
  }
  const acceptModal = $('acceptModal');
  const acceptError = $('acceptError');
  let acceptTarget: any = null;
  let acceptGuessedWhen: any = null; // 보호자 신청 문구에서 추정한 일시 (Date)
  const SCHEDULE_PROPOSAL_KEY = 'wb_schedule_proposals';
  const PROPOSAL_STATUS: Record<string, any> = { PROPOSED: '일정 변경 요청', CONFIRMED: '배정 완료' };
  const CONFIRMED_PROPOSAL_STATUSES = [PROPOSAL_STATUS.CONFIRMED, '일정 변경 완료'];
  function loadScheduleProposals() {
    try { return JSON.parse(localStorage.getItem(SCHEDULE_PROPOSAL_KEY) || '{}'); }
    catch (e: any) { return {}; }
  }
  function getScheduleProposal(applicationId?: any) {
    return loadScheduleProposals()[applicationId] || null;
  }
  function saveScheduleProposal(applicationId?: any, proposedDateIso?: any) {
    const all = loadScheduleProposals();
    all[applicationId] = { status: PROPOSAL_STATUS.PROPOSED, proposedDate: proposedDateIso, proposedAt: new Date().toISOString() };
    try { localStorage.setItem(SCHEDULE_PROPOSAL_KEY, JSON.stringify(all)); } catch (e: any) { /* 사생활 보호 모드 등으로 저장이 안 돼도 토스트 안내는 이미 표시됨 */ }
  }
  function buildLocalConfirmedSchedules(requests?: any) {
    const proposals = loadScheduleProposals();
    return (requests || [])
      .filter((r: any) => r.source === 'application')
      .map((r: any) => {
        const p = proposals[r.id];
        if (!p || !CONFIRMED_PROPOSAL_STATUSES.includes(p.status)) return null;
        return {
          id: 'proposal:' + r.id, _isLocalProposal: true,
          senior_name: r.senior_name, guardian_name: r.guardian_name, guardian_phone: r.guardian_phone,
          origin: r.origin, destination: r.destination, notes: r.notes,
          scheduled_at: p.proposedDate, status: 'assigned'
        };
      })
      .filter(Boolean);
  }
  function openAcceptModal(req?: any) {
    acceptTarget = req;
    acceptError.hidden = true;
    $('acceptTarget').textContent = req.service_type + ' · ' + (req.origin ? req.origin + ' → ' : '') + (req.destination || '목적지 미입력');
    acceptGuessedWhen = guessDateTime(req.when_text);
    $('acceptWhenDisplay').textContent = fmtKoreanDateTime(acceptGuessedWhen);
    $('acceptWhen').value = toLocalInput(acceptGuessedWhen); // 일정 변경 제안 폼도 같은 시각에서 시작해 조정만 하면 되게 함
    $('acceptProposePanel').hidden = true; // 매번 기본 액션(수락/제안)부터 보여 줌
    acceptModal.hidden = false;
  }
  function closeAcceptModal() { acceptModal.hidden = true; acceptTarget = null; acceptGuessedWhen = null; }
  if (window.WBDatePicker) {
    window.WBDatePicker.attach($('acceptWhen'));
    window.WBDatePicker.attach($('nextVisitDate'));
    window.WBDatePicker.attach($('completeNextVisitDate'));
  }
  $('acceptCloseBtn').addEventListener('click', closeAcceptModal);
  acceptModal.addEventListener('mousedown', (e: any) => { if (e.target === acceptModal) closeAcceptModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !acceptModal.hidden) closeAcceptModal(); });
  $('acceptProposeToggleBtn').addEventListener('click', () => {
    const panel = $('acceptProposePanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) $('acceptWhen').focus();
  });
  $('acceptProposeCancelBtn').addEventListener('click', () => { $('acceptProposePanel').hidden = true; });
  async function submitAccept(whenIso?: any, btn?: any, idleLabel?: any) {
    btn.disabled = true;
    btn.textContent = '처리 중…';
    acceptError.hidden = true;
    let accepted = false;
    try {
      await api.acceptApplication(acceptTarget.id, whenIso);
      accepted = true;
      closeAcceptModal();
      showToast('신청을 수락했습니다. 배정 일정에 추가되었어요.');
    } catch (err: any) {
      console.error('웹 신청서 수락 실패:', err);
      const msg = String((err && err.message) || err);
      if (msg.includes('REQUEST_UNAVAILABLE')) {
        closeAcceptModal();
        showToast('이미 다른 매니저가 수락했거나 취소된 신청이에요.');
      } else if (msg.includes('NOT_A_MANAGER')) {
        acceptError.textContent = '인증된 매니저만 수락할 수 있습니다. 관리자에게 문의해 주세요.';
        acceptError.hidden = false;
      } else if (err && (err.code === 'PGRST202' || err.code === '42883' || /accept_service_application/.test(msg))) {
        acceptError.textContent = '수락 기능의 DB 설정이 아직 적용되지 않았어요. 관리자에게 supabase-applications-to-manager.sql 실행을 요청해 주세요.';
        acceptError.hidden = false;
      } else {
        acceptError.textContent = '신청을 수락하지 못했습니다: ' + msg;
        acceptError.hidden = false;
      }
    }
    btn.disabled = false;
    btn.textContent = idleLabel;
    if (accepted || acceptModal.hidden) {
      await loadAll(); // 신청 대기 목록에서 빠지고 '배정된 일정'에 나타나도록 서버 상태 기준으로 다시 그림
      if (accepted) { activateTab('today'); $('todaySection').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  }
  $('acceptAsIsBtn').addEventListener('click', () => {
    if (!acceptTarget || !acceptGuessedWhen) return;
    submitAccept(acceptGuessedWhen.toISOString(), $('acceptAsIsBtn'), '이대로 수락하기');
  });
  $('acceptProposeSaveBtn').addEventListener('click', () => {
    if (!acceptTarget) return;
    const value = $('acceptWhen').value;
    const when = value ? new Date(value) : null; // datetime-local 값은 이 기기의 시간대 기준
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!when || isNaN(when.getTime())) { acceptError.textContent = '변경 희망 일시를 입력해 주세요.'; acceptError.hidden = false; return; }
    if (when < today) { acceptError.textContent = '오늘 이후의 일시를 입력해 주세요.'; acceptError.hidden = false; return; }
    acceptError.hidden = true;
    saveScheduleProposal(acceptTarget.id, when.toISOString());
    closeAcceptModal();
    showToast('일정 변경 제안을 보냈습니다. 보호자 승인 후 새 일시로 배정이 확정돼요.');
  });
  const modal = $('reportModal');
  const form = $('reportForm');
  const formError = $('reportFormError');
  const reportConditionChip = createChipGroup($('conditionChipGroup'));
  const reportMobilityChip = createChipGroup($('mobilityChipGroup'));
  const reportPhotoUploader = createPhotoUploader($('photoInput'), $('photoGrid'), $('photoCount'));
  const reportCareTypeChip = createChipGroup($('reportCareTypeGroup'));
  const reportQuickTagChip = createMultiChipGroup($('reportQuickTagGroup'));
  $('reportCareTypeGroup').querySelectorAll<any>('.chip-btn').forEach((btn: any) => {
    btn.addEventListener('click', () => {
      const careType = btn.dataset.value;
      reportQuickTagChip.setVisibleFor(careType);
      const isChild = careType === 'child';
      $('reportSeniorStatusFields').hidden = isChild;
      if (isChild) { reportConditionChip.reset(); reportMobilityChip.reset(); }
    });
  });
  function openReportModal(schedule?: any) {
    reportTarget = schedule;
    form.reset();
    $('nextVisitDate').value = ''; // wb-datepicker 가 감싼 input — form.reset() 만으로는 트리거 표시 문구가 안 지워질 수 있어 명시적으로 비움
    reportConditionChip.reset();
    reportMobilityChip.reset();
    reportPhotoUploader.reset();
    reportQuickTagChip.reset();
    $('reportMemo').value = '';
    $('reportAiMessage').value = '';
    $('reportAiHint').hidden = true;
    const defaultTypeBtn = $('reportCareTypeGroup').querySelector<any>('[data-value="senior"]');
    defaultTypeBtn.click();
    formError.hidden = true;
    $('reportTarget').textContent = schedule.senior_name + ' · ' + schedule.destination + ' (' + fmtDate(schedule.scheduled_at) + ')';
    modal.hidden = false;
  }
  function closeReportModal() { modal.hidden = true; reportTarget = null; }
  $('reportCancelBtn').addEventListener('click', closeReportModal);
  modal.addEventListener('mousedown', (e: any) => { if (e.target === modal) closeReportModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !modal.hidden) closeReportModal(); });
  $('reportAiGenerateBtn').addEventListener('click', async () => {
    const tags = reportQuickTagChip.value
      .concat(reportConditionChip.value ? [reportConditionChip.value] : [])
      .concat(reportMobilityChip.value ? [reportMobilityChip.value] : []);
    const memo = $('reportMemo').value.trim();
    const hasPhoto = reportPhotoUploader.value.length > 0;
    if (!tags.length && !memo && !hasPhoto) {
      formError.textContent = '태그를 고르거나, 사진을 첨부하거나, 메모를 입력한 뒤 눌러주세요.';
      formError.hidden = false;
      return;
    }
    formError.hidden = true;
    const btn = $('reportAiGenerateBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '생성 중…';
    try {
      const draft = await api.generateAiDraft({
        careType: reportCareTypeChip.value || 'senior',
        tags, memo, hasPhoto,
        seniorName: reportTarget && reportTarget.senior_name
      });
      $('reportAiMessage').value = draft;
      $('reportAiHint').hidden = false;
    } catch (err: any) {
      console.error('[AI 케어 리포트] 초안 생성 실패:', err);
      formError.textContent = '현재 AI 서버 연결이 원활하지 않습니다. 수동으로 내용을 확인 후 전송해 주세요.';
      formError.hidden = false;
      $('reportAiMessage').focus();
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
  const viewModal = $('reportViewModal');
  async function openReportViewModal(schedule?: any, report?: any) {
    $('reportViewTarget').textContent = (schedule.senior_name || '어르신') + ' · ' + (schedule.destination || '') +
      ' (' + fmtDate(report.created_at) + ' 제출)';
    let bucket: any = {};
    try {
      const rows = await api.loadCheckpoints([schedule.id]);
      console.table((rows || []).map((r: any) => ({
        step: r.step, checkpoint_at: r.checkpoint_at, created_at: r.created_at,
        '시각(표시)': (r.checkpoint_at || r.created_at) ? fmtTime(r.checkpoint_at || r.created_at) : '(없음)',
        lat: r.lat, lng: r.lng, has_photo: !!r.photo_url
      })));
      (rows || []).forEach((r: any) => { // 오름차순이라 뒤에 오는(=더 최근) 값이 그대로 덮어써서 최신값만 남습니다
        const key = normalizeCheckpointStep(r.step);
        if (!key) { console.warn('[제출한 리포트] 알 수 없는 step 값 — 무시합니다:', r.step); return; }
        const hasAny = r.checkpoint_at || r.created_at || r.lat != null || r.lng != null || r.photo_url;
        if (!hasAny) return; // 완전히 빈 행이 이전 값을 밀어내지 않도록
        bucket[key] = {
          at: r.checkpoint_at || r.created_at, // checkpoint_at 이 비어 있는 비정상 행만 created_at 으로 대체
          location: (r.lat != null && r.lng != null) ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy } : null,
          photo: r.photo_url || null
        };
      });
    } catch (err: any) {
      console.warn('[제출한 리포트] care_checkpoints 조회 실패:', err);
    }
    const list = $('reportViewTimeline');
    list.textContent = '';
    const steps = reportTimelineStepsFor(scheduleServiceName(schedule));
    const addresses = await Promise.all(steps.map((step: any) => {
      const loc = bucket[step.key] && bucket[step.key].location;
      return (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number')
        ? reverseGeocodeCached(loc.lat, loc.lng) : Promise.resolve(null);
    }));
    steps.forEach((step: any, i: any) => {
      const cp = bucket[step.key] || null;
      let at = cp && cp.at;
      if (!at && step.key === 'return_complete') at = schedule.completed_at || report.created_at || null;
      const done = !!(at && !isNaN(new Date(at).getTime()));
      const li = h('li', 'rv-tl-step' + (done ? ' is-done' : ' is-none'));
      const rail = h('div', 'rv-tl-rail');
      rail.appendChild(h('div', 'rv-tl-dot', done ? '✓' : String(i + 1)));
      li.appendChild(rail);
      const content = h('div', 'rv-tl-content');
      const head = h('div', 'rv-tl-head');
      head.appendChild(h('span', 'rv-tl-label', step.label));
      head.appendChild(h('span', 'rv-tl-time', done ? fmtTime(at) : '- (미기록)'));
      content.appendChild(head);
      const loc = cp && cp.location;
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        const gpsLine = h('p', 'rv-tl-gps');
        const address = addresses[i];
        const gpsText = address ? (address + ' 인근') : ('위도 ' + loc.lat.toFixed(5) + ', 경도 ' + loc.lng.toFixed(5));
        gpsLine.appendChild(h('span', 'rv-tl-gps-badge', 'GPS 인증 완료 · ' + gpsText));
        content.appendChild(gpsLine);
      }
      if (cp && cp.photo) {
        const photoBtn = h('button', 'rv-tl-photo');
        photoBtn.type = 'button';
        const img = document.createElement('img');
        img.src = cp.photo; img.alt = step.label + ' 인증 사진'; img.loading = 'lazy';
        photoBtn.append(img, h('span', '', '인증 사진 보기'));
        photoBtn.addEventListener('click', () => openPhotoLightbox(cp.photo, step.label + ' 인증 사진'));
        content.appendChild(photoBtn);
      }
      li.appendChild(content);
      list.appendChild(li);
    });
    const aiSection = $('reportViewAiSection');
    aiSection.hidden = !report.ai_message;
    if (report.ai_message) {
      const quickTagsBox = $('reportViewQuickTags');
      quickTagsBox.innerHTML = '';
      const quickTags = report.quick_tags || [];
      quickTagsBox.hidden = quickTags.length === 0;
      quickTags.forEach((t: any) => quickTagsBox.appendChild(h('span', 'rv-tag', t.startsWith('#') ? t : '#' + t)));
      const memoEl = $('reportViewMemo');
      memoEl.hidden = !report.manager_memo;
      memoEl.textContent = report.manager_memo || '';
      $('reportViewAiMessage').textContent = report.ai_message;
    }
    $('reportViewPhysicianNotesTitle').textContent = PHYSICIAN_NOTES_TITLE_BY_CAT[serviceCatFor(scheduleServiceName(schedule))];
    $('reportViewPhysicianNotes').textContent = report.physician_notes || '(작성된 내용 없음)';
    const nextVisitBox = $('reportViewNextVisitBox');
    nextVisitBox.hidden = !report.next_visit_date;
    if (report.next_visit_date) $('reportViewNextVisit').textContent = fmtDate(report.next_visit_date);
    const tagsBox = $('reportViewConditionTags');
    tagsBox.innerHTML = '';
    const tags = report.condition_tags || [];
    tagsBox.hidden = tags.length === 0;
    tags.forEach((t: any) => tagsBox.appendChild(h('span', 'rv-tag', t.startsWith('#') ? t : '#' + t)));
    $('reportViewSeniorCondition').textContent = report.senior_condition || '(작성된 내용 없음)';
    $('reportViewLegacySection').hidden = !report.physician_notes && !report.senior_condition
      && tags.length === 0 && (report.photos || []).length === 0;
    const photosSection = $('reportViewPhotosSection');
    const photoGrid = $('reportViewPhotoGrid');
    photoGrid.innerHTML = '';
    const photos = report.photos || [];
    photosSection.hidden = photos.length === 0;
    photos.forEach((p: any) => {
      const btn = h('button', 'rv-photo-thumb');
      btn.type = 'button';
      const img = document.createElement('img');
      img.src = p.url; img.alt = p.label || '증빙 사진'; img.loading = 'lazy';
      btn.appendChild(img);
      if (p.label) btn.appendChild(h('span', 'rv-photo-thumb-label', p.label));
      btn.addEventListener('click', () => openPhotoLightbox(p.url, p.label));
      photoGrid.appendChild(btn);
    });
    viewModal.hidden = false;
  }
  function closeReportViewModal() { viewModal.hidden = true; }
  $('reportViewCloseBtn').addEventListener('click', closeReportViewModal);
  viewModal.addEventListener('mousedown', (e: any) => { if (e.target === viewModal) closeReportViewModal(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !viewModal.hidden) closeReportViewModal(); });
  const rvPhotoLightbox = $('rvPhotoLightbox');
  function openPhotoLightbox(url?: any, label?: any) {
    const img = $('rvPhotoLightboxImg');
    img.src = url; img.alt = label || '증빙 사진';
    $('rvPhotoLightboxCaption').textContent = label || '';
    rvPhotoLightbox.hidden = false;
  }
  function closePhotoLightbox() { rvPhotoLightbox.hidden = true; }
  $('rvPhotoLightboxCloseBtn').addEventListener('click', closePhotoLightbox);
  rvPhotoLightbox.addEventListener('mousedown', (e: any) => { if (e.target === rvPhotoLightbox) closePhotoLightbox(); });
  document.addEventListener('keydown', (e: any) => { if (e.key === 'Escape' && !rvPhotoLightbox.hidden) closePhotoLightbox(); });
  form.addEventListener('submit', async (e: any) => {
    e.preventDefault();
    const careType = reportCareTypeChip.value || 'senior';
    const quickTags = reportQuickTagChip.value;
    const memo = $('reportMemo').value.trim();
    const aiMessage = $('reportAiMessage').value.trim();
    const notes = $('physicianNotes').value.trim();
    const cond = $('seniorCondition').value.trim();
    if (!aiMessage && !notes) {
      formError.textContent = '보호자에게 보낼 리포트 내용을 입력해 주세요 — 핵심 메모로 AI 초안을 생성하거나, 위 칸에 직접 작성해 주세요.';
      formError.hidden = false;
      return;
    }
    const save = $('reportSaveBtn');
    save.disabled = true;
    save.textContent = '전송 중…';
    try {
      await api.submitReport(reportTarget.id, notes, cond, {
        conditionTags: (reportConditionChip.value && reportMobilityChip.value)
          ? [reportConditionChip.value, reportMobilityChip.value] : [],
        nextVisitDate: $('nextVisitDate').value || null,
        photos: reportPhotoUploader.value,
        careType, quickTags, managerMemo: memo || null, aiMessage: aiMessage || null,
        aiGeneratedAt: !$('reportAiHint').hidden ? new Date().toISOString() : null
      });
      closeReportModal();
      showToast('보호자에게 케어 리포트를 전송했습니다.');
      await loadAll();
    } catch (err: any) {
      console.error('리포트 제출 실패:', err);
      formError.textContent = err && err.code === '23505'
        ? '이미 제출된 리포트입니다.'
        : '전송 중 오류가 발생했습니다: ' + (err.message || err);
      formError.hidden = false;
    }
    save.disabled = false;
    save.textContent = '보호자에게 전송';
  });
  const AUTO_GEOFENCE_RADIUS_M = 100;          // 기본 인식 반경 — 이 안이면 바로 자동 인증(auto_gps)
  const AUTO_GEOFENCE_EXPANDED_RADIUS_M = 300;  // 예외 처리 ①: 10분 전부터 확장되는 반경(expanded_gps)
  const AUTO_GEOFENCE_START_BEFORE_MIN = 30;    // 희망 일시 이만큼 전부터 배경 감지 시작
  const AUTO_GEOFENCE_EXPAND_BEFORE_MIN = 10;   // 이 시점까지 100m 안에서 못 잡으면 300m로 확장
  const AUTO_GEOFENCE_MANUAL_BEFORE_MIN = 15;   // 예외 처리 ②: 이 시점까지도 못 잡으면 수동 버튼을 강조
  const AUTO_GEOFENCE_POLL_MS = 20000;
  const geofenceState = new Map();
  const geofenceOriginCache = new Map();
  function minutesUntil(iso?: any) {
    const t = new Date(iso).getTime();
    return isNaN(t) ? Infinity : (t - Date.now()) / 60000;
  }
  async function resolveGeofenceOrigin(schedule?: any) {
    if (geofenceOriginCache.has(schedule.id)) return geofenceOriginCache.get(schedule.id);
    let point = (typeof schedule.origin_lat === 'number' && typeof schedule.origin_lng === 'number')
      ? { lat: schedule.origin_lat, lng: schedule.origin_lng } : null;
    if (!point && schedule.origin) point = await geocodeAddress(schedule.origin);
    geofenceOriginCache.set(schedule.id, point);
    return point;
  }
  function eligibleDepartureSchedules() {
    if (!data || !data.assigned || !data.assigned.value) return [];
    return data.assigned.value.filter((s: any) =>
      s.status === 'assigned' && minutesUntil(s.scheduled_at) <= AUTO_GEOFENCE_START_BEFORE_MIN
      && !(depState && depState.schedule && depState.schedule.id === s.id));
  }
  async function geofenceTick() {
    const list = eligibleDepartureSchedules();
    if (!list.length) return;
    let pos: any;
    try {
      pos = await getCurrentPositionAsync({ enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 });
    } catch (err: any) {
      const deniedPermission = err.code === err.PERMISSION_DENIED;
      list.forEach((s: any) => {
        const manualNeeded = deniedPermission || minutesUntil(s.scheduled_at) <= AUTO_GEOFENCE_MANUAL_BEFORE_MIN;
        geofenceState.set(s.id, manualNeeded
          ? { phase: 'manual_needed', reason: deniedPermission ? '위치 권한이 꺼져 있어요.' : 'GPS 확인이 지연되고 있어요.' }
          : { phase: 'watching' });
      });
      renderGeofenceSlots(list.map((s: any) => s.id));
      return;
    }
    const lat = pos.coords.latitude, lng = pos.coords.longitude, accuracy = Math.round(pos.coords.accuracy);
    for (const s of list) {
      const mins = minutesUntil(s.scheduled_at);
      const target = await resolveGeofenceOrigin(s);
      if (!target) {
        geofenceState.set(s.id, mins <= AUTO_GEOFENCE_MANUAL_BEFORE_MIN
          ? { phase: 'manual_needed', reason: '출발지 위치 정보를 확인할 수 없어요.' } : { phase: 'watching' });
        continue;
      }
      const dist = distanceMeters(lat, lng, target.lat, target.lng);
      const location = { lat, lng, accuracy };
      if (dist <= AUTO_GEOFENCE_RADIUS_M) {
        geofenceState.set(s.id, { phase: 'auto_matched', method: 'auto_gps', distance: dist, location });
      } else if (dist <= AUTO_GEOFENCE_EXPANDED_RADIUS_M && mins <= AUTO_GEOFENCE_EXPAND_BEFORE_MIN) {
        geofenceState.set(s.id, { phase: 'auto_matched', method: 'expanded_gps', distance: dist, location });
      } else {
        geofenceState.set(s.id, mins <= AUTO_GEOFENCE_MANUAL_BEFORE_MIN
          ? { phase: 'manual_needed', reason: '출발지와 거리가 있어요(약 ' + dist.toLocaleString() + 'm).' }
          : { phase: 'watching', distance: dist });
      }
    }
    renderGeofenceSlots(list.map((s: any) => s.id));
  }
  function renderGeofenceSlots(ids?: any) {
    ids.forEach((id: any) => {
      const card = document.querySelector<any>('.sched-compact[data-schedule-id="' + id + '"]');
      if (!card) return;
      const slot = card.querySelector<any>('.geofence-slot');
      const mainBtn = card.querySelector<any>('.sched-main-action-btn');
      if (!slot) return;
      const state = geofenceState.get(id);
      slot.innerHTML = '';
      if (!state || state.phase === 'watching') {
        slot.hidden = true;
        if (mainBtn) { mainBtn.textContent = ACTION_BTN_TEXT.departed; mainBtn.classList.remove('is-warn'); }
        return;
      }
      if (state.phase === 'auto_matched') {
        slot.hidden = false;
        if (mainBtn) { mainBtn.textContent = ACTION_BTN_TEXT.departed; mainBtn.classList.remove('is-warn'); }
        const banner = h('div', 'geofence-banner');
        banner.appendChild(h('p', 'geofence-banner-text', '📍 출발지 도착이 자동 확인되었습니다. 동행을 시작할까요?'));
        const confirmBtn = h('button', 'geofence-banner-btn', '동행 시작');
        confirmBtn.type = 'button';
        confirmBtn.addEventListener('click', () => confirmAutoDeparture(id, confirmBtn));
        banner.appendChild(confirmBtn);
        slot.appendChild(banner);
        return;
      }
      slot.hidden = false;
      slot.appendChild(h('p', 'geofence-hint', '⚠ ' + (state.reason || '위치 자동 확인이 어려워요.') + ' 아래 버튼으로 직접 인증해 주세요.'));
      if (mainBtn) { mainBtn.textContent = '위치 오류 시 수동 출발 인증'; mainBtn.classList.add('is-warn'); }
    });
  }
  async function confirmAutoDeparture(scheduleId?: any, button?: any) {
    const state = geofenceState.get(scheduleId);
    const schedule = (data.assigned.value || []).find((s: any) => s.id === scheduleId);
    if (!state || !schedule) return;
    button.disabled = true;
    button.textContent = '처리 중…';
    const radiusLabel = state.method === 'expanded_gps' ? '반경 300m(확장 적용)' : '반경 100m';
    const reason = 'GPS 자동 감지 성공 · ' + radiusLabel + ' · 거리 약 ' + state.distance.toLocaleString() + 'm';
    try {
      await performAdvance(schedule, FLOW[0], button, false, state.location, null, { method: state.method, reason });
      geofenceState.delete(scheduleId);
    } catch (err: any) {
      console.error('[지오펜싱 자동 출발 인증] 실패:', err);
      button.disabled = false;
      button.textContent = '동행 시작';
    }
  }
  let geofenceTimer: any = null;
  function startGeofenceWatcher() {
    if (geofenceTimer || !('geolocation' in navigator)) return;
    geofenceTimer = setInterval(() => {
      if (document.visibilityState === 'visible') geofenceTick();
    }, AUTO_GEOFENCE_POLL_MS);
    geofenceTick(); // 접속 직후 한 번 즉시 확인
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') geofenceTick();
  });
  (async function init() {
    const loading = $('loading');
    if (!supabaseClient) {
      loading.textContent = '로그인 모듈을 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해 주세요.';
      return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      window.location.replace('login.html'); // 비로그인 → 로그인 페이지
      return;
    }
    currentUser = session.user;
    if (!DEMO_SKIPS_AUTH) {
      if (!(await WBAuth.checkIsManager(currentUser.id))) {
        WBAuth.setUserMode('guardian'); // 'manager' 설정이 남아 두 페이지가 서로 되돌려 보내는 왕복 방지
        alert('매니저 권한이 필요합니다');
        window.location.replace('mypage'); // 보호자(고객) 마이페이지로 돌려보냄
        return;
      }
      if (WBAuth.getUserMode() !== 'manager') {
        window.location.replace('mypage');
        return;
      }
    }
    api = DEMO ? demoApi() : supabaseApi(currentUser);
    $('demoBadge').hidden = !DEMO;
    loading.hidden = true;
    $('app').hidden = false;
    await loadAll();
    startGeofenceWatcher(); // 출발 인증 지오펜싱 자동 감지 — 대상 일정이 없으면 매 tick 조용히 건너뜀
    if (getPendingReports().length > 0) activateTab('pendingReports');
    supabaseClient.auth.onAuthStateChange((event: any) => {
      if (event === 'SIGNED_OUT' && !WBAuth.loggingOut) window.location.replace('login.html');
    });
  })();

}

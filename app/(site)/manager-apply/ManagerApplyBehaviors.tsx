'use client';

/**
 * 케어 매니저 지원서 동작 — 예전 manager-apply.html 의 인라인 <script> 를 그대로 옮긴 것입니다.
 * 화면 마크업은 page.tsx, 이 컴포넌트는 화면이 뜬 뒤 그 마크업(id)을 찾아 동작을 붙입니다.
 *  - 로그인 확인 → 이미 매니저 / 심사 중 / 반려 후 재지원 / 새 지원 화면 분기
 *  - 4단계 마법사(기본 정보 → 활동 조건 → 정산 계좌 → 서약) + 단계별 입력 검사
 *  - Turnstile(봇 방지) 토큰과 함께 submit-manager-application Edge Function 으로 제출
 * DB·스토리지 호출은 lib/api/managers.ts 를 통합니다 (원칙 2).
 */
import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { lookupManager } from '@/lib/api/auth';
import { getMyProfile } from '@/lib/api/profile';
import { getLatestManagerApplication, removeIdCard, submitManagerApplication, uploadIdCard } from '@/lib/api/managers';
import { loadScript, SCRIPTS } from '@/lib/browser/load-script';
import { ROUTES } from '@/lib/config';

const TOTAL_STEPS = 4;
const STEP_NAMES: Record<number, string> = { 1: '기본 정보', 2: '활동 조건 및 경력', 3: '정산 계좌 정보', 4: '서약 및 약관 동의' };
/** 신분증 첨부는 지금 꺼져 있습니다 (켜려면 true + 화면의 첨부 칸 노출) */
const ID_UPLOAD_ENABLED = false;
const PHONE_DUPLICATE_ERRORS = ['PHONE_ALREADY_APPLIED', 'PHONE_ALREADY_MANAGER'];

type Errors = Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 외부 SDK(daum, turnstile)는 타입 정의가 없습니다
type AnyWindow = Window & Record<string, any>;

const digitsOnly = (s: string) => (s || '').replace(/\D/g, '');
function formatBirthDate(value: string) {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return digits.slice(0, 4) + '.' + digits.slice(4);
  return digits.slice(0, 4) + '.' + digits.slice(4, 6) + '.' + digits.slice(6);
}
function birthDateToIso(value: string) {
  const digits = digitsOnly(value);
  return digits.length === 8 ? digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6) : '';
}
function formatPhoneDigits(digits: string) {
  if (digits.length < 4) return digits;
  if (digits.length < 8) return digits.slice(0, 3) + '-' + digits.slice(3);
  if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
}
const combineAddress = (base: string, detail: string) => {
  const b = String(base || '').trim();
  const d = String(detail || '').trim();
  return d ? (b ? b + ' ' + d : d) : b;
};

export function ManagerApplyBehaviors() {
  useEffect(() => {
    const client = getSupabase();
    const w = window as AnyWindow;
    const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
    const cleanups: (() => void)[] = [];
    const on = (el: EventTarget | null, type: string, fn: EventListener) => {
      if (!el) return;
      el.addEventListener(type, fn);
      cleanups.push(() => el.removeEventListener(type, fn));
    };

    let currentUser: { id: string } | null = null;
    let turnstileLoadError = '';
    let turnstileCallbackError = '';
    let submitInFlight = false;
    const idUpload: { path: string | null; uploading: boolean; fileName: string | null } = { path: null, uploading: false, fileName: null };

    const showOnly = (id: string) =>
      ['loadingCard', 'applyCard', 'alreadyManagerCard', 'pendingCard', 'doneCard'].forEach((cardId) => {
        $(cardId).hidden = cardId !== id;
      });

    const showStep = (n: number) => {
      for (let i = 1; i <= TOTAL_STEPS; i++) $('step' + i).hidden = i !== n;
      $('stepCurrentLabel').textContent = 'STEP ' + n + ' / ' + TOTAL_STEPS;
      $('stepNameLabel').textContent = STEP_NAMES[n];
      $('wizardFill').style.width = (n / TOTAL_STEPS) * 100 + '%';
      $('applyCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const applyFieldErrors = (keys: string[], errors: Errors) =>
      keys.forEach((key) => {
        const field = $('f-' + key);
        const errEl = $('e-' + key);
        if (!field || !errEl) return;
        const has = !!errors[key];
        field.classList.toggle('has-error', has);
        errEl.textContent = errors[key] || '';
        errEl.hidden = !has;
      });

    const selectedGender = () => document.querySelector<HTMLInputElement>('input[name="gender"]:checked')?.value ?? '';
    document.querySelectorAll('input[name="gender"]').forEach((el) =>
      on(el, 'change', () => {
        $('f-gender').classList.remove('has-error');
        $('e-gender').textContent = '';
        $('e-gender').hidden = true;
      }),
    );

    // 휴대폰 번호 자동 하이픈 (커서 위치 유지)
    on($('mgrPhone'), 'input', () => {
      const input = $('mgrPhone');
      const prev = input.value;
      const prevCursor = input.selectionStart == null ? prev.length : input.selectionStart;
      const digitsBeforeCursor = prev.slice(0, prevCursor).replace(/\D/g, '').length;
      const formatted = formatPhoneDigits(prev.replace(/\D/g, '').slice(0, 11));
      input.value = formatted;
      if (digitsBeforeCursor <= 0) return input.setSelectionRange(0, 0);
      let seen = 0;
      let cursor = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i]) && ++seen === digitsBeforeCursor) {
          cursor = i + 1;
          break;
        }
      }
      input.setSelectionRange(cursor, cursor);
    });
    on($('mgrBirth'), 'input', (ev) => {
      const input = ev.target as HTMLInputElement;
      input.value = formatBirthDate(input.value);
    });
    const applyPhoneLockState = (hasPhone: boolean) => {
      $('mgrPhone').readOnly = hasPhone;
      $('mgrPhone').disabled = hasPhone;
    };

    // 신분증 첨부 (현재 비활성 — ID_UPLOAD_ENABLED)
    const renderFileUi = () => {
      if (idUpload.uploading) {
        $('fileDropLabel').hidden = true;
        $('fileChip').hidden = true;
        $('fileStatus').hidden = false;
        $('fileStatus').textContent = '업로드 중…';
      } else if (idUpload.path) {
        $('fileDropLabel').hidden = true;
        $('fileChip').hidden = false;
        $('fileChipName').textContent = idUpload.fileName || '첨부된 파일';
        $('fileStatus').hidden = true;
      } else {
        $('fileDropLabel').hidden = false;
        $('fileChip').hidden = true;
        $('fileStatus').hidden = true;
      }
    };
    on($('fileRemoveBtn'), 'click', async () => {
      if (idUpload.path) await removeIdCard(client, idUpload.path).catch((e) => console.warn('[매니저 지원] 기존 신분증 파일 삭제 실패(무시):', e));
      idUpload.path = null;
      idUpload.fileName = null;
      $('mgrIdFile').value = '';
      renderFileUi();
    });
    on($('mgrIdFile'), 'change', async (ev) => {
      const input = ev.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const fail = (msg: string) => {
        $('f-idfile').classList.add('has-error');
        $('e-idfile').textContent = msg;
        $('e-idfile').hidden = false;
        input.value = '';
      };
      $('e-idfile').hidden = true;
      $('f-idfile').classList.remove('has-error');
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) return fail('jpg, png, webp, pdf 파일만 첨부할 수 있습니다.');
      if (file.size > 10 * 1024 * 1024) return fail('파일 크기는 10MB 이하여야 합니다.');
      if (!currentUser) {
        $('e-idfile').textContent = '로그인 정보를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.';
        $('e-idfile').hidden = false;
        input.value = '';
        return;
      }
      if (idUpload.path) await removeIdCard(client, idUpload.path).catch((e) => console.warn('[매니저 지원] 이전 신분증 파일 삭제 실패(무시):', e));
      idUpload.uploading = true;
      idUpload.path = null;
      renderFileUi();
      const { data, error } = await uploadIdCard(client, currentUser.id, file);
      idUpload.uploading = false;
      if (error) {
        console.error('[매니저 지원] 신분증 업로드 실패:', error.message);
        fail('업로드에 실패했습니다: ' + error.message);
        renderFileUi();
        return;
      }
      idUpload.path = data.path;
      idUpload.fileName = file.name;
      renderFileUi();
    });

    // 주소 검색
    const openAddressSearch = () => {
      if (!w.daum?.Postcode) {
        alert('주소 검색 서비스를 불러오지 못했어요. 네트워크 상태를 확인하고 새로고침 후 다시 시도해 주세요.');
        return;
      }
      new w.daum.Postcode({
        oncomplete: (data: { roadAddress?: string; jibunAddress?: string }) => {
          $('mgrAddressBase').value = data.roadAddress || data.jibunAddress || '';
          $('f-address').classList.remove('has-error');
          $('e-address').hidden = true;
          $('mgrAddressDetail').focus();
        },
      }).open();
    };
    on($('btnSearchAddress'), 'click', openAddressSearch);
    on($('mgrAddressBase'), 'click', openAddressSearch);

    on($('areaOtherCheck'), 'change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      $('areaOtherText').hidden = !checked;
      if (!checked) $('areaOtherText').value = '';
    });
    const certCheckboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="cert"]'));
    on($('certNoneCheck'), 'change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) certCheckboxes.forEach((c) => (c.checked = false));
      certCheckboxes.forEach((c) => (c.disabled = checked));
    });
    certCheckboxes.forEach((c) =>
      on(c, 'change', () => {
        if (c.checked) $('certNoneCheck').checked = false;
      }),
    );
    on($('mgrBank'), 'change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      $('mgrBankOther').hidden = v !== '기타';
      if (v !== '기타') $('mgrBankOther').value = '';
    });

    // ---------- 단계별 입력 검사 ----------
    const getAreas = () => {
      const areas = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="area"]:checked')).map((el) => el.value);
      if ($('areaOtherCheck').checked && $('areaOtherText').value.trim()) areas.push($('areaOtherText').value.trim());
      return areas;
    };
    const getSchedule = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="schedule"]:checked')).map((el) => el.value);
    const getCerts = () => ($('certNoneCheck').checked ? ['해당 없음'] : certCheckboxes.filter((c) => c.checked).map((c) => c.value));
    const resolveBankName = () => {
      const v = $<HTMLSelectElement>('mgrBank').value;
      return v === '기타' ? $('mgrBankOther').value.trim() : v;
    };
    const getTurnstileToken = (): string => (typeof w.turnstile?.getResponse === 'function' ? w.turnstile.getResponse() || '' : '');
    const resetTurnstile = () => {
      if (typeof w.turnstile?.reset === 'function') w.turnstile.reset();
    };
    w.wbManagerTurnstileSuccess = () => {
      turnstileCallbackError = '';
      $('e-turnstile').hidden = true;
      $('e-turnstile').textContent = '';
    };
    w.wbManagerTurnstileExpired = () => {
      turnstileCallbackError = '인증 시간이 만료되었습니다. 다시 인증해 주세요.';
    };
    w.wbManagerTurnstileError = () => {
      turnstileCallbackError = '자동 입력 방지 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.';
    };

    const validateStep1 = () => {
      const e: Errors = {};
      if (!$('mgrName').value.trim()) e.name = '이름을 입력해 주세요.';
      if (!$('mgrPhone').value.trim() || digitsOnly($('mgrPhone').value).length < 9) e.phone = '연락처를 정확히 입력해 주세요. (예: 010-1234-5678)';
      const birth = birthDateToIso($('mgrBirth').value);
      const [year, month, day] = birth ? birth.split('-').map(Number) : [];
      const parsedBirth = birth ? new Date(Date.UTC(year, month - 1, day)) : null;
      const today = new Date();
      const todayIso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
      const validBirth = !!parsedBirth && !Number.isNaN(parsedBirth.getTime()) && parsedBirth.toISOString().slice(0, 10) === birth && birth <= todayIso;
      if (!validBirth) e.birth = '생년월일을 올바르게 입력해 주세요. (예: 1900.01.01)';
      if (!selectedGender()) e.gender = '성별을 선택해 주세요.';
      if (!$('mgrAddressBase').value.trim()) e.address = '주소 검색을 통해 거주지 주소를 입력해 주세요.';
      if (ID_UPLOAD_ENABLED) {
        if (idUpload.uploading) e.idfile = '신분증 사본 업로드가 끝날 때까지 잠시 기다려 주세요.';
        else if (!idUpload.path) e.idfile = '신분증 사본을 첨부해 주세요.';
      }
      return e;
    };
    const validateStep2 = () => {
      const e: Errors = {};
      if (!getAreas().length) e.areas = '활동 가능 지역을 1개 이상 선택해 주세요.';
      else if ($('areaOtherCheck').checked && !$('areaOtherText').value.trim()) e.areas = '기타 지역을 입력해 주세요.';
      if (!getSchedule().length) e.schedule = '활동 가능 요일/시간대를 1개 이상 선택해 주세요.';
      if (!getCerts().length) e.certs = "보유 자격증이 없다면 '해당 없음'을 선택해 주세요.";
      if (!$<HTMLTextAreaElement>('mgrCareer').value.trim()) e.career = "관련 경력이 없다면 '없음'이라고 입력해 주세요.";
      return e;
    };
    const validateStep3 = () => {
      const e: Errors = {};
      if (!resolveBankName()) e.bank = '정산 은행명을 선택하거나 입력해 주세요.';
      const acct = digitsOnly($('mgrAccount').value);
      if (!acct || acct.length < 4) e.account = '계좌번호를 정확히 입력해 주세요.';
      if (!$('mgrHolder').value.trim()) e.holder = '예금주명을 입력해 주세요.';
      return e;
    };
    const validateStep4 = () => {
      const e: Errors = {};
      if (!($('agreeSafety').checked && $('agreeNoDirectDeal').checked && $('agreePrivacy').checked)) e.agree = '모든 서약 및 약관에 동의해야 지원할 수 있습니다.';
      if (!getTurnstileToken()) e.turnstile = turnstileLoadError || turnstileCallbackError || '자동 입력 방지 인증을 완료해 주세요.';
      return e;
    };
    const applyStep4Error = (e: Errors) => {
      $('e-agree').textContent = e.agree || '';
      $('e-agree').hidden = !e.agree;
      $('e-turnstile').textContent = e.turnstile || '';
      $('e-turnstile').hidden = !e.turnstile;
    };

    const STEP1_KEYS = ['name', 'phone', 'birth', 'gender', 'address', 'idfile'];
    const STEP2_KEYS = ['areas', 'schedule', 'certs', 'career'];
    const STEP3_KEYS = ['bank', 'account', 'holder'];
    on($('toStep2'), 'click', () => {
      const e = validateStep1();
      applyFieldErrors(STEP1_KEYS, e);
      if (!Object.keys(e).length) showStep(2);
    });
    on($('toStep1FromStep2'), 'click', () => showStep(1));
    on($('toStep3'), 'click', () => {
      const e = validateStep2();
      applyFieldErrors(STEP2_KEYS, e);
      if (!Object.keys(e).length) showStep(3);
    });
    on($('toStep2FromStep3'), 'click', () => showStep(2));
    on($('toStep4'), 'click', () => {
      const e = validateStep3();
      applyFieldErrors(STEP3_KEYS, e);
      if (!Object.keys(e).length) showStep(4);
    });
    on($('toStep3FromStep4'), 'click', () => showStep(3));

    // ---------- 제출 ----------
    on($('applyForm'), 'submit', async (ev) => {
      ev.preventDefault();
      const formError = $('formError');
      formError.hidden = true;
      if (submitInFlight) return;
      const e1 = validateStep1();
      const e2 = validateStep2();
      const e3 = validateStep3();
      const e4 = validateStep4();
      if (Object.keys(e1).length) return applyFieldErrors(STEP1_KEYS, e1), showStep(1);
      if (Object.keys(e2).length) return applyFieldErrors(STEP2_KEYS, e2), showStep(2);
      if (Object.keys(e3).length) return applyFieldErrors(STEP3_KEYS, e3), showStep(3);
      applyStep4Error(e4);
      if (Object.keys(e4).length) return showStep(4);

      const submitBtn = $<HTMLButtonElement>('submitBtn');
      submitInFlight = true;
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중…';

      const result = await submitManagerApplication(client, {
        name: $('mgrName').value.trim(),
        phone: $('mgrPhone').value.trim(),
        birth_date: birthDateToIso($('mgrBirth').value),
        gender: selectedGender(),
        address: combineAddress($('mgrAddressBase').value, $('mgrAddressDetail').value),
        id_image_path: ID_UPLOAD_ENABLED ? idUpload.path : null,
        activity_areas: getAreas(),
        activity_schedule: getSchedule(),
        certifications: getCerts(),
        career_experience: $<HTMLTextAreaElement>('mgrCareer').value.trim(),
        bank_name: resolveBankName(),
        account_number: digitsOnly($('mgrAccount').value),
        account_holder: $('mgrHolder').value.trim(),
        agree_safety: true,
        agree_no_direct_deal: true,
        agree_privacy: true,
        turnstile_token: getTurnstileToken(),
      });

      if (!result.ok) {
        submitInFlight = false;
        console.error('[매니저 지원] 제출 실패:', result.body || result.raw);
        submitBtn.disabled = false;
        submitBtn.textContent = '제출하기';
        resetTurnstile(); // Turnstile 토큰은 1회용 — 재시도 전에 새로 받아야 함
        if (result.body?.error === 'BOT_VERIFICATION_FAILED') {
          const codes = (result.body as any).turnstile_error_codes as string[] | undefined;
          const keyError = codes?.some((code) => code === 'invalid-input-secret' || code === 'missing-input-secret');
          formError.textContent = keyError
            ? '자동 입력 방지 서버 키 설정을 확인해 주세요. 지원팀에 문의해 주세요.'
            : result.body.message || '자동 입력 방지 인증에 실패했습니다. 다시 인증해 주세요.';
          formError.hidden = false;
          return showStep(4);
        }
        if (result.body?.error && PHONE_DUPLICATE_ERRORS.includes(result.body.error)) {
          applyFieldErrors(['phone'], { phone: result.body.message || '' });
          return showStep(1);
        }
        formError.textContent = result.body?.message || '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
        formError.hidden = false;
        return showStep(4);
      }
      submitInFlight = false;
      showOnly('doneCard');
      $('doneTitle').focus();
    });

    // ---------- 시작: 로그인 확인 → 화면 분기 ----------
    let cancelled = false;
    (async () => {
      // 주소 검색 · 봇 방지 스크립트 (실패해도 나머지는 동작)
      loadScript(SCRIPTS.postcode).catch((e) => console.warn(e));
      const turnstileWidget = document.querySelector<HTMLElement>('.cf-turnstile');
      if (!turnstileWidget?.dataset.sitekey) {
        turnstileLoadError = '자동 입력 방지 Site Key가 설정되지 않았습니다. NEXT_PUBLIC_TURNSTILE_SITE_KEY를 확인해 주세요.';
      } else {
        loadScript(SCRIPTS.turnstile, { async: true }).then(() => {
          if (!cancelled && !w.turnstile) turnstileLoadError = 'Cloudflare 인증 스크립트가 정상적으로 시작되지 않았습니다. 새로고침 후 다시 시도해 주세요.';
        }).catch((e) => {
          turnstileLoadError = 'Cloudflare 인증을 불러오지 못했습니다. 네트워크 또는 CSP 설정을 확인해 주세요.';
          console.warn('[매니저 지원] Turnstile 로드 실패:', e);
        });
      }
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        window.location.replace(ROUTES.login);
        return;
      }
      currentUser = { id: session.user.id };
      const userId = session.user.id;

      if ((await lookupManager(client, userId)) === 'yes') return showOnly('alreadyManagerCard');

      const latest = await getLatestManagerApplication(client, userId);
      if (cancelled) return;
      if (latest?.status === 'pending') return showOnly('pendingCard');

      const meta = (session.user.user_metadata ?? {}) as Record<string, string | undefined>;
      let name = meta.name || meta.full_name || meta.nickname || '';
      let phone = session.user.phone || meta.phone || '';
      let address = '';
      let addressDetail = '';
      try {
        const p = await getMyProfile(client, userId);
        if (p?.name) name = p.name;
        if (p?.phone) phone = p.phone;
        if (p?.address) address = p.address;
        if (p?.address_detail) addressDetail = p.address_detail;
      } catch (e) {
        console.warn('[매니저 지원] 마이페이지 정보 조회 실패(기본값으로 계속 진행):', e);
      }
      if (cancelled) return;
      if (name) $('mgrName').value = name;
      if (address) $('mgrAddressBase').value = address;
      if (addressDetail) $('mgrAddressDetail').value = addressDetail;
      if (phone) $('mgrPhone').value = formatPhoneDigits(digitsOnly(phone).slice(0, 11));
      applyPhoneLockState(!!phone);

      if (latest?.status === 'rejected') {
        const notice = $('reapplyNotice');
        notice.hidden = false;
        notice.className = 'reject-notice';
        notice.textContent = latest.reject_reason
          ? '이전 지원이 반려되었습니다. 사유: ' + latest.reject_reason + ' — 내용을 보완해 다시 지원해 주세요.'
          : '이전 지원이 반려되었습니다. 내용을 보완해 다시 지원해 주세요.';
      }
      showStep(1);
      showOnly('applyCard');
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}

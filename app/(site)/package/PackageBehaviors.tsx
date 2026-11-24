'use client';

/**
 * 시간 패키지 구매 동작 — 예전 package.html 의 인라인 <script> 를 그대로 옮긴 것입니다.
 * 흐름: 로그인 확인 → (휴대폰 번호 없으면 1회 입력) → 주문서 생성 → PortOne 결제창 → 서버 결제 확인 → 완료 모달
 * 금액 검증과 패키지 충전은 서버(confirm-package-order-payment)가 합니다 (원칙 1).
 */
import { useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/components/site/AuthProvider';
import { getSupabase } from '@/lib/supabase/client';
import { setInitialPhoneIfMissing } from '@/lib/api/auth';
import { confirmPackageOrderPayment, createPackageOrder, getMyPackageBuyer, getMyPhone, PACKAGE_CATALOG, type PackageType } from '@/lib/api/packages';
import { isPaymentCanceled, requestPayment, type PaymentResult } from '@/lib/payments/portone';
import { ROUTES, SITE } from '@/lib/config';

function formatPhoneDigits(digits: string) {
  if (digits.length < 4) return digits;
  if (digits.length < 8) return digits.slice(0, 3) + '-' + digits.slice(3);
  if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
}

export function PackageBehaviors() {
  const { showLoginModal } = useAuth();

  useEffect(() => {
    const client = getSupabase();
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;

    const showToast = (message: string) => {
      let toast = $('pkgToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'pkgToast';
        toast.className = 'pkg-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast.hidden = true), 2600);
    };

    const showPurchaseModal = (catalog: (typeof PACKAGE_CATALOG)[PackageType]) => {
      $('pkgPurchaseModalPkgName').textContent = catalog.label + ' 구매가 완료되었습니다.';
      $('pkgPurchaseModalBody').textContent = '충전된 잔여 시간: ' + catalog.hours + '시간 / ' + catalog.sessions + '회분';
      $('pkgPurchaseModal').hidden = false;
      $('pkgPurchaseModalMypageBtn').onclick = () => {
        window.location.href = ROUTES.mypage + '?purchased=' + encodeURIComponent(catalog.label) + '&hours=' + catalog.hours;
      };
      $('pkgPurchaseModalApplyBtn').onclick = () => {
        window.location.href = ROUTES.apply;
      };
    };

    const requireLogin = async (): Promise<User | null> => {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      if (user) return user;
      showLoginModal('package');
      return null;
    };

    // 알림톡 받을 휴대폰 번호가 없으면 결제 전에 1회 입력 (모달)
    let phoneModal: HTMLDivElement | null = null;
    const ensurePhoneOnFile = async (user: User): Promise<boolean> => {
      const phone = await getMyPhone(client, user.id);
      if (phone === undefined || phone) return true; // 조회 실패 시에는 막지 않고 진행
      if (!phoneModal) {
        phoneModal = document.createElement('div');
        phoneModal.className = 'wb-login-modal-overlay';
        phoneModal.hidden = true;
        phoneModal.setAttribute('role', 'dialog');
        phoneModal.setAttribute('aria-modal', 'true');
        phoneModal.innerHTML =
          '<div class="wb-login-modal-card" style="text-align:left;">' +
          '<p class="wb-login-modal-title">알림톡 받을 번호를 알려주세요</p>' +
          '<p class="wb-login-modal-body">결제·이용 안내를 보내드릴 휴대폰 번호가 아직 없어요. 한 번만 입력해 주시면 계속 저장되어 다시 묻지 않아요.</p>' +
          '<input type="tel" id="pkgPhoneCaptureInput" maxlength="13" inputmode="numeric" autocomplete="tel" placeholder="예: 010-1234-5678" ' +
          'style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #D1D5DB;border-radius:10px;font-size:14.5px;font-family:inherit;margin-bottom:8px;">' +
          '<p style="color:#D64545;font-size:12.5px;margin:0 0 14px;display:none;" id="pkgPhoneCaptureError"></p>' +
          '<div class="wb-login-modal-actions">' +
          '<button type="button" class="wb-login-modal-btn wb-login-modal-cancel" id="pkgPhoneCaptureCancelBtn">취소</button>' +
          '<button type="button" class="wb-login-modal-btn wb-login-modal-confirm" id="pkgPhoneCaptureSaveBtn">저장하고 계속하기</button>' +
          '</div></div>';
        document.body.appendChild(phoneModal);
        phoneModal.querySelector<HTMLInputElement>('#pkgPhoneCaptureInput')!.addEventListener('input', (e) => {
          const t = e.target as HTMLInputElement;
          t.value = formatPhoneDigits(t.value.replace(/\D/g, '').slice(0, 11));
        });
      }
      const modal = phoneModal;
      const input = $<HTMLInputElement>('pkgPhoneCaptureInput');
      const errorEl = $('pkgPhoneCaptureError');
      input.value = '';
      errorEl.style.display = 'none';
      modal.hidden = false;

      return new Promise<boolean>((resolve) => {
        const saveBtn = $<HTMLButtonElement>('pkgPhoneCaptureSaveBtn');
        const cancelBtn = $<HTMLButtonElement>('pkgPhoneCaptureCancelBtn');
        const close = (result: boolean) => {
          modal.hidden = true;
          saveBtn.onclick = null;
          cancelBtn.onclick = null;
          resolve(result);
        };
        cancelBtn.onclick = () => close(false);
        saveBtn.onclick = async () => {
          const digits = input.value.replace(/\D/g, '');
          if (digits.length < 9 || digits.length > 11) {
            errorEl.textContent = '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)';
            errorEl.style.display = 'block';
            return;
          }
          saveBtn.disabled = true;
          saveBtn.textContent = '저장 중...';
          const res = await setInitialPhoneIfMissing(client, digits);
          saveBtn.disabled = false;
          saveBtn.textContent = '저장하고 계속하기';
          if (res.error) {
            console.error('[패키지 구매] set_initial_phone_if_missing 실패:', res.error);
            errorEl.textContent = '저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
            errorEl.style.display = 'block';
            return;
          }
          close(true);
        };
      });
    };

    const buyPackage = async (packageType: PackageType, btn: HTMLButtonElement) => {
      const user = await requireLogin();
      if (!user) return;
      if (!(await ensurePhoneOnFile(user))) return;
      const catalog = PACKAGE_CATALOG[packageType];
      const originalLabel = btn.dataset.originalLabel || btn.textContent || '';
      btn.disabled = true;
      btn.textContent = '주문 생성 중…';

      const { data: order, error: orderErr } = await createPackageOrder(client, user.id, packageType);
      if (orderErr || !order) {
        console.error('[패키지 구매] package_orders 생성 실패:', orderErr?.code, orderErr?.message);
        btn.disabled = false;
        btn.textContent = originalLabel;
        const NOT_READY_CODES = ['PGRST204', '42703', 'PGRST205', '42P01', '23514'];
        const message = orderErr && NOT_READY_CODES.includes(orderErr.code)
          ? '패키지 상품 준비가 아직 끝나지 않았어요. 잠시 후 다시 시도하거나 운영자에게 문의해 주세요.'
          : '주문 생성에 실패했어요. 잠시 후 다시 시도해 주세요.';
        showToast(message + (orderErr?.code ? ' (코드: ' + orderErr.code + ')' : ''));
        return;
      }

      btn.textContent = '결제창 여는 중…';
      window.scrollTo(0, 0);
      let payment: PaymentResult;
      try {
        const buyer = await getMyPackageBuyer(client, user.id);
        payment = await requestPayment({
          paymentId: order.id, // 서버가 이 값으로 package_orders.id 를 찾습니다
          orderName: '위드브릿지 ' + catalog.label,
          totalAmount: catalog.price,
          currency: 'CURRENCY_KRW',
          payMethod: 'CARD',
          windowType: { pc: 'IFRAME', mobile: 'IFRAME' },
          customer: { ...buyer, email: user.email || undefined },
          customData: { package_order_id: order.id },
        });
      } catch (e) {
        console.error('[패키지 구매] 결제창 호출 실패:', e);
        payment = { code: 'CLIENT_ERROR', message: '결제창을 여는 중 오류가 발생했어요.' };
      }
      if (payment && payment.code !== undefined) {
        btn.disabled = false;
        btn.textContent = originalLabel;
        showToast(isPaymentCanceled(payment) ? '결제가 취소되었습니다.' : '결제가 완료되지 않았어요. (' + (payment.message || payment.code) + ')');
        return;
      }

      btn.textContent = '결제 확인 중…';
      const { error: confirmErr } = await confirmPackageOrderPayment(client, order.id);
      if (confirmErr) {
        console.error('[패키지 구매] 결제 확인 실패 — order_id=' + order.id, confirmErr);
        btn.disabled = false;
        btn.textContent = originalLabel;
        showToast(`결제 확인에 실패했어요. 고객센터(${SITE.phone})로 문의해 주세요.`);
        return;
      }
      btn.textContent = '구매 완료 ✓';
      showPurchaseModal(catalog);
    };

    const b10 = $<HTMLButtonElement>('buyPackage10hBtn');
    const b20 = $<HTMLButtonElement>('buyPackage20hBtn');
    const on10 = () => buyPackage('10_hours', b10);
    const on20 = () => buyPackage('20_hours', b20);
    b10?.addEventListener('click', on10);
    b20?.addEventListener('click', on20);
    return () => {
      clearTimeout(toastTimer);
      b10?.removeEventListener('click', on10);
      b20?.removeEventListener('click', on20);
      phoneModal?.remove();
    };
  }, [showLoginModal]);

  return null;
}

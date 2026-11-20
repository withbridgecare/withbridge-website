/**
 * 보호자 마이페이지(app/(site)/mypage)가 쓰는 DB 호출 — 예전 mypage.html 의 쿼리를 그대로 옮겨 이름을 붙였습니다.
 * 권한은 DB 의 RLS·RPC 가 확인합니다 (원칙 4). 인자 이름은 원래 화면 코드의 변수 이름 그대로입니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** from 'profiles' */
export function getMyPointsAndPhone(client: any, currentUser: any) {
  return client.from('profiles').select('points_balance, phone').eq('id', currentUser.id).maybeSingle();
}

/** from 'user_coupons' */
export function listMyCoupons(client: any, currentUser: any) {
  return client.from('user_coupons').select('id, coupon_code, amount, status, expires_at, used_at')
          .eq('user_id', currentUser.id)
          .order('issued_at', { ascending: false });
}

/** from 'care_schedules' */
export function listRequestedExtraCharges(client: any, currentUser: any) {
  return client
        .from('care_schedules')
        .select('id, senior_name, scheduled_at, notes, extra_charge_amount, extra_charge_memo, extra_charge_payment_id')
        .eq('guardian_id', currentUser.id)
        .eq('extra_charge_status', 'REQUESTED')
        .order('extra_charge_requested_at', { ascending: false });
}

/** from 'user_packages' */
export function listMyActivePackageCounts(client: any) {
  return client
        .from('user_packages')
        .select('remaining_count')
        .eq('status', 'active')
        .gt('remaining_count', 0);
}

/** from 'care_checkpoints' */
export function listCareCheckpoints(client: any, scheduleId: any) {
  return client
          .from('care_checkpoints')
          .select('step, lat, lng, accuracy, photo_url, checkpoint_at, created_at')
          .eq('schedule_id', scheduleId)
          .order('checkpoint_at', { ascending: true });
}

/** from 'profiles' */
export function getMyNameAndPhone(client: any, currentUser: any) {
  return client.from('profiles').select('name, phone').eq('id', currentUser.id).maybeSingle();
}

/** rpc 'my_application_managers' */
export function listMyApplicationManagers(client: any) {
  return client.rpc('my_application_managers');
}

/** from 'care_schedules' */
export function selectCareSchedulesIn(client: any, cols: any, col: any, ids: any) {
  return client.from('care_schedules').select(cols).in(col, ids);
}

/** rpc 'my_application_schedules' */
export function listMyApplicationSchedules(client: any) {
  return client.rpc('my_application_schedules');
}

/** from 'service_applications' */
export function selectServiceApplications(client: any, cols: any, DEBUG_ALL: any) {
  return client.from('service_applications').select(cols)
            .order('created_at', { ascending: false }).limit(DEBUG_ALL ? 100 : 50);
}

/** rpc 'confirm_service_application' */
export function confirmServiceApplication(client: any, a: any) {
  return client.rpc('confirm_service_application', { p_application_id: a.id });
}

/** rpc 'cancel_my_application' */
export function cancelMyApplication(client: any, a: any) {
  return client.rpc('cancel_my_application', { p_application_id: a.id });
}

/** from 'seniors' */
export function listMySeniorsAll(client: any, currentUser: any) {
  return client
        .from('seniors')
        .select('*')
        .eq('user_id', currentUser.id);
}

/** from 'seniors' */
export function probeSeniorsVisibility(client: any) {
  return client.from('seniors').select('senior_id, user_id, senior_name').limit(10);
}

/** from 'guardian_care_reports' */
export function listGuardianCareReports(client: any, cols: any) {
  return client
          .from('guardian_care_reports')
          .select(cols)
          .order('submitted_at', { ascending: false })
          .limit(20);
}

/** rpc 'mark_care_report_read' */
export function markCareReportRead(client: any, report: any) {
  return client.rpc('mark_care_report_read', { p_schedule_id: report.schedule_id });
}

/** from 'care_reviews' */
export function upsertCareReview(client: any, rvRateCurrentScheduleId: any, rvRateSelected: any, reviewText: any) {
  return client.from('care_reviews').upsert({
          schedule_id: rvRateCurrentScheduleId,
          rating: rvRateSelected,
          review_text: reviewText,
          updated_at: new Date().toISOString()
        }, { onConflict: 'schedule_id' });
}

/** from 'care_reviews' */
export function getCareReview(client: any, rvRateCurrentScheduleId: any) {
  return client
        .from('care_reviews')
        .select('rating, review_text')
        .eq('schedule_id', rvRateCurrentScheduleId)
        .maybeSingle();
}

/** from 'seniors' */
export function updateSenior(client: any, payload: any, SENIOR_PK: any, editingSeniorId: any, currentUser: any) {
  return client.from('seniors').update(payload).eq(SENIOR_PK, editingSeniorId).eq('user_id', currentUser.id).select().maybeSingle();
}

/** from 'seniors' */
export function insertSenior(client: any, currentUser: any, payload: any) {
  return client.from('seniors').insert([Object.assign({ user_id: currentUser.id }, payload)]).select().maybeSingle();
}

/** from 'seniors' */
export function deleteSenior(client: any, SENIOR_PK: any, senior: any, currentUser: any) {
  return client.from('seniors').delete().eq(SENIOR_PK, senior[SENIOR_PK]).eq('user_id', currentUser.id);
}

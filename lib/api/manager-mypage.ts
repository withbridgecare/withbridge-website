/**
 * 케어 매니저 마이페이지(app/(site)/mypage-manager)가 쓰는 DB 호출 — 예전 mypage-manager.html 의 쿼리를 그대로 옮겨 이름을 붙였습니다.
 * 권한은 DB 의 RLS·RPC 가 확인합니다 (원칙 4). 인자 이름은 원래 화면 코드의 변수 이름 그대로입니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** from 'care_issue_reports' */
export function insertCareIssueReport(client: any, s: any, currentUser: any, typeEl: any, detail: any) {
  return client.from('care_issue_reports').insert([{
          application_id: s.application_id || null,
          schedule_id: s.id,
          user_id: currentUser.id,
          reporter_role: 'manager',
          issue_type: typeEl.value,
          detail: detail || null
        }]);
}

/** from 'managers' */
export function getMyManagerProfile(client: any, user: any) {
  return client.from('managers')
            .select('certification, certification_verified, activity_status')
            .eq('id', user.id).maybeSingle();
}

/** rpc 'manager_my_review_stats' */
export function getMyReviewStats(client: any) {
  return client.rpc('manager_my_review_stats');
}

/** from 'managers' */
export function updateMyActivityStatus(client: any, status: any, user: any) {
  return client.from('managers')
            .update({ activity_status: status }).eq('id', user.id)
            .select('activity_status').maybeSingle();
}

/** from 'care_schedules' */
export function findMyActiveSchedule(client: any, user: any) {
  return client.from('care_schedules')
            .select('id').eq('manager_id', user.id)
            .in('status', ['assigned', 'departed', 'arrived', 'treatment_done', 'returning'])
            .limit(1);
}

/** from 'managers' */
export function getMyManagerVerification(client: any, user: any) {
  return client.from('managers')
              .select('id, certification_verified, activity_status').eq('id', user.id).maybeSingle();
}

/** from 'service_applications' */
export function listOpenApplicationsWithManagerColumn(client: any, APP_COLS: any, acceptCutoffIso: any) {
  return client.from('service_applications')
              .select(APP_COLS + ', manager_id')
              .is('manager_id', null)
              .gt('created_at', acceptCutoffIso).order('created_at', { ascending: true }).limit(50);
}

/** from 'service_applications' */
export function listOpenApplications(client: any, APP_COLS: any, acceptCutoffIso: any) {
  return client.from('service_applications')
                .select(APP_COLS)
                .gt('created_at', acceptCutoffIso).order('created_at', { ascending: true }).limit(50);
}

/** from 'care_schedules' */
export function listOpenCareRequests(client: any, startOfDay: any, acceptCutoffIso: any) {
  return client.from('care_schedules')
              .select('*').eq('status', 'pending').is('manager_id', null)
              .gte('scheduled_at', startOfDay().toISOString())
              .gt('created_at', acceptCutoffIso)
              .order('scheduled_at', { ascending: true }).limit(50);
}

/** rpc 'accept_service_application' */
export function acceptServiceApplication(client: any, applicationId: any, scheduledAtIso: any) {
  return client.rpc('accept_service_application', { p_application_id: applicationId, p_scheduled_at: scheduledAtIso });
}

/** from 'care_schedules' */
export function listMySchedules(client: any, user: any, startOfDay: any) {
  return client.from('care_schedules')
            .select('*').eq('manager_id', user.id)
            .neq('status', 'cancelled')
            .or('status.neq.completed,scheduled_at.gte.' + startOfDay().toISOString())
            .order('scheduled_at', { ascending: true }).limit(100);
}

/** rpc 'accept_care_request' */
export function acceptCareRequest(client: any, scheduleId: any) {
  return client.rpc('accept_care_request', { p_schedule_id: scheduleId });
}

/** from 'care_schedules' */
export function listMyCompletedSchedules(client: any, user: any) {
  return client.from('care_schedules')
            .select('id, status, senior_name, senior_age, senior_note, origin, destination, scheduled_at, completed_at, payout_amount, guardian_name, guardian_phone, notes, care_reviews(rating, review_text)')
            .eq('manager_id', user.id).eq('status', 'completed')
            .order('completed_at', { ascending: false }).limit(1000);
}

/** from 'care_reports' */
export function listMyCareReports(client: any, user: any) {
  return client.from('care_reports')
            .select('id, schedule_id, physician_notes, senior_condition, condition_tags, next_visit_date, photos, created_at, care_type, quick_tags, manager_memo, ai_message')
            .eq('manager_id', user.id)
            .order('created_at', { ascending: false }).limit(50);
}

/** rpc 'advance_care_status' */
export function advanceCareStatus(client: any, scheduleId: any, status: any) {
  return client.rpc('advance_care_status', { p_schedule_id: scheduleId, p_status: status });
}

/** from 'care_schedules' */
export function updateScheduleStatusDirect(client: any, status: any, scheduleId: any, user: any) {
  return client.from('care_schedules')
              .update({ status }).eq('id', scheduleId).eq('manager_id', user.id)
              .select('id').single();
}

/** rpc 'record_care_verification' */
export function recordCareVerification(client: any, scheduleId: any, status: any, location: any, photo: any, authMethod: any, authReason: any) {
  return client.rpc('record_care_verification', {
              p_schedule_id: scheduleId, p_status: status, p_location: location || null, p_photo: photo || null,
              p_auth_method: authMethod || null, p_auth_reason: authReason || null
            });
}

/** from 'care_reports' */
export function insertCareReport(client: any, scheduleId: any, user: any, physicianNotes: any, seniorCondition: any, extra: any) {
  return client.from('care_reports').insert([{
            schedule_id: scheduleId, manager_id: user.id,
            physician_notes: physicianNotes || null, senior_condition: seniorCondition || null,
            condition_tags: extra.conditionTags || [],
            next_visit_date: extra.nextVisitDate || null,
            photos: extra.photos || [],
            care_type: extra.careType || 'senior',
            quick_tags: extra.quickTags || [],
            manager_memo: extra.managerMemo || null,
            ai_message: extra.aiMessage || null,
            ai_generated_at: extra.aiGeneratedAt || null
          }]);
}

/** from 'arrival_verification_logs' */
export function insertArrivalVerificationLog(client: any, scheduleId: any, user: any, verificationType: any, status: any, lat: any, lng: any, accuracy: any, distance: any, watermarkedPhoto: any, rawPhoto: any) {
  return client.from('arrival_verification_logs').insert([{
            schedule_id: scheduleId, manager_id: user.id,
            verification_type: verificationType, status,
            current_lat: lat, current_lng: lng, gps_accuracy: accuracy, target_distance_meters: distance,
            watermarked_image_url: watermarkedPhoto, raw_image_url: rawPhoto
          }]);
}

/** from 'care_checkpoints' */
export function insertCareCheckpoint(client: any, scheduleId: any, user: any, step: any, location: any, photo: any) {
  return client.from('care_checkpoints').insert([{
            schedule_id: scheduleId, manager_id: user.id, step,
            lat: (location && typeof location.lat === 'number') ? location.lat : null,
            lng: (location && typeof location.lng === 'number') ? location.lng : null,
            accuracy: (location && location.accuracy) || null,
            photo_url: photo || null
          }]).select().single();
}

/** from 'care_checkpoints' */
export function listCareCheckpointsFor(client: any, scheduleIds: any) {
  return client.from('care_checkpoints')
            .select('schedule_id, step, lat, lng, accuracy, photo_url, checkpoint_at, created_at')
            .in('schedule_id', scheduleIds)
            .order('checkpoint_at', { ascending: true });
}

/** rpc 'report_care_duration_and_bill_extra' */
export function reportCareDurationAndBillExtra(client: any, scheduleId: any, actualDurationMinutes: any) {
  return client.rpc('report_care_duration_and_bill_extra', {
            p_schedule_id: scheduleId, p_actual_duration_minutes: actualDurationMinutes
          });
}

/** from 'manager_telegram_links' */
export function getMyTelegramLink(client: any, currentUser: any) {
  return client
          .from('manager_telegram_links').select('user_id').eq('user_id', currentUser.id).maybeSingle();
}

/** from 'manager_telegram_links' */
export function deleteMyTelegramLink(client: any, currentUser: any) {
  return client.from('manager_telegram_links').delete().eq('user_id', currentUser.id);
}

/** rpc 'request_telegram_link_token' */
export function requestTelegramLinkToken(client: any) {
  return client.rpc('request_telegram_link_token');
}

/** from 'manager_applications' */
export function getMyApprovedApplicationArea(client: any, currentUser: any) {
  return client
            .from('manager_applications')
            .select('address, activity_areas')
            .eq('user_id', currentUser.id)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
}

/** storage */
export function uploadDeparturePhoto(client: any, DEPARTURE_PHOTO_BUCKET: any, path: any, blob: any) {
  return client.storage.from(DEPARTURE_PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
}

/** storage */
export function getDeparturePhotoPublicUrl(client: any, DEPARTURE_PHOTO_BUCKET: any, path: any) {
  return client.storage.from(DEPARTURE_PHOTO_BUCKET).getPublicUrl(path);
}

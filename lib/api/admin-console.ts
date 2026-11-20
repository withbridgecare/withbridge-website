/**
 * 어드민 콘솔이 쓰는 DB·서버 함수 호출 — 예전 public/admin.js 의 쿼리를 그대로 옮겨 이름을 붙였습니다.
 * 관리자 권한은 DB 의 RLS·RPC(is_admin() 등)가 확인합니다 (원칙 4). 인자 이름은 원래 화면 코드의 변수 이름 그대로입니다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** rpc 'admin_reveal_manager_account' */
export function adminRevealManagerAccount(client: any, applicationId: any) {
  return client.rpc('admin_reveal_manager_account', { p_application_id: applicationId });
}

/** from 'service_applications' */
export function countServiceApplications(client: any) {
  return client.from('service_applications').select('id', { count: 'exact', head: true }).is('manager_id', null);
}

/** from 'service_applications' */
export function countServiceApplications2(client: any, todayStartIso: any) {
  return client.from('service_applications').select('id', { count: 'exact', head: true }).gte('created_at', todayStartIso);
}

/** from 'care_schedules' */
export function countCareSchedules(client: any) {
  return client.from('care_schedules').select('id', { count: 'exact', head: true }).not('manager_id', 'is', null).neq('status', 'completed').neq('status', 'cancelled');
}

/** from 'service_applications' */
export function countServiceApplications3(client: any) {
  return client.from('service_applications').select('id', { count: 'exact', head: true }).in('status', ['CANCELLED', 'EXPIRED_CANCELLED']);
}

/** from 'profiles' */
export function getProfiles(client: any, session: any) {
  return client
      .from('profiles')
      .select('id, role, name')
      .eq('id', session.user.id)
      .maybeSingle();
}

/** rpc 'is_super_admin' */
export function isSuperAdmin(client: any) {
  return client.rpc('is_super_admin');
}

/** from 'manager_applications' */
export function listManagerApplications(client: any, MANAGER_APP_COLUMNS: any) {
  return client
      .from('manager_applications')
      .select(MANAGER_APP_COLUMNS + ', gender')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
}

/** from 'manager_applications' */
export function listManagerApplications2(client: any, MANAGER_APP_COLUMNS: any) {
  return client
        .from('manager_applications')
        .select(MANAGER_APP_COLUMNS)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
}

/** rpc 'approve_manager_application' */
export function approveManagerApplication(client: any, applicationId: any) {
  return client.rpc('approve_manager_application', { p_application_id: applicationId });
}

/** rpc 'reject_manager_application' */
export function rejectManagerApplication(client: any, applicationId: any, reason: any) {
  return client.rpc('reject_manager_application', { p_application_id: applicationId, p_reason: reason });
}

/** from 'manager-id-cards' */
export function createSignedUrlManagerIdCards(client: any, path: any) {
  return client.storage.from('manager-id-cards').createSignedUrl(path, 180);
}

/** from 'service_applications' */
export function listServiceApplications(client: any) {
  return client
      .from('service_applications')
      .select('id, created_at, service_type, user_relation, senior_name, senior_age, senior_note, user_contact, address, request_details, status, manager_id, addon_codes, is_package_used, package_remaining_after')
      .is('manager_id', null);
}

/** from 'service_applications' */
export function listServiceApplications2(client: any, cancelledCols: any, cancelledOffset: any, ADMIN_LIST_PAGE_SIZE: any) {
  return client
          .from('service_applications')
          .select(cancelledCols)
          .or('status.ilike.%cancel%,status.ilike.%취소%')
          .order('created_at', { ascending: false })
          .range(cancelledOffset, cancelledOffset + ADMIN_LIST_PAGE_SIZE);
}

/** from 'user_packages' */
export function listUserPackages(client: any, packageUserIds: any) {
  return client
          .from('user_packages')
          .select('user_id, remaining_count')
          .in('user_id', packageUserIds)
          .eq('status', 'active')
          .gt('remaining_count', 0);
}

/** rpc 'admin_restore_package_session' */
export function adminRestorePackageSession(client: any, a: any) {
  return client.rpc('admin_restore_package_session', { p_application_id: a.id });
}

/** rpc 'admin_mark_refund_completed' */
export function adminMarkRefundCompleted(client: any, a: any) {
  return client.rpc('admin_mark_refund_completed', { p_application_id: a.id });
}

/** from 'service_applications' */
export function getServiceApplications(client: any, a: any) {
  return client
      .from('service_applications')
      .select('status, payment_status, final_amount, refund_amount')
      .eq('id', a.id)
      .maybeSingle();
}

/** invoke 'admin-refund-application' */
export function invokeAdminRefundApplication(client: any, adminRefundState: any, isPartial: any, amount: any, reason: any) {
  return client.functions.invoke('admin-refund-application', {
        body: {
          application_id: adminRefundState.application.id,
          refund_type: isPartial ? 'partial' : 'full',
          amount: isPartial ? amount : undefined,
          reason: reason
        }
      });
}

/** invoke 'cancel-expired-applications' */
export function invokeCancelExpiredApplications(client: any) {
  return client.functions.invoke('cancel-expired-applications', { body: {} });
}

/** invoke 'cancel-expired-applications' */
export function invokeCancelExpiredApplications2(client: any, a: any) {
  return client.functions.invoke('cancel-expired-applications', { body: { application_id: a.id } });
}

/** rpc 'admin_confirm_manual_payment' */
export function adminConfirmManualPayment(client: any, a: any) {
  return client.rpc('admin_confirm_manual_payment', { p_application_id: a.id });
}

/** from 'service_applications' */
export function updateServiceApplications(client: any, a: any) {
  return client
      .from('service_applications')
      .update({ status: 'CANCELLED' })
      .eq('id', a.id);
}

/** rpc 'admin_assign_manager' */
export function adminAssignManager(client: any, assignApplicationId: any, managerId: any) {
  return client.rpc('admin_assign_manager', {
      p_application_id: assignApplicationId,
      p_manager_id: managerId
    });
}

/** from 'care_schedules' */
export function listCareSchedules(client: any, CARE_SCHED_BASE_COLS: any) {
  return client
        .from('care_schedules')
        .select(CARE_SCHED_BASE_COLS)
        .not('manager_id', 'is', null)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true });
}

/** from 'care_schedules' */
export function listCareSchedules2(client: any, CARE_SCHED_COMPLETED_COLS: any) {
  return client
        .from('care_schedules')
        .select(CARE_SCHED_COMPLETED_COLS)
        .not('manager_id', 'is', null)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20);
}

/** from 'care_schedules' */
export function listCareSchedules3(client: any, CARE_SCHED_BASE_COLS: any) {
  return client
        .from('care_schedules')
        .select(CARE_SCHED_BASE_COLS)
        .not('manager_id', 'is', null)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true });
}

/** from 'care_schedules' */
export function listCareSchedules4(client: any, CARE_SCHED_COMPLETED_COLS: any) {
  return client
        .from('care_schedules')
        .select(CARE_SCHED_COMPLETED_COLS)
        .not('manager_id', 'is', null)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(20);
}

/** from 'care_checkpoints' */
export function listCareCheckpoints(client: any, scheduleIds: any, CARE_CHECKPOINT_STEPS: any) {
  return client
      .from('care_checkpoints')
      .select('schedule_id, step, lat, lng, accuracy, photo_url, checkpoint_at, created_at')
      .in('schedule_id', scheduleIds)
      .in('step', CARE_CHECKPOINT_STEPS)
      .order('checkpoint_at', { ascending: true });
}

/** rpc 'admin_reassign_care_manager' */
export function adminReassignCareManager(client: any, reassignScheduleId: any, newManagerId: any) {
  return client.rpc('admin_reassign_care_manager', {
        p_schedule_id: reassignScheduleId,
        p_new_manager_id: newManagerId
      });
}

/** rpc 'admin_force_complete_care' */
export function adminForceCompleteCare(client: any, s: any) {
  return client.rpc('admin_force_complete_care', { p_schedule_id: s.id });
}

/** rpc 'admin_request_extra_charge' */
export function adminRequestExtraCharge(client: any, extraChargeScheduleId: any, amount: any, els: any) {
  return client.rpc('admin_request_extra_charge', {
        p_schedule_id: extraChargeScheduleId,
        p_amount: amount,
        p_memo: els.extraChargeMemoInput.value.trim() || null
      });
}

/** rpc 'admin_cancel_extra_charge' */
export function adminCancelExtraCharge(client: any, s: any) {
  return client.rpc('admin_cancel_extra_charge', { p_schedule_id: s.id });
}

/** from 'service_applications' */
export function getServiceApplications2(client: any, s: any) {
  return client.from('service_applications').select('is_package_used').eq('id', s.application_id).maybeSingle();
}

/** invoke 'cancel-payment' */
export function invokeCancelPayment(client: any, s: any, refund: any, memo: any) {
  return client.functions.invoke('cancel-payment', {
        body: { schedule_id: s.id, refund_amount: refund, reason: memo }
      });
}

/** rpc 'admin_adjust_package_session' */
export function adminAdjustPackageSession(client: any, careInterruptState: any, restoreAmount: any, memo: any) {
  return client.rpc('admin_adjust_package_session', {
      p_application_id: careInterruptState.applicationId,
      p_restore_amount: restoreAmount,
      p_memo: memo
    });
}

/** from 'care_issue_reports' */
export function listCareIssueReports(client: any) {
  return client
      .from('care_issue_reports')
      .select('id, application_id, schedule_id, reporter_role, issue_type, detail, status, created_at, ' +
        'service_applications(senior_name, user_contact, service_type), ' +
        'care_schedules(senior_name, guardian_name, guardian_phone, scheduled_at)')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
}

/** rpc 'admin_resolve_care_issue' */
export function adminResolveCareIssue(client: any, r: any) {
  return client.rpc('admin_resolve_care_issue', { p_issue_id: r.id });
}

/** from 'managers' */
export function listManagers(client: any) {
  return client
      .from('managers')
      .select('id, certification, activity_status, last_active_at, approved_at, profiles(name, phone)')
      .eq('certification_verified', true)
      .order('approved_at', { ascending: false });
}

/** from 'managers' */
export function listManagers2(client: any) {
  return client
        .from('managers')
        .select('id, certification, activity_status, approved_at, profiles(name, phone)')
        .eq('certification_verified', true)
        .order('approved_at', { ascending: false });
}

/** from 'profiles' */
export function listProfiles(client: any, ids: any) {
  return client.from('profiles').select('id, name, phone').in('id', ids);
}

/** from 'manager_applications' */
export function listManagerApplications3(client: any, ids: any) {
  return client
      .from('manager_applications')
      .select('user_id, name, phone, activity_areas, status, reviewed_at')
      .in('user_id', ids)
      .order('reviewed_at', { ascending: false });
}

/** rpc 'admin_manager_care_overview' */
export function adminManagerCareOverview(client: any) {
  return client.rpc('admin_manager_care_overview');
}

/** from 'manager_applications' */
export function countManagerApplications(client: any) {
  return client
        .from('manager_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');
}

/** rpc 'admin_set_manager_activity_status' */
export function adminSetManagerActivityStatus(client: any, managerId: any, targetStatus: any) {
  return client.rpc('admin_set_manager_activity_status', {
        p_manager_id: managerId,
        p_status: targetStatus
      });
}

/** rpc 'revoke_manager' */
export function revokeManager(client: any, managerId: any) {
  return client.rpc('revoke_manager', { p_manager_id: managerId });
}

/** from 'managers' */
export function getManagers(client: any, managerId: any) {
  return client.from('managers').select('id, certification_verified').eq('id', managerId).maybeSingle();
}

/** rpc 'admin_manager_monthly_settlements' */
export function adminManagerMonthlySettlements(client: any, requestPayload: any) {
  return client.rpc('admin_manager_monthly_settlements', requestPayload);
}

/** rpc 'admin_manager_monthly_settlement_details' */
export function adminManagerMonthlySettlementDetails(client: any, pMonth: any, managerRow: any) {
  return client.rpc('admin_manager_monthly_settlement_details', {
      p_month: pMonth, p_manager_id: managerRow.manager_id
    });
}

/** from 'service_applications' */
export function listServiceApplications3(client: any, missingIds: any) {
  return client
      .from('service_applications')
      .select('user_id, user_contact, created_at')
      .in('user_id', missingIds)
      .order('created_at', { ascending: false });
}

/** from 'user_packages' */
export function listUserPackages2(client: any, userPackagesOffset: any, ADMIN_LIST_PAGE_SIZE: any) {
  return client
      .from('user_packages')
      .select('id, user_id, package_type, total_count, remaining_count, status, created_at, expires_at, profiles(name, phone)')
      .order('created_at', { ascending: false })
      .range(userPackagesOffset, userPackagesOffset + ADMIN_LIST_PAGE_SIZE);
}

/** rpc 'admin_adjust_user_package' */
export function adminAdjustUserPackage(client: any, packageAdjustTarget: any, delta: any, memo: any) {
  return client.rpc('admin_adjust_user_package', {
        p_package_id: packageAdjustTarget.id, p_delta: delta, p_memo: memo
      });
}

/** rpc 'admin_list_members' */
export function adminListMembers(client: any, MEMBERS_PAGE_SIZE: any, page: any, currentMemberSearchText: any, currentMemberProviderFilter: any, currentMemberVerifiedFilter: any) {
  return client.rpc('admin_list_members', {
      p_limit: MEMBERS_PAGE_SIZE,
      p_offset: (page - 1) * MEMBERS_PAGE_SIZE,
      p_search: currentMemberSearchText || null,
      p_provider: currentMemberProviderFilter === 'all' ? null : currentMemberProviderFilter,
      p_verified: currentMemberVerifiedFilter === 'all' ? null : currentMemberVerifiedFilter
    });
}

/** rpc 'admin_list_members' */
export function adminListMembers2(client: any, batchSize: any, offset: any, currentMemberSearchText: any, currentMemberProviderFilter: any, currentMemberVerifiedFilter: any) {
  return client.rpc('admin_list_members', {
          p_limit: batchSize,
          p_offset: offset,
          p_search: currentMemberSearchText || null,
          p_provider: currentMemberProviderFilter === 'all' ? null : currentMemberProviderFilter,
          p_verified: currentMemberVerifiedFilter === 'all' ? null : currentMemberVerifiedFilter
        });
}

/** rpc 'admin_update_member_profile' */
export function adminUpdateMemberProfile(client: any, memberDetailTarget: any, name: any, phone: any, address: any, addressDetail: any) {
  return client.rpc('admin_update_member_profile', {
        p_user_id: memberDetailTarget.id,
        p_name: name,
        p_phone: phone || null,
        p_address: address || null,
        p_address_detail: addressDetail || null
      });
}

/** from 'admin_member_notes' */
export function listAdminMemberNotes(client: any, userId: any) {
  return client
      .from('admin_member_notes')
      .select('id, note, created_at, admin_id, profiles!admin_id(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
}

/** rpc 'admin_add_member_note' */
export function adminAddMemberNote(client: any, memberDetailTarget: any, note: any) {
  return client.rpc('admin_add_member_note', {
        p_user_id: memberDetailTarget.id,
        p_note: note
      });
}

/** from 'seniors' */
export function listSeniors(client: any, userId: any) {
  return client
      .from('seniors')
      .select('senior_name, senior_birth, gender, senior_phone, mobility_level, health_note')
      .eq('user_id', userId);
}

/** from 'user_coupons' */
export function listUserCoupons(client: any, userId: any) {
  return client
      .from('user_coupons')
      .select('id, coupon_code, amount, status, expires_at')
      .eq('user_id', userId)
      .order('issued_at', { ascending: false });
}

/** from 'user_packages' */
export function listUserPackages3(client: any, userId: any) {
  return client
      .from('user_packages')
      .select('id, package_type, remaining_count, total_count, status, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
}

/** rpc 'admin_grant_member_coupon' */
export function adminGrantMemberCoupon(client: any, memberDetailTarget: any, amount: any, memo: any) {
  return client.rpc('admin_grant_member_coupon', {
          p_user_id: memberDetailTarget.id, p_amount: amount, p_memo: memo
        });
}

/** rpc 'admin_grant_member_package' */
export function adminGrantMemberPackage(client: any, memberDetailTarget: any, packageType: any, memo: any) {
  return client.rpc('admin_grant_member_package', {
          p_user_id: memberDetailTarget.id, p_package_type: packageType, p_memo: memo
        });
}

/** rpc 'admin_adjust_member_sessions' */
export function adminAdjustMemberSessions(client: any, packageId: any, count: any, memo: any) {
  return client.rpc('admin_adjust_member_sessions', {
          p_package_id: packageId, p_delta: -count, p_memo: memo
        });
}

/** rpc 'admin_delete_member_coupon' */
export function adminDeleteMemberCoupon(client: any, couponId: any, memo: any) {
  return client.rpc('admin_delete_member_coupon', { p_coupon_id: couponId, p_memo: memo });
}

/** from 'service_applications' */
export function listServiceApplications4(client: any, userId: any) {
  return client
      .from('service_applications')
      .select('id, created_at, service_type, senior_name, senior_age, senior_note, status, final_amount')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
}

/** from 'partner_inquiries' */
export function updatePartnerInquiries(client: any, newStatus: any, row: any) {
  return client
      .from('partner_inquiries')
      .update({ status: newStatus })
      .eq('id', row.id);
}

/** from 'partner_inquiries' */
export function listPartnerInquiries(client: any) {
  return client
      .from('partner_inquiries')
      .select('*')
      .order('created_at', { ascending: false });
}

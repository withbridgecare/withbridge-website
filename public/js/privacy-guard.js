/* =========================================================
   위드브릿지 개인정보 보호 가드 (모든 페이지 공통 — Supabase SDK 바로 다음, 다른 스크립트보다 먼저 로드)

   1) 운영 도메인에서는 console.log / info / debug 를 끕니다.
      화면 곳곳의 디버그 로그가 신청서 원본 행(이름·연락처·주소)·위치 좌표·회원 id 를 그대로 찍고 있어,
      공용 PC · 화면 공유 · 브라우저 확장프로그램을 통해 회원정보가 새어 나갈 수 있기 때문입니다.
      경고(warn)/오류(error)는 장애 파악용으로 남겨 둡니다. 운영 도메인에서 잠깐 디버그가 필요하면
      주소 뒤에 ?wb_debug=1 을 붙이면 그 탭(세션)에서만 다시 켜집니다.

   2) 비공개 Storage 버킷 사진을 '서명 URL'로 바꿔 보여줍니다.
      care-departure-photos 버킷은 sql/private_storage_and_pii_hardening.sql 로 비공개(private)로
      전환되어, DB 에 저장된 예전 공개 URL(/storage/v1/object/public/...)로는 더 이상 열리지 않습니다.
      WBPrivacy.attachPhotoResolver(client) 를 부르면 화면에 그런 <img> 가 생길 때마다 자동으로
      로그인 사용자 권한(RLS)으로 1시간짜리 서명 URL 을 받아 src 를 바꿔 줍니다 — 해당 일정의
      담당 매니저/보호자/관리자가 아니면 서명 자체가 거부되어 사진이 보이지 않습니다.
========================================================= */
(function () {
  'use strict';

  var PROD_HOSTNAMES = ['withbridgewebsite.vercel.app', 'www.withbridge.kr', 'withbridge.kr'];
  var isProdHost = PROD_HOSTNAMES.indexOf(location.hostname) !== -1;

  // ---------- 1) 운영 환경 디버그 로그 차단 ----------
  var debugOn = false;
  try {
    if (/[?&]wb_debug=1(&|$)/.test(location.search)) sessionStorage.setItem('wb_debug', '1');
    debugOn = sessionStorage.getItem('wb_debug') === '1';
  } catch (e) { /* 저장소를 못 쓰면 기본값(끔) */ }
  if (isProdHost && !debugOn && window.console) {
    var noop = function () {};
    ['log', 'info', 'debug', 'table', 'dir'].forEach(function (k) {
      try { window.console[k] = noop; } catch (e) { /* 무시 */ }
    });
  }

  // ---------- 2) 비공개 버킷 사진 → 서명 URL ----------
  var PRIVATE_BUCKETS = ['care-departure-photos'];
  var SIGNED_TTL_SEC = 3600;
  var cache = {}; // key: bucket/path → { url, exp }

  function parsePrivateRef(src) {
    if (!src || typeof src !== 'string') return null;
    for (var i = 0; i < PRIVATE_BUCKETS.length; i++) {
      var b = PRIVATE_BUCKETS[i];
      // 예전 공개 URL 형식 및 'storage:<bucket>/<path>' 참조 형식을 모두 지원
      var marker = '/storage/v1/object/public/' + b + '/';
      var idx = src.indexOf(marker);
      if (idx !== -1) return { bucket: b, path: decodeURIComponent(src.slice(idx + marker.length).split('?')[0]) };
      var ref = 'storage:' + b + '/';
      if (src.indexOf(ref) === 0) return { bucket: b, path: src.slice(ref.length) };
    }
    return null;
  }

  function signedUrlFor(client, ref) {
    var key = ref.bucket + '/' + ref.path;
    var hit = cache[key];
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
    return client.storage.from(ref.bucket).createSignedUrl(ref.path, SIGNED_TTL_SEC).then(function (res) {
      if (res.error || !res.data || !res.data.signedUrl) throw res.error || new Error('SIGN_FAILED');
      cache[key] = { url: res.data.signedUrl, exp: Date.now() + (SIGNED_TTL_SEC - 300) * 1000 };
      return res.data.signedUrl;
    });
  }

  function resolveImg(client, img) {
    var raw = img.getAttribute('src');
    var ref = parsePrivateRef(raw);
    if (!ref) return;
    img.setAttribute('data-wb-private-src', raw);
    img.removeAttribute('src'); // 접근이 막힌 원본 URL 로 요청이 나가지 않게
    signedUrlFor(client, ref).then(function (url) {
      if (img.getAttribute('data-wb-private-src') === raw) img.setAttribute('src', url);
    }).catch(function () {
      img.alt = img.alt || '사진을 볼 권한이 없습니다';
    });
  }

  function attachPhotoResolver(client) {
    if (!client || !client.storage || attachPhotoResolver._attached) return;
    attachPhotoResolver._attached = true;
    var scan = function (root) {
      if (!root || !root.querySelectorAll) return;
      if (root.tagName === 'IMG') resolveImg(client, root);
      Array.prototype.forEach.call(root.querySelectorAll('img[src]'), function (img) { resolveImg(client, img); });
    };
    var start = function () {
      scan(document.body);
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.type === 'attributes') resolveImg(client, m.target);
          else Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); });
        });
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  // 로그아웃/계정 전환 시 이 브라우저에 남은 케어 관련 로컬 데이터를 지웁니다(공용 PC 대비).
  var LOCAL_CARE_KEYS = ['wb_care_checkpoints', 'wb_schedule_proposals', 'wb_manager_dismissed_requests'];
  function clearLocalCareData() {
    LOCAL_CARE_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } });
  }

  // 예전 버전이 localStorage 'wb_care_checkpoints' 에 남겨 둔 GPS 좌표·인증 사진을 지웁니다(시각만 유지).
  function scrubLegacyCheckpoints() {
    try {
      var raw = localStorage.getItem('wb_care_checkpoints');
      if (!raw) return;
      localStorage.setItem('wb_care_checkpoints', JSON.stringify(stripCheckpointPii(JSON.parse(raw))));
    } catch (e) { try { localStorage.removeItem('wb_care_checkpoints'); } catch (e2) { /* 무시 */ } }
  }
  // 체크포인트 맵({ scheduleId: { step: { at, location, photo }, ... } })에서 위치·사진을 제거한 사본
  function stripCheckpointPii(value) {
    if (Array.isArray(value)) return value.map(stripCheckpointPii);
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).forEach(function (k) {
      if (/^(location|gps|coords|lat|lng|accuracy|photo|photo_url|photoUrl|image)$/.test(k)) return;
      if (/_(location|photo)$/.test(k)) return;
      out[k] = stripCheckpointPii(value[k]);
    });
    return out;
  }
  scrubLegacyCheckpoints();

  window.WBPrivacy = {
    isProdHost: isProdHost,
    attachPhotoResolver: attachPhotoResolver,
    parsePrivateRef: parsePrivateRef,
    clearLocalCareData: clearLocalCareData,
    stripCheckpointPii: stripCheckpointPii
  };
})();

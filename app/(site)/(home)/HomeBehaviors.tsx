'use client';

/**
 * 메인 페이지 동작 모음 — 예전 index.html 의 인라인 <script> 7개를 그대로 옮긴 것입니다.
 *
 * 화면 마크업은 page.tsx(서버에서 미리 그림 → 빠르고 검색 노출에 유리)에 있고, 이 컴포넌트는 화면이
 * 뜬 뒤 그 마크업(클래스·id)을 찾아 동작을 붙입니다. 페이지를 떠나면 각 동작을 정리(cleanup)합니다.
 * 마크업의 클래스/id 를 바꾸면 여기 선택자도 같이 바꿔야 합니다.
 *
 * DB 호출은 lib/api/coupons.ts 를 통합니다 (원칙 2).
 */
import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { claimWelcomeCoupon, hasWelcomeCoupon, markWelcomeCouponNotified } from '@/lib/api/coupons';
import { SITE } from '@/lib/config';
import { REGIONS } from './regions';

export function HomeBehaviors() {
  useHeroSlider();
  useWelcomeCoupon();
  useRegionMap();
  usePriceDots();
  useSolutionTabs();
  useFaq();
  useFixedTopVar();
  return null;
}

const $$ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel) as NodeListOf<T>);

// ---------- 1. 히어로 캐러셀: 탭 · 화살표 · 자동 재생(진행 바 동기화) ----------
function useHeroSlider() {
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>('.wb-main-hero');
    if (!hero) return;
    const slides = $$(hero, '.wb-hero-slide');
    const tabs = $$(hero, '.wb-hero-tab');
    const fills = $$(hero, '.wb-hero-tab-fill');
    const prevBtn = hero.querySelector('.wb-hero-arrow--prev');
    const nextBtn = hero.querySelector('.wb-hero-arrow--next');
    const playPauseBtn = hero.querySelector('.wb-hero-playpause');
    const playPauseIcon = playPauseBtn?.querySelector('.wb-hero-playpause-icon');
    const titleStrong = document.getElementById('wbHeroTitleStrong');
    const titleLight = document.getElementById('wbHeroTitleLight');
    const sub = document.getElementById('wbHeroSub');
    const textFadeEls = $$(hero, '.wb-hero-text-fade');
    const ctaGroups = $$(hero, '.wb-hero-cta-group');
    const PAUSE_ICON = '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>';
    const PLAY_ICON = '<polygon points="6 4 20 12 6 20"></polygon>';
    const total = slides.length;
    if (!total) return;

    const SLIDE_DURATION = 6000;
    let current = 0;
    let paused = false;
    let rafId = 0;
    let segmentStart: number | null = null;
    let elapsed = 0;
    let textTimer: ReturnType<typeof setTimeout> | undefined;

    const applyText = (i: number) => {
      const s = slides[i];
      textFadeEls.forEach((el) => el.classList.add('is-fading'));
      clearTimeout(textTimer);
      textTimer = setTimeout(() => {
        if (titleStrong) titleStrong.textContent = s.dataset.titleStrong || '';
        if (titleLight) titleLight.textContent = s.dataset.titleLight || '';
        if (sub) sub.textContent = s.dataset.sub || '';
        textFadeEls.forEach((el) => el.classList.remove('is-fading'));
      }, 220);
    };
    const setActive = (index: number) => {
      current = (index + total) % total;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === current));
      ctaGroups.forEach((g) => g.classList.toggle('is-active', g.dataset.ctaSlide === String(current)));
      tabs.forEach((t, i) => {
        t.classList.toggle('is-active', i === current);
        t.setAttribute('aria-selected', String(i === current));
      });
      fills.forEach((f) => (f.style.width = '0%'));
      applyText(current);
    };
    const step = (ts: number) => {
      if (segmentStart === null) segmentStart = ts - elapsed;
      elapsed = ts - segmentStart;
      if (fills[current]) fills[current].style.width = Math.min(100, (elapsed / SLIDE_DURATION) * 100) + '%';
      if (elapsed >= SLIDE_DURATION) {
        goTo(current + 1);
        return;
      }
      rafId = requestAnimationFrame(step);
    };
    const startLoop = () => {
      cancelAnimationFrame(rafId);
      segmentStart = null;
      rafId = requestAnimationFrame(step);
    };
    const goTo = (i: number) => {
      setActive(i);
      elapsed = 0;
      segmentStart = null;
      if (!paused) startLoop();
    };
    const togglePause = () => {
      paused = !paused;
      if (paused) cancelAnimationFrame(rafId);
      else startLoop();
      if (playPauseIcon) playPauseIcon.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
      playPauseBtn?.setAttribute('aria-label', paused ? '자동 재생' : '일시정지');
    };

    const onPrev = () => goTo(current - 1);
    const onNext = () => goTo(current + 1);
    const tabHandlers = tabs.map((_, i) => () => goTo(i));
    prevBtn?.addEventListener('click', onPrev);
    nextBtn?.addEventListener('click', onNext);
    tabs.forEach((t, i) => t.addEventListener('click', tabHandlers[i]));
    playPauseBtn?.addEventListener('click', togglePause);
    startLoop(); // 0번 슬라이드 문구는 이미 마크업에 있으므로 페이드 없이 시작

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(textTimer);
      prevBtn?.removeEventListener('click', onPrev);
      nextBtn?.removeEventListener('click', onNext);
      tabs.forEach((t, i) => t.removeEventListener('click', tabHandlers[i]));
      playPauseBtn?.removeEventListener('click', togglePause);
    };
  }, []);
}

// ---------- 2. 웰컴 쿠폰: 가입 축하 토스트(평생 1회) + 히어로 2번 슬라이드 쿠폰 버튼 ----------
function showToast(message: string) {
  const toast = document.getElementById('wbToast');
  const text = document.getElementById('wbToastText');
  if (!toast || !text) return;
  text.textContent = message;
  toast.style.visibility = 'visible';
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';
  });
  const w = window as unknown as { __wbToastTimer?: ReturnType<typeof setTimeout> };
  clearTimeout(w.__wbToastTimer);
  w.__wbToastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 12px)';
    setTimeout(() => (toast.style.visibility = 'hidden'), 250);
  }, 3000);
}
const won = (n: number | null, fallback = '5,000') => (n !== null ? n.toLocaleString('ko-KR') : fallback);

function useWelcomeCoupon() {
  useEffect(() => {
    const client = getSupabase();
    let cancelled = false;
    const btn = document.getElementById('wbHeroCouponBtn') as HTMLAnchorElement | null;
    const DEFAULT_LABEL = btn?.textContent ?? '';
    let claiming = false;

    const setMode = (mode: 'signup' | 'claim' | 'issued') => {
      if (!btn) return;
      btn.dataset.mode = mode;
      if (mode === 'claim') {
        btn.textContent = '5,000원 웰컴 쿠폰 즉시 받기 →';
        btn.href = '#';
        btn.style.backgroundColor = '';
        btn.style.cursor = '';
      } else if (mode === 'issued') {
        btn.textContent = '이미 발급된 웰컴 쿠폰입니다 (내 쿠폰함 보기)';
        btn.href = '/mypage?openCoupons=1';
        btn.style.backgroundColor = '#9CA3AF';
        btn.style.cursor = 'pointer';
      } else {
        btn.textContent = DEFAULT_LABEL;
      }
    };

    const onClick = async (e: MouseEvent) => {
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (!mode || mode === 'signup') return; // 비로그인 → 회원가입 페이지로 그대로 이동
      e.preventDefault();
      if (mode === 'issued') {
        window.location.href = btn.href;
        return;
      }
      if (claiming) return;
      claiming = true;
      const prevText = btn.textContent;
      btn.textContent = '쿠폰 발급 중...';
      btn.style.cursor = 'default';
      try {
        const r = await claimWelcomeCoupon(client);
        showToast(r.issued ? '웰컴 쿠폰이 발급되었습니다!' : won(r.amount) + '원 웰컴 쿠폰은 이미 발급되어 있어요.');
        setMode('issued');
      } catch (err) {
        console.error('[웰컴 쿠폰] claim_welcome_coupon() 호출 실패:', err);
        showToast('쿠폰 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        btn.textContent = prevText;
        btn.style.cursor = 'pointer';
      } finally {
        claiming = false;
      }
    };
    btn?.addEventListener('click', onClick);

    (async () => {
      let userId: string | null = null;
      try {
        const { data } = await client.auth.getSession();
        userId = data.session?.user?.id ?? null;
      } catch {
        /* 네트워크 오류 → 비로그인 동작 유지 */
      }
      if (cancelled) return;
      if (!userId) {
        setMode('signup');
        return;
      }

      // 버튼 상태
      try {
        setMode((await hasWelcomeCoupon(client, userId)) ? 'issued' : 'claim');
      } catch {
        setMode('claim'); // 조회 실패해도 서버가 중복 발급을 막아 줌
      }

      // 가입 축하 토스트: 서버(notified_at)가 '처음 한 번'을 판정, localStorage 는 RPC 생략용 캐시일 뿐
      const seenKey = 'wb_welcome_coupon_notified_' + userId;
      try {
        if (localStorage.getItem(seenKey)) return;
      } catch {
        /* 무시 */
      }
      try {
        const row = await markWelcomeCouponNotified(client);
        if (cancelled) return;
        if (row) showToast('회원가입 축하 ' + won(row.amount) + '원 웰컴 쿠폰이 발급되었습니다!');
        try {
          localStorage.setItem(seenKey, '1');
        } catch {
          /* 무시 */
        }
      } catch {
        /* 다음 방문 때 다시 시도 */
      }
    })();

    return () => {
      cancelled = true;
      btn?.removeEventListener('click', onClick);
    };
  }, []);
}

// ---------- 3. 서비스 지역: 지역 탭 + 카카오 지도 ----------
/* eslint-disable @typescript-eslint/no-explicit-any -- 카카오 지도 SDK 는 타입 정의가 없습니다 */
function useRegionMap() {
  useEffect(() => {
    const tabList = document.getElementById('wbRegionTabs');
    const detailEl = document.getElementById('wbAreaDetail');
    const titleEl = document.getElementById('wbAreaRegionTitle');
    const coverageEl = document.getElementById('wbAreaCoverage');
    const container = document.getElementById('wbRegionMap');
    if (!tabList || !detailEl) return;

    const tabs = $$(tabList, '.wb-area-tab');
    let activeId = tabs[0]?.getAttribute('data-region') ?? null;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let map: any = null;
    const layers: Record<string, any> = {};
    let disposed = false;

    const setActiveTab = (id: string) =>
      tabs.forEach((t) => {
        const on = t.getAttribute('data-region') === id;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
    const renderCard = (id: string) => {
      const r = REGIONS.find((x) => x.id === id);
      if (!r) return;
      clearTimeout(swapTimer);
      detailEl.classList.add('is-fading');
      swapTimer = setTimeout(() => {
        if (titleEl) titleEl.textContent = r.titlePrefix + ' ' + r.tab;
        if (coverageEl) coverageEl.textContent = r.coverage;
        detailEl.classList.remove('is-fading');
      }, 160);
    };
    // 선택한 구 경계 전체가 (여백 8% 포함) 들어오는 가장 가까운 배율
    const fitLayer = (layer: any) => {
      map.relayout();
      if (!container || !container.offsetWidth || !container.offsetHeight) {
        map.setCenter(layer.center);
        map.setLevel(layer.level);
        return;
      }
      const PAD = 0.08;
      for (let lv = 3; lv <= 10; lv++) {
        map.setLevel(lv);
        map.setCenter(layer.center);
        const vb = map.getBounds();
        const sw = vb.getSouthWest();
        const ne = vb.getNorthEast();
        const latPad = (ne.getLat() - sw.getLat()) * PAD;
        const lngPad = (ne.getLng() - sw.getLng()) * PAD;
        if (
          sw.getLat() + latPad <= layer.box.minLat &&
          ne.getLat() - latPad >= layer.box.maxLat &&
          sw.getLng() + lngPad <= layer.box.minLng &&
          ne.getLng() - lngPad >= layer.box.maxLng
        )
          return;
      }
    };
    const showOnMap = (id: string) => {
      if (!map) return;
      Object.keys(layers).forEach((key) => {
        const on = key === id;
        layers[key].shapes.forEach((s: any) => s.setMap(on ? map : null));
        layers[key].pins.forEach((p: any) => p.setMap(on ? map : null));
      });
      if (layers[id]) fitLayer(layers[id]);
    };
    const selectRegion = (id: string) => {
      if (id === activeId) return;
      activeId = id;
      setActiveTab(id);
      renderCard(id);
      showOnMap(id);
    };

    const buildLayer = (region: (typeof REGIONS)[number]) => {
      const kakao = (window as any).kakao;
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      const shapes = region.shapes.map((ring) => {
        const path = ring.map(([lat, lng]) => {
          minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
          return new kakao.maps.LatLng(lat, lng);
        });
        const polygon = new kakao.maps.Polygon({ path, strokeWeight: 2.5, strokeColor: '#1F5C45', strokeOpacity: 0.9, strokeStyle: 'solid', fillColor: '#1F5C45', fillOpacity: 0.22 });
        kakao.maps.event.addListener(polygon, 'click', () => selectRegion(region.id));
        kakao.maps.event.addListener(polygon, 'mouseover', () => polygon.setOptions({ fillOpacity: 0.38 }));
        kakao.maps.event.addListener(polygon, 'mouseout', () => polygon.setOptions({ fillOpacity: 0.22 }));
        return polygon;
      });
      const pins = region.pins.map((pin) => {
        const el = document.createElement('div');
        el.className = 'wb-map-pin';
        const label = document.createElement('div');
        label.className = 'wb-map-pin-label';
        label.textContent = pin.label;
        const dot = document.createElement('div');
        dot.className = 'wb-map-pin-dot';
        el.append(label, dot);
        el.addEventListener('click', () => selectRegion(region.id));
        return new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(pin.lat, pin.lng), content: el, yAnchor: 1 });
      });
      const span = Math.max(maxLat - minLat, maxLng - minLng);
      const box = { minLat, maxLat, minLng, maxLng };
      region.pins.forEach((p) => {
        box.minLat = Math.min(box.minLat, p.lat); box.maxLat = Math.max(box.maxLat, p.lat);
        box.minLng = Math.min(box.minLng, p.lng); box.maxLng = Math.max(box.maxLng, p.lng);
      });
      return { shapes, pins, center: new kakao.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2), level: span > 0.12 ? 7 : 6, box };
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (map && activeId && layers[activeId]) fitLayer(layers[activeId]);
      }, 200);
    };
    const initMap = () => {
      const kakao = (window as any).kakao;
      if (disposed || !container || !kakao?.maps) return;
      REGIONS.forEach((r) => (layers[r.id] = buildLayer(r)));
      const first = activeId ? layers[activeId] : null;
      map = new kakao.maps.Map(container, {
        center: first ? first.center : new kakao.maps.LatLng(37.435, 126.735),
        level: first ? first.level : 7,
      });
      if (activeId) showOnMap(activeId);
      window.addEventListener('resize', onResize);
    };

    const tabHandlers = tabs.map((tab, index) => {
      const id = tab.getAttribute('data-region') || '';
      const onClick = () => selectRegion(id);
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
        tabs[next].click();
      };
      tab.addEventListener('click', onClick);
      tab.addEventListener('keydown', onKey);
      return { tab, onClick, onKey };
    });

    // 카카오 지도 SDK 는 한 번만 불러옵니다 (다른 페이지에 다녀와도 재사용)
    const w = window as any;
    if (w.kakao?.maps?.load) {
      w.kakao.maps.load(initMap);
    } else {
      let sdk = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null;
      if (!sdk) {
        sdk = document.createElement('script');
        sdk.id = 'kakao-map-sdk';
        sdk.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + SITE.kakaoMapAppKey + '&autoload=false';
        document.head.appendChild(sdk);
      }
      sdk.addEventListener('load', () => w.kakao.maps.load(initMap), { once: true });
    }

    return () => {
      disposed = true;
      clearTimeout(swapTimer);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      tabHandlers.forEach(({ tab, onClick, onKey }) => {
        tab.removeEventListener('click', onClick);
        tab.removeEventListener('keydown', onKey);
      });
    };
  }, []);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- 4. 요금 카드 모바일 가로 스와이프 위치 점 ----------
function usePriceDots() {
  useEffect(() => {
    const grid = document.querySelector<HTMLElement>('.wb-price-page--summary .wb-pricing-grid');
    const dotsBox = document.getElementById('wbPriceDots');
    if (!grid || !dotsBox) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    dotsBox.textContent = '';
    const dots = cards.map((card, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', i + 1 + '번째 요금 카드 보기');
      b.addEventListener('click', () => grid.scrollTo({ left: card.offsetLeft - grid.offsetLeft - 16, behavior: 'smooth' }));
      dotsBox.appendChild(b);
      return b;
    });
    const sync = () => {
      const max = grid.scrollWidth - grid.clientWidth;
      const idx = max > 0 ? Math.round((grid.scrollLeft / max) * (cards.length - 1)) : 0;
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === idx);
        d.setAttribute('aria-selected', String(i === idx));
      });
    };
    const onScroll = () => requestAnimationFrame(sync);
    grid.addEventListener('scroll', onScroll, { passive: true });
    sync();
    return () => {
      grid.removeEventListener('scroll', onScroll);
      dotsBox.textContent = '';
    };
  }, []);
}

// ---------- 5. '이런 점이 걱정되시나요?' 솔루션 탭 (마우스 올리면 미리보기, 클릭하면 고정) ----------
const SOLUTIONS = [
  { id: '1', title: '안심 이동 지원', desc: '자택부터 병원·외출까지 도보 및 대중교통/택시로 꼼꼼하게 동행합니다.', image: '/images/warm-spring-walk-holding-hands.webp' },
  { id: '2', title: '실시간 상황 공유', desc: '진료 내용과 건강 상태를 보호자에게 실시간으로 꼼꼼히 전달합니다.', image: '/images/smartphone-warm-connection.webp' },
  { id: '3', title: '전문 동행 인력 교육 이수', desc: '체계적인 교육을 이수한 전문 사회복지사, 요양보호사가 전담 배정됩니다.', image: '/images/warm-care-training-classroom.webp' },
  { id: '4', title: '맞춤형 케어 솔루션', desc: '건강 상태와 일정을 반영한 1:1 맞춤형 케어 동행 서비스를 제공합니다.', image: '/images/tablet-living-room-together.webp' },
  { id: '5', title: '맞춤형 생활 & 복약 케어', desc: '복약 지도, 진료 수속 등 어르신 상황에 맞는 현장 밀착 지원을 제공합니다.', image: '/images/warm-medication-organizing-time.webp' },
];

function useSolutionTabs() {
  useEffect(() => {
    const tabList = document.getElementById('wbPainTabList');
    const card = document.getElementById('wbSolutionHeroCard');
    const image = document.getElementById('wbSolutionHeroImage');
    const title = document.getElementById('wbSolutionHeroTitle');
    const desc = document.getElementById('wbSolutionHeroDesc');
    if (!tabList || !card) return;
    const tabs = $$(tabList, '.wb-pain-tab');
    let activeId = tabs[0]?.getAttribute('data-solution') ?? null;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;

    const render = (id: string | null) => {
      const s = SOLUTIONS.find((x) => x.id === id);
      if (!s) return;
      clearTimeout(swapTimer);
      card.classList.add('is-fading');
      swapTimer = setTimeout(() => {
        if (image) image.style.backgroundImage = "url('" + s.image + "')";
        if (title) title.textContent = s.title;
        if (desc) desc.textContent = s.desc;
        card.classList.remove('is-fading');
      }, 200);
    };
    const handlers = tabs.map((tab) => {
      const id = tab.getAttribute('data-solution');
      const enter = () => id !== activeId && render(id);
      const leave = () => id !== activeId && render(activeId);
      const click = () => {
        if (id === activeId) return;
        activeId = id;
        tabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-solution') === id));
        render(id);
      };
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tab.click();
        }
      };
      tab.addEventListener('mouseenter', enter);
      tab.addEventListener('mouseleave', leave);
      tab.addEventListener('click', click);
      tab.addEventListener('keydown', key);
      return { tab, enter, leave, click, key };
    });
    return () => {
      clearTimeout(swapTimer);
      handlers.forEach(({ tab, enter, leave, click, key }) => {
        tab.removeEventListener('mouseenter', enter);
        tab.removeEventListener('mouseleave', leave);
        tab.removeEventListener('click', click);
        tab.removeEventListener('keydown', key);
      });
    };
  }, []);
}

// ---------- 6. 자주 묻는 질문: 카테고리 탭 + 하나만 펼치는 아코디언 ----------
function useFaq() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tab = target.closest<HTMLElement>('.wb-faq-tab[data-faq-category]');
      if (tab) {
        const category = tab.dataset.faqCategory;
        $$(document, '.wb-faq-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        $$(document, '.wb-faq-item').forEach((item) => {
          item.classList.remove('active');
          const a = item.querySelector<HTMLElement>('.wb-faq-answer');
          if (a) a.style.maxHeight = '';
          item.classList.toggle('hidden', !(category === 'all' || item.getAttribute('data-category') === category));
        });
        return;
      }
      const q = target.closest<HTMLElement>('.wb-faq-question');
      if (q) {
        const item = q.parentElement;
        const answer = item?.querySelector<HTMLElement>('.wb-faq-answer');
        if (!item || !answer) return;
        const wasActive = item.classList.contains('active');
        $$(document, '.wb-faq-item.active').forEach((open) => {
          open.classList.remove('active');
          const a = open.querySelector<HTMLElement>('.wb-faq-answer');
          if (a) a.style.maxHeight = '';
        });
        if (!wasActive) {
          item.classList.add('active');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

// ---------- 7. 모바일: 고정된 띠배너+헤더 높이를 CSS 변수로 (섹션 스냅 기준선) ----------
function useFixedTopVar() {
  useEffect(() => {
    const update = () => {
      let h = 0;
      ['.wb-top-banner', 'header'].forEach((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && getComputedStyle(el).position === 'fixed') h += el.offsetHeight;
      });
      if (h) document.documentElement.style.setProperty('--wb-fixed-top', h + 'px');
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--wb-fixed-top');
    };
  }, []);
}

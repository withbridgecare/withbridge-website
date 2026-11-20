/**
 * 네이티브 <select> 를 사이트 디자인의 선택 버튼으로 바꿔 보여주는 웹 전용 도우미.
 *
 * 왜: 브라우저마다 <select> 목록 창을 다르게 그려서, 일부 환경(특히 PC 브라우저의 휴대폰 화면 흉내,
 * 일부 안드로이드 웹뷰)에서는 작은 목록이 엉뚱한 위치에 떠 잘 보이지 않았습니다.
 *
 * 방식: 원래 <select> 는 그대로 두되 화면에서만 숨기고(값·change 이벤트·폼 로직은 전부 그대로),
 * 그 자리에 버튼을 보여 줍니다. 누르면
 *   - 휴대폰(767px 이하): 화면 아래에서 올라오는 목록(바텀시트, 항목 제목 + 큰 선택지)
 *   - PC: 버튼 바로 아래 드롭다운
 * 기존 스크립트가 select.value / selectedIndex / disabled 를 바꾸거나 <option> 을 다시 채워도
 * 버튼 표시가 자동으로 따라갑니다. 스타일은 각 페이지 CSS 의 .wb-sel-* 규칙(예: apply.css).
 */

type Cleanup = () => void;

const MOBILE_QUERY = '(max-width: 767.98px)';
const CHEVRON =
  '<svg class="wb-sel-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

let uid = 0;

/** 'value' 등 속성을 이 요소 하나에만 덮어써, 바뀔 때 onChange 를 부릅니다(원래 동작은 그대로 실행). */
function watchProperty(el: HTMLSelectElement, name: 'value' | 'selectedIndex' | 'disabled', onChange: () => void) {
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, name);
  if (!desc || !desc.get || !desc.set) return;
  Object.defineProperty(el, name, {
    configurable: true,
    get() {
      return desc.get!.call(this);
    },
    set(v) {
      desc.set!.call(this, v);
      onChange();
    },
  });
}

/** 항목 이름: <label for="id"> 또는 감싸는 fieldset 의 legend 에서 '*'·'(필수)' 등을 뺀 글자 */
function fieldTitle(select: HTMLSelectElement): string {
  const label = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
  const legend = select.closest('fieldset')?.querySelector('legend');
  const raw = (label?.textContent || legend?.textContent || '').replace(/\*|\(필수\)|\(선택\)/g, '');
  return raw.replace(/\s+/g, ' ').trim() || '선택해 주세요';
}

/** '선택해주세요' 처럼 값이 빈 안내용 첫 항목인지 ('쿠폰 사용 안 함' 처럼 값이 비어도 고를 수 있는 항목은 제외) */
function isPlaceholder(opt: HTMLOptionElement) {
  return opt.value === '' && /선택/.test(opt.text);
}

export function enhanceSelect(select: HTMLSelectElement): Cleanup {
  const id = 'wbSel' + ++uid;
  const mq = window.matchMedia(MOBILE_QUERY);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'text-input wb-sel-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id + '-list');
  trigger.innerHTML = '<span class="wb-sel-value"></span>' + CHEVRON;
  const valueEl = trigger.querySelector('.wb-sel-value') as HTMLSpanElement;
  if (select.id) {
    // <label for="원래 select id"> 를 눌렀을 때도 버튼이 반응하도록 라벨 연결을 버튼으로 옮김
    trigger.id = select.id + '-trigger';
    document.querySelectorAll<HTMLLabelElement>(`label[for="${CSS.escape(select.id)}"]`).forEach((l) => (l.htmlFor = trigger.id));
  }

  select.classList.add('wb-sel-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.insertAdjacentElement('afterend', trigger);

  let backdrop: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let activeIndex = -1;
  let items: HTMLOptionElement[] = [];

  function sync() {
    const opt = select.selectedOptions[0] || select.options[0];
    valueEl.textContent = opt ? opt.text : '';
    trigger.classList.toggle('is-placeholder', !opt || isPlaceholder(opt));
    trigger.disabled = select.disabled;
  }

  function close(returnFocus = true) {
    if (!panel) return;
    panel.remove();
    backdrop?.remove();
    panel = null;
    backdrop = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('wb-sel-open');
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
    if (returnFocus) trigger.focus();
  }

  function choose(opt: HTMLOptionElement) {
    if (select.value !== opt.value || select.selectedIndex !== opt.index) {
      select.selectedIndex = opt.index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  }

  function setActive(i: number) {
    if (!panel) return;
    activeIndex = Math.max(0, Math.min(items.length - 1, i));
    panel.querySelectorAll<HTMLElement>('.wb-sel-option').forEach((el, idx) => {
      el.classList.toggle('is-active', idx === activeIndex);
      if (idx === activeIndex) {
        panel!.querySelector('[role="listbox"]')?.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function placePanel() {
    if (!panel || mq.matches) return; // 휴대폰은 CSS 로 화면 아래 고정
    const r = trigger.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const height = Math.min(panel.scrollHeight, 320);
    panel.style.left = r.left + 'px';
    panel.style.width = r.width + 'px';
    panel.style.top = (below < height + 12 && r.top > below ? r.top - height - 6 : r.bottom + 6) + 'px';
  }

  function onViewportChange(e: Event) {
    if (!panel) return;
    // PC 드롭다운은 페이지가 움직이면 닫음(목록 안 스크롤은 제외). 휴대폰 시트는 고정이라 그대로 둠.
    if (e.type === 'scroll' && (mq.matches || (e.target instanceof Node && panel.contains(e.target)))) return;
    close(false);
  }

  function open() {
    if (panel || select.disabled) return;
    items = Array.from(select.options).filter((o) => !o.disabled && !isPlaceholder(o));
    if (!items.length) return;

    backdrop = document.createElement('div');
    backdrop.className = 'wb-sel-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      e.preventDefault();
      close();
    });

    panel = document.createElement('div');
    panel.className = 'wb-sel-panel';
    const title = document.createElement('p');
    title.className = 'wb-sel-title';
    title.textContent = fieldTitle(select);
    const list = document.createElement('ul');
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', title.textContent);
    list.tabIndex = -1;
    items.forEach((opt, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.className = 'wb-sel-option';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(opt.selected));
      li.textContent = opt.text;
      li.addEventListener('click', () => choose(opt));
      li.addEventListener('mousemove', () => setActive(i));
      list.appendChild(li);
    });
    list.addEventListener('keydown', onListKey);
    panel.append(title, list);
    document.body.append(backdrop, panel);

    trigger.setAttribute('aria-expanded', 'true');
    if (mq.matches) document.documentElement.classList.add('wb-sel-open');
    placePanel();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    const current = items.findIndex((o) => o.selected);
    setActive(current >= 0 ? current : 0);
    list.focus();
  }

  function onListKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (items[activeIndex]) choose(items[activeIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  }

  const onTriggerClick = () => (panel ? close() : open());
  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
  };
  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKey);

  // 기존 스크립트가 select 에 포커스를 주면(오류 칸 안내 등) 버튼으로 넘김
  const nativeFocus = select.focus;
  select.focus = (opts?: FocusOptions) => trigger.focus(opts);

  watchProperty(select, 'value', sync);
  watchProperty(select, 'selectedIndex', sync);
  watchProperty(select, 'disabled', sync);
  select.addEventListener('change', sync);
  const observer = new MutationObserver(sync); // <option> 다시 채우기·disabled 속성 변경
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  sync();

  return () => {
    close(false);
    observer.disconnect();
    select.removeEventListener('change', sync);
    delete (select as unknown as Record<string, unknown>).value;
    delete (select as unknown as Record<string, unknown>).selectedIndex;
    delete (select as unknown as Record<string, unknown>).disabled;
    select.focus = nativeFocus;
    if (select.id) {
      document.querySelectorAll<HTMLLabelElement>(`label[for="${CSS.escape(trigger.id)}"]`).forEach((l) => (l.htmlFor = select.id));
    }
    trigger.remove();
    select.classList.remove('wb-sel-native');
    select.removeAttribute('aria-hidden');
    select.removeAttribute('tabindex');
  };
}

/** id 목록의 <select> 를 모두 바꿔 보여 주고, 한 번에 되돌리는 정리 함수를 돌려줍니다. */
export function enhanceSelects(ids: string[]): Cleanup {
  const cleanups = ids
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLSelectElement => el instanceof HTMLSelectElement)
    .map((el) => enhanceSelect(el));
  return () => cleanups.forEach((fn) => fn());
}

/**
 * 어드민 공용 '처리 완료' 알림창.
 *
 * 팝업·확인창으로 실행한 작업(배정·환불·입금 확인·승인·공지 등록 등)이 성공하면 예전에는 화면 아래 토스트가
 * 2.4초 떴다가 목록이 바로 다시 그려져, 처리됐는지 놓치기 쉬웠습니다. 이제는
 *   1) 이 알림창("정상적으로 처리되었습니다" + 무엇을 했는지)을 띄우고
 *   2) 관리자가 [확인]을 누르면(Enter·Esc·바깥 클릭도 동일) 그때 목록을 새로 불러옵니다.
 * 사용법:  await showDoneNotice('매니저를 배정했습니다.');  loadApplications();
 * 실패 안내·복사/다운로드 같은 가벼운 안내는 기존 토스트를 그대로 씁니다. 스타일: admin-shared.css .admin-done-*
 */
export function showDoneNotice(message: string, title = '정상적으로 처리되었습니다'): Promise<void> {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement as HTMLElement | null;

    const overlay = document.createElement('div');
    overlay.className = 'admin-done-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'adminDoneTitle');
    overlay.setAttribute('aria-describedby', 'adminDoneBody');

    const card = document.createElement('div');
    card.className = 'admin-done-card';
    card.innerHTML =
      '<div class="admin-done-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>';
    const titleEl = document.createElement('p');
    titleEl.className = 'admin-done-title';
    titleEl.id = 'adminDoneTitle';
    titleEl.textContent = title;
    const bodyEl = document.createElement('p');
    bodyEl.className = 'admin-done-body';
    bodyEl.id = 'adminDoneBody';
    bodyEl.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-btn is-primary admin-done-btn';
    btn.textContent = '확인';
    card.append(titleEl, bodyEl, btn);
    overlay.appendChild(card);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // 뒤에 열린 팝업의 Esc 처리 등으로 이어지지 않게
        close();
      } else if (e.key === 'Tab') {
        e.preventDefault(); // 버튼이 하나뿐이라 포커스를 안에 가둠
        btn.focus();
      }
    };
    btn.addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    btn.focus();
  });
}

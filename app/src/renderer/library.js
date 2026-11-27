import { shell, icon, themeButton, esc, paintIcons } from './ui.js';

export function progressOf(course, state) {
  const completed = state.progress[course.id]?.completed || [];
  const count = course.lessons.filter(lesson => completed.includes(lesson.id)).length;
  return { count, total: course.lessons.length, percent: Math.round(count / course.lessons.length * 100) };
}
export function renderLibrary(state) {
  const cards = state.courses.map(course => {
    const progress = progressOf(course,state);
    return `<article class="course-card minimal-course"><button class="minimal-course-main" data-open-course="${esc(course.id)}"><div class="minimal-course-meta"><span class="minimal-course-icon ${esc(course.accent)}">${icon('code-2')}</span><span>FastAPI</span>${icon('arrow-up-right')}</div><h2>${esc(course.title)}</h2><span class="minimal-course-count">총 ${progress.total}강</span></button><div class="minimal-course-footer"><span>${progress.count} / ${progress.total}강 학습</span><strong>${progress.percent}%</strong><button class="icon-button" data-edit-course="${esc(course.id)}" title="수정" aria-label="${esc(course.title)} 수정">${icon('pencil')}</button></div><div class="progress-track" role="progressbar" aria-label="${esc(course.title)} 수강률" aria-valuenow="${progress.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.percent}%"></span></div></article>`;
  }).join('');
  const html = `<div class="library-page"><div class="minimal-library"><header class="minimal-library-header"><div><h1>강의 목록</h1><p>강의를 선택하세요.</p></div><div class="top-actions"><button class="icon-button" data-action="settings" title="실습 환경" aria-label="실습 환경">${icon('settings-2')}</button>${themeButton(state.settings.theme)}<button class="button primary small" data-action="create">${icon('plus')}만들기</button></div></header>${cards ? `<div class="course-grid minimal-course-grid">${cards}</div>` : `<div class="empty-state"><span class="empty-icon">${icon('book-open')}</span><h3>강의가 없습니다</h3><p>ZIP, JSON 파일 또는 폴더를 추가하세요.</p><button class="button primary" data-action="import">추가</button></div>`}<button class="floating-add" data-action="import" title="추가" aria-label="추가">${icon('plus')}</button></div></div>`;
  document.querySelector('#app').innerHTML = shell(html);
  paintIcons();
}

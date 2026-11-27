import { titlebar, icon, esc, paintIcons, themeButton, toast, promptModal, confirmModal } from './ui.js';
import { renderMarkdown } from './markdown.js';
import { makeEditor } from './editors.js';
import { progressOf } from './library.js';

export async function createReader(state, courseId, onExit, onEdit) {
  const course = state.courses.find(item => item.id === courseId);
  if (!course) throw new Error('강의를 찾을 수 없습니다.');
  const progress = state.progress[courseId] || { completed: [] };
  let lessonId = course.lessons.some(item=>item.id === progress.lastLessonId) ? progress.lastLessonId : course.lessons[0].id;
  let workspace, editor, saveTimer, runBusy = false, destroyed = false, logs = '', runtimeStatus = 'stopped';
  let panel = 'article';
  const lesson = () => course.lessons.find(item=>item.id === lessonId);
  async function flush() {
    clearTimeout(saveTimer);
    if (!workspace) return;
    const copy = structuredClone(workspace);
    state.workspaces[`${courseId}/${lessonId}`] = copy;
    await window.learncode.saveWorkspace(courseId, lessonId, copy);
    const label = document.querySelector('#code-save-label'); if (label) label.textContent = '저장됨';
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    const label = document.querySelector('#code-save-label'); if (label) label.textContent = '저장 중…';
    saveTimer = setTimeout(() => flush().catch(error=>toast(error.message,'error')), 500);
  }
  function fileTree() {
    const dirs = new Set(); let rows = '';
    for (const file of Object.keys(workspace.files).sort()) {
      const parts = file.split('/');
      for (let index = 0; index < parts.length-1; index++) {
        const folder = parts.slice(0,index+1).join('/');
        if (!dirs.has(folder)) { dirs.add(folder); rows += `<div class="tree-folder" style="padding-left:${12+index*12}px">${icon('chevron-down')}${icon('folder')}<span>${esc(parts[index])}</span></div>`; }
      }
      rows += `<button class="tree-file ${file === workspace.activeFile ? 'active' : ''}" data-file="${esc(file)}" style="padding-left:${14+(parts.length-1)*12}px" title="${esc(file)}">${icon('file-code-2')}<span>${esc(parts.at(-1))}</span></button>`;
    }
    return rows;
  }
  function practiceMarkup() {
    return `<div class="practice-heading"><div>${icon('code-2')}<strong>실습</strong><span class="python-badge">Python · FastAPI</span></div><div><button class="icon-button" data-action="code-theme" title="코드 테마 전환" aria-label="코드 테마 전환">${icon(state.settings.codeTheme === 'dark' ? 'sun' : 'moon')}</button><button class="button run-button small" data-action="run-code" id="run-code">${icon('play')}실행</button></div></div><div class="practice-editor-layout"><aside class="file-explorer"><div class="explorer-heading"><span>파일</span><button class="icon-button" data-action="add-file" title="Python 파일 추가" aria-label="Python 파일 추가">${icon('file-plus-2')}</button></div><div class="project-name">${icon('chevron-down')}${icon('folder-open')}<span>프로젝트</span></div><div id="file-tree">${fileTree()}</div></aside><div class="code-editor-pane"><div class="code-file-tabs" id="code-file-tabs"></div><div id="python-editor"></div><div class="editor-status"><span id="code-save-label">저장됨</span><span>Python &nbsp; UTF-8</span><div><button data-action="rename-file" title="이름 변경" aria-label="이름 변경">${icon('pencil')}</button><button data-action="delete-file" title="삭제" aria-label="삭제">${icon('trash-2')}</button><button data-action="reset-workspace" title="초기화" aria-label="초기화">${icon('rotate-ccw')}</button></div></div></div></div><div class="runtime-bar"><span class="runtime-state"><i id="runtime-dot"></i><span id="runtime-state-text">중지됨</span></span><label>실행 모듈<input id="runtime-entrypoint" value="${esc(lesson().entrypoint)}" aria-label="실행 모듈" /></label><button class="text-button" data-action="open-docs">API 문서${icon('external-link')}</button></div><section class="console-panel"><div class="console-tabs"><span>${icon('square-terminal')} 실행 로그</span><span>localhost:8083</span><button class="icon-button" data-action="clear-console" title="로그 지우기" aria-label="로그 지우기">${icon('trash-2')}</button></div><div id="console-logs"><pre id="runtime-logs"></pre><div class="console-placeholder" id="console-placeholder"><p>실행하면 로그가 표시됩니다.</p></div></div></section>`;
  }
  async function render() {
    editor?.destroy();
    const current = lesson();
    workspace = structuredClone(state.workspaces[`${courseId}/${lessonId}`] || { files: current.files, activeFile: Object.keys(current.files)[0] });
    if (!Object.hasOwn(workspace.files,workspace.activeFile)) workspace.activeFile = Object.keys(workspace.files)[0];
    state.progress[courseId] = await window.learncode.updateProgress(courseId, lessonId, {});
    const stats = progressOf(course,state); const index = course.lessons.indexOf(current); const completed = state.progress[courseId].completed.includes(lessonId);
    document.querySelector('#app').innerHTML = `${titlebar()}<div class="reader-page" data-panel="${panel}"><header class="reader-header"><div><button class="icon-button" data-action="toggle-lessons" title="목록 접기/펼치기" aria-label="목록 접기/펼치기">${icon('panel-left-close')}</button><span class="reader-course-name">${esc(course.title)}</span></div><div>${themeButton(state.settings.theme)}<button class="icon-button" data-action="download-course" title="다운로드" aria-label="다운로드">${icon('download')}</button><button class="icon-button" data-action="edit-current-course" title="수정" aria-label="수정">${icon('pencil')}</button></div></header><div class="reader-body"><aside class="lesson-sidebar"><div class="lesson-sidebar-heading"><h3>강좌 목록</h3><div class="sidebar-progress"><span>${stats.count} / ${stats.total}강 완료</span><strong>${stats.percent}%</strong></div><div class="progress-track"><span style="width:${stats.percent}%"></span></div></div><div class="lesson-list">${course.lessons.map((item,itemIndex)=>`<button class="lesson-item ${item.id === lessonId ? 'active' : ''}" data-lesson="${esc(item.id)}"><span class="lesson-state ${state.progress[courseId].completed.includes(item.id) ? 'completed' : ''}">${state.progress[courseId].completed.includes(item.id) ? icon('check') : String(itemIndex+1).padStart(2,'0')}</span><div><strong>${esc(item.title)}</strong></div></button>`).join('')}</div><div class="lesson-sidebar-bottom"><button class="button secondary" data-action="home">${icon('arrow-left')}돌아가기</button></div></aside><div class="reader-content"><div class="mobile-panel-tabs"><button class="${panel === 'article' ? 'active' : ''}" data-reader-panel="article">${icon('book-open')}읽기</button><button class="${panel === 'practice' ? 'active' : ''}" data-reader-panel="practice">${icon('code-2')}실습</button></div><div class="reader-panes"><section class="article-pane"><div class="article-scroll"><header class="article-header"><div class="article-eyebrow"><span>${index+1}강</span></div><h1>${esc(current.title)}</h1><p>${esc(course.title)}</p><div class="article-rule"></div></header><article class="prose" id="lesson-content"></article><footer class="article-footer"><div><p>${completed ? '완료했습니다.' : '완료하면 수강률에 반영됩니다.'}</p></div><button class="button ${completed ? 'secondary' : 'primary'}" data-action="complete-lesson">${icon(completed ? 'check-check' : 'check')}${completed ? '완료 해제' : '완료'}</button></footer><div class="lesson-pagination"><button class="text-button" data-step="-1" ${index === 0 ? 'disabled' : ''}>${icon('arrow-left')}이전</button><span>${index+1} / ${course.lessons.length}</span><button class="text-button" data-step="1" ${index === course.lessons.length-1 ? 'disabled' : ''}>다음${icon('arrow-right')}</button></div></div></section><div class="pane-resizer" role="separator" aria-label="강의와 실습 너비 조절" aria-orientation="vertical" tabindex="0">${icon('grip-vertical')}</div><section class="practice-pane" data-code-theme="${state.settings.codeTheme}">${practiceMarkup()}</section></div></div></div></div>`;
    renderMarkdown(document.querySelector('#lesson-content'),current.content);
    renderCode(); paintIcons(); updateStatus(); updateConsole(); bindResizer();
  }
  function renderCode() {
    editor?.destroy();
    document.querySelector('#file-tree').innerHTML = fileTree();
    document.querySelector('#code-file-tabs').innerHTML = Object.keys(workspace.files).map(file=>`<button class="${file === workspace.activeFile ? 'active' : ''}" data-file="${esc(file)}" title="${esc(file)}">${icon('file-code-2')}${esc(file.split('/').at(-1))}</button>`).join('');
    const root = document.querySelector('#python-editor'); root.innerHTML = '';
    editor = makeEditor(root,{ value: workspace.files[workspace.activeFile], dark: state.settings.codeTheme === 'dark', onChange: value => { workspace.files[workspace.activeFile] = value; scheduleSave(); }, onSave: () => flush().then(()=>toast('코드를 저장했습니다.')).catch(error=>toast(error.message,'error')) });
    paintIcons();
  }
  function bindResizer() {
    const resizer = document.querySelector('.pane-resizer'); const panes = document.querySelector('.reader-panes');
    const set = (fraction) => { panes.style.setProperty('--article-ratio', `${Math.min(65,Math.max(30,fraction))}%`); editor?.view.requestMeasure(); };
    resizer.onpointerdown = event => { resizer.setPointerCapture(event.pointerId); resizer.classList.add('dragging'); document.body.classList.add('resizing'); };
    resizer.onpointermove = event => { if (resizer.hasPointerCapture(event.pointerId)) { const rect = panes.getBoundingClientRect(); set((event.clientX - rect.left) / rect.width * 100); } };
    resizer.onpointerup = event => { resizer.releasePointerCapture(event.pointerId); resizer.classList.remove('dragging'); document.body.classList.remove('resizing'); };
    resizer.onkeydown = event => { if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); const width = document.querySelector('.article-pane').getBoundingClientRect().width / panes.getBoundingClientRect().width * 100; set(width + (event.key === 'ArrowLeft' ? -3 : 3)); } };
  }
  function updateStatus() {
    const button = document.querySelector('#run-code'); if (!button) return;
    button.disabled = runBusy;
    button.innerHTML = runBusy ? `${icon('loader-circle','spin')}준비 중` : runtimeStatus === 'running' ? `${icon('square')}중지` : `${icon('play')}실행`;
    button.classList.toggle('running',runtimeStatus === 'running');
    document.querySelector('#runtime-dot').className = runtimeStatus;
    document.querySelector('#runtime-state-text').textContent = runtimeStatus === 'running' ? '127.0.0.1:8083 실행 중' : runtimeStatus === 'starting' ? '시작 중…' : '중지됨';
    paintIcons(button);
  }
  function updateConsole() {
    const root = document.querySelector('#runtime-logs'); if (!root) return;
    root.textContent = logs;
    document.querySelector('#console-placeholder').hidden = !!logs;
    const box = document.querySelector('#console-logs'); box.scrollTop = box.scrollHeight;
  }
  async function switchLesson(id) {
    if (id === lessonId) return;
    await flush(); await window.learncode.stopRuntime(); logs = ''; lessonId = id; await render();
  }
  async function run() {
    if (runBusy) return;
    runBusy = true; updateStatus();
    try {
      if (runtimeStatus === 'running') { await window.learncode.stopRuntime(); return; }
      await flush(); logs = ''; updateConsole();
      const entrypoint = document.querySelector('#runtime-entrypoint').value.trim();
      await window.learncode.startRuntime({ courseId, lessonId, files: workspace.files, entrypoint });
      toast('서버를 실행했습니다.');
    } catch (error) { logs = `${logs}\n${error.message}\n`; updateConsole(); throw error; }
    finally { runBusy = false; updateStatus(); }
  }
  function validateFile(name, previous = '') {
    if (!/^(?:[A-Za-z_]\w*\/)*[A-Za-z_]\w*\.py$/.test(name)) throw new Error('영문, 숫자, 밑줄을 사용한 .py 경로를 입력하세요.');
    if (Object.keys(workspace.files).some(file=>file.toLowerCase() === name.toLowerCase() && file !== previous)) throw new Error('같은 이름의 파일이 있습니다.');
    if (Object.keys(workspace.files).length >= 80 && !previous) throw new Error('파일은 최대 80개까지 추가할 수 있습니다.');
  }
  async function action(name, target) {
    if (target?.dataset.lesson) { await switchLesson(target.dataset.lesson); return true; }
    if (target?.dataset.step) { const destination = course.lessons.indexOf(lesson()) + Number(target.dataset.step); if (course.lessons[destination]) await switchLesson(course.lessons[destination].id); return true; }
    if (target?.dataset.file) { workspace.activeFile = target.dataset.file; renderCode(); scheduleSave(); return true; }
    if (target?.dataset.readerPanel) { panel = target.dataset.readerPanel; document.querySelector('.reader-page').dataset.panel = panel; document.querySelectorAll('[data-reader-panel]').forEach(button=>button.classList.toggle('active',button.dataset.readerPanel === panel)); editor?.view.requestMeasure(); return true; }
    if (name === 'run-code') { await run(); return true; }
    if (name === 'complete-lesson') { const completed = state.progress[courseId].completed.includes(lessonId); state.progress[courseId] = await window.learncode.updateProgress(courseId,lessonId,{completed:!completed}); await flush(); await render(); if (!completed) toast('완료했습니다.'); return true; }
    if (name === 'toggle-lessons') { document.querySelector('.reader-page').classList.toggle('lessons-collapsed'); return true; }
    if (name === 'open-docs') { if (runtimeStatus !== 'running') throw new Error('서버를 먼저 실행하세요.'); await window.learncode.openDocs(); return true; }
    if (name === 'clear-console') { logs = ''; updateConsole(); return true; }
    if (name === 'add-file') { promptModal('Python 파일 추가', '파일 경로 (예: routers/items.py)', 'utils.py',async name=>{validateFile(name); workspace.files[name] = ''; workspace.activeFile = name; renderCode(); await flush();}); return true; }
    if (name === 'rename-file') { const previous = workspace.activeFile; promptModal('파일 이름 변경','폴더/파일.py 형식으로 입력하세요.',previous,async name=>{validateFile(name,previous); const content = workspace.files[previous]; delete workspace.files[previous]; workspace.files[name] = content; workspace.activeFile = name; renderCode(); await flush();}); return true; }
    if (name === 'delete-file') { if (Object.keys(workspace.files).length < 2) throw new Error('실습 파일은 하나 이상 필요합니다.'); confirmModal('파일 삭제',`${workspace.activeFile} 파일을 삭제합니다.`,async ()=>{delete workspace.files[workspace.activeFile]; workspace.activeFile = Object.keys(workspace.files)[0]; renderCode(); await flush();},'삭제'); return true; }
    if (name === 'reset-workspace') { confirmModal('코드 초기화','작성한 코드를 지우고 시작 코드로 바꿉니다.',async ()=>{workspace = {files:structuredClone(lesson().files),activeFile:Object.keys(lesson().files)[0]}; await window.learncode.stopRuntime(); renderCode(); await flush();},'초기화'); return true; }
    if (name === 'download-course') { await window.learncode.downloadCourse(course); return true; }
    if (name === 'edit-current-course') { await onEdit(course); return true; }
    return false;
  }
  await render();
  return { action, run, flush, save:flush,
    runtime(event) { if (destroyed) return; if (event.type === 'log') { logs = (logs + event.text).slice(-60000); updateConsole(); } if (event.type === 'status') { runtimeStatus = event.status; updateStatus(); } },
    theme() { editor?.setTheme(state.settings.codeTheme === 'dark'); const pane = document.querySelector('.practice-pane'); if (pane) pane.dataset.codeTheme = state.settings.codeTheme; },
    async destroy() { destroyed = true; clearTimeout(saveTimer); await flush(); editor?.destroy(); await window.learncode.stopRuntime(); },
  };
}

import './styles.css';
import { icon, esc, paintIcons, toast, modal, closeModal } from './ui.js';
import { renderLibrary } from './library.js';
import { createStudio } from './creator.js';
import { createReader } from './reader.js';

const api = window.learncode;
let state, view = 'home', controller, navigating = false;

async function refresh() { const snapshot = await api.library(); if (state) Object.assign(state,snapshot); else state = snapshot; setThemeAttributes(); }
function setThemeAttributes() {
  document.documentElement.dataset.theme = state.settings.theme || 'light';
  document.documentElement.dataset.codeTheme = state.settings.codeTheme || 'dark';
}
async function navigate(destination, argument) {
  if (navigating) return;
  navigating = true;
  try {
    if (controller) await controller.destroy(); controller = null;
    closeModal(); view = destination;
    if (destination === 'home') { await refresh(); renderLibrary(state); }
    else if (destination === 'create') controller = createStudio(state, argument, async () => { await refresh(); });
    else if (destination === 'reader') controller = await createReader(state,argument,()=>navigate('home'),course=>navigate('create',course));
  } finally { navigating = false; }
}
async function toggleTheme(codeOnly = false) {
  const key = codeOnly ? 'codeTheme' : 'theme';
  state.settings[key] = state.settings[key] === 'dark' ? 'light' : 'dark';
  await api.savePreferences(state.settings); setThemeAttributes(); controller?.theme();
  document.querySelectorAll('.theme-toggle').forEach(button=>{button.innerHTML = icon(state.settings.theme === 'light' ? 'moon' : 'sun'); button.title = `${state.settings.theme === 'light' ? '다크' : '라이트'} 테마로 전환`; button.setAttribute('aria-label',button.title);});
  paintIcons();
}
function showImport() {
  modal('강의 추가', `<p class="modal-intro">추가할 파일이나 폴더를 선택하세요.</p><div class="import-options"><button class="import-option" data-import="file"><span class="import-icon">${icon('package-open')}</span><div><strong>파일 선택</strong><p>ZIP 또는 JSON 파일을 추가합니다.<br />같은 강의의 JSON 파일은 함께 선택할 수 있습니다.</p></div>${icon('arrow-up-right')}</button><button class="import-option" data-import="folder"><span class="import-icon sage">${icon('folder-open')}</span><div><strong>폴더 선택</strong><p>강좌 JSON 파일이 있는 폴더를 추가합니다.</p></div>${icon('arrow-up-right')}</button></div>`);
}
async function importCourse(kind) {
  closeModal();
  const imported = await api.importCourse(kind);
  if (imported) { await navigate('home'); toast(`「${imported.title}」 강의를 추가했습니다.`); }
}
async function showSettings() {
  modal('실습 환경', `<div class="runtime-settings"><h3>FastAPI 실습 환경</h3><p id="runtime-check" class="muted">Python 확인 중…</p><div class="runtime-install-actions"><button class="button secondary small" data-action="check-runtime">${icon('rotate-ccw')}확인</button><button class="button primary small" id="install-runtime" data-action="install-runtime">${icon('download')}설치</button></div><p class="small muted">Python 3.10 이상이 필요합니다. 설치를 누르면 FastAPI와 Uvicorn을 설치합니다.</p><pre id="setup-log" hidden></pre></div>`, `<button class="button secondary" data-action="close-modal">닫기</button>`);
  await checkRuntime();
}
async function checkRuntime() {
  const result = await api.checkRuntime();
  const element = document.querySelector('#runtime-check'); if (!element) return;
  element.innerHTML = result.ready ? `<span class="runtime-ready">${icon('circle-check')}사용 가능</span><small>Python ${esc(result.python)} · FastAPI ${esc(result.fastapi)} · Uvicorn ${esc(result.uvicorn)}</small>` : esc(result.message);
  paintIcons(element);
}
async function installRuntime() {
  const button = document.querySelector('#install-runtime'); button.disabled = true;
  button.innerHTML = `${icon('loader-circle','spin')}설치 중…`; paintIcons(button);
  const log = document.querySelector('#setup-log'); log.hidden = false; log.textContent = '';
  try { await api.setupRuntime(); await checkRuntime(); toast('FastAPI 설치했습니다.'); }
  finally { if (button.isConnected) { button.disabled = false; button.innerHTML = `${icon('download')}설치`; paintIcons(button); } }
}
document.addEventListener('click', async event => {
  const anchor = event.target.closest('.prose a');
  if (anchor) { event.preventDefault(); try { await api.openLink(anchor.href); } catch (error) { toast(error.message,'error'); } return; }
  const target = event.target.closest('[data-action],[data-window],[data-open-course],[data-edit-course],[data-import],[data-creator-lesson],[data-write-mode],[data-format],[data-lesson],[data-step],[data-file],[data-reader-panel]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (target.closest('.prose') && !['copy-code','block-theme'].includes(action)) return;
  try {
    if (target.dataset.window) { await api.windowControl(target.dataset.window); return; }
    if (target.dataset.openCourse) { await navigate('reader',target.dataset.openCourse); return; }
    if (target.dataset.editCourse) { await navigate('create',state.courses.find(course=>course.id === target.dataset.editCourse)); return; }
    if (target.dataset.import) { await importCourse(target.dataset.import); return; }
    if (action === 'home') { await navigate('home'); return; }
    if (action === 'create') { await navigate('create'); return; }
    if (action === 'theme') { await toggleTheme(); return; }
    if (action === 'code-theme') { await toggleTheme(true); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'import') { showImport(); return; }
    if (action === 'settings') { await showSettings(); return; }
    if (action === 'check-runtime') { await checkRuntime(); return; }
    if (action === 'install-runtime') { await installRuntime(); return; }
    if (action === 'copy-code') { await navigator.clipboard.writeText(target.closest('.code-block').querySelector('code').textContent); toast('코드를 복사했습니다.'); return; }
    if (action === 'block-theme') { const block = target.closest('.code-block'); const inherited = document.documentElement.dataset.codeTheme; block.dataset.codeTheme = (block.dataset.codeTheme || inherited) === 'dark' ? 'light' : 'dark'; return; }
    await controller?.action(action,target);
  } catch (error) { toast(error.message,'error'); }
});
document.addEventListener('keydown', async event => {
  if (event.key === 'Escape') closeModal();
  if (document.querySelector('.modal')) {
    if (event.key === 'Tab') { const focusable = [...document.querySelectorAll('.modal button:not([disabled]),.modal input,.modal textarea,.modal select,.modal a[href]')].filter(el=>el.getClientRects().length); const first = focusable[0]; const last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && view === 'reader') { event.preventDefault(); try { await controller?.run(); } catch (error) { toast(error.message,'error'); } }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.target.closest('.cm-editor')) { event.preventDefault(); try { await controller?.save(); } catch (error) { toast(error.message,'error'); } }
});
window.addEventListener('unhandledrejection', event => { event.preventDefault(); toast(event.reason?.message || '처리하지 못했습니다. 다시 시도하세요.','error'); });
if (api) {
  api.onBeforeClose(async () => { try { await controller?.destroy(); controller = null; } catch (error) { toast(error.message,'error'); } });
  api.onRuntime(event=>{
    controller?.runtime?.(event);
    if (event.type === 'setup-log') { const element = document.querySelector('#setup-log'); if (element) { element.textContent = (element.textContent + event.text).slice(-20000); element.scrollTop = element.scrollHeight; } }
  });
  await refresh(); renderLibrary(state);
  if (state.issues.length) toast(`${state.issues.length}개 강의 폴더를 읽지 못했습니다. JSON 형식을 확인하세요.`, 'error');
} else {
  document.querySelector('#app').innerHTML = '<div class="boot-screen"><h1>앱으로 실행하세요.</h1><p>app 폴더에서 npm start를 실행하세요.</p></div>';
}

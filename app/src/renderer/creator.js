import { shell, icon, esc, uid, themeButton, paintIcons, toast, promptModal, confirmModal } from './ui.js';
import { makeEditor } from './editors.js';
import { renderMarkdown } from './markdown.js';

const starter = 'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/")\ndef read_root():\n    return {"message": "Hello, learncode!"}\n';
const newLesson = (index) => ({ id: uid(), order: index, title: `강좌 ${index}`, content: '## 제목\n\n내용을 입력하세요.\n\n```python\nfrom fastapi import FastAPI\n\napp = FastAPI()\n```\n', duration: 10, files: { 'main.py': starter }, entrypoint: 'main:app' });
function newCourse() { return { schemaVersion: 1, id: uid(), title: '', description: '', category: 'FastAPI', level: '입문', accent: 'coral', createdAt: new Date().toISOString(), lessons: [newLesson(1)] }; }
export function createStudio(state, input, onSaved) {
  let course = input ? structuredClone(input) : null;
  if (!course) { try { course = JSON.parse(localStorage.getItem('learncode:creator-draft')); } catch {} }
  if (!course?.lessons?.length) course = newCourse();
  let lessonIndex = 0, mode = 'split', editor, draftTimer, previewTimer, starterFile = 'main.py';
  let destroyed = false;
  const current = () => course.lessons[lessonIndex];
  function autoSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try { localStorage.setItem('learncode:creator-draft', JSON.stringify(course)); const status = document.querySelector('#draft-status'); if (status) status.textContent = '저장됨'; }
      catch { toast('자동 저장 공간이 부족합니다. 저장하거나 ZIP을 다운로드하세요.', 'error'); }
    }, 400);
    const status = document.querySelector('#draft-status'); if (status) status.textContent = '저장 중…';
  }
  function outline() {
    return `<div class="outline-top"><h3>강좌 목록 <span>${course.lessons.length}</span></h3></div><div class="creator-lessons">${course.lessons.map((lesson,index)=>`<button class="creator-lesson ${index === lessonIndex ? 'active' : ''}" data-creator-lesson="${index}"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${esc(lesson.title)}</strong></div>${icon('chevron-right')}</button>`).join('')}</div><button class="outline-add" data-action="add-lesson">${icon('plus')}강좌 추가</button><button class="text-button new-draft" data-action="new-draft">${icon('plus')}새로 만들기</button>`;
  }
  function render() {
    clearTimeout(previewTimer);
    editor?.destroy();
    const lesson = current(); starterFile = Object.keys(lesson.files)[0];
    const html = `<div class="creator-page"><header class="studio-header"><div class="studio-heading"><button class="icon-button back-button" data-action="home" title="돌아가기" aria-label="돌아가기">${icon('arrow-left')}</button><div><h1>강의 작성</h1></div></div><div class="top-actions"><span class="autosave-label">${icon('circle-check')}<span id="draft-status">자동 저장</span></span>${themeButton(state.settings.theme)}<button class="button secondary small" data-action="save-course">${icon('save')}<span>저장</span></button></div></header><div class="studio-workspace"><aside class="creator-outline">${outline()}</aside><div class="studio-document"><div class="minimal-course-title"><label class="field">강의 제목<input id="course-title" value="${esc(course.title)}" maxlength="100" placeholder="강의 제목을 입력하세요" /></label></div><section class="lesson-document"><div class="lesson-title-row"><span class="lesson-number">${String(lessonIndex+1).padStart(2,'0')}</span><input id="lesson-title" value="${esc(lesson.title)}" maxlength="120" aria-label="강좌 제목" placeholder="강좌 제목을 입력하세요" /><div class="lesson-order-buttons"><button class="icon-button" data-action="lesson-up" title="위로 이동" ${lessonIndex === 0 ? 'disabled' : ''}>${icon('move-up')}</button><button class="icon-button" data-action="lesson-down" title="아래로 이동" ${lessonIndex === course.lessons.length-1 ? 'disabled' : ''}>${icon('move-down')}</button><button class="icon-button danger" data-action="delete-lesson" aria-label="강좌 삭제" ${course.lessons.length === 1 ? 'disabled' : ''}>${icon('trash-2')}</button></div></div><div class="writing-toolbar"><div class="format-tools"><select id="format-font" aria-label="글꼴"><option value="">기본 글꼴</option><option value="Malgun Gothic">맑은 고딕</option><option value="Georgia">Georgia</option><option value="Consolas">Consolas</option><option value="Gulim">굴림</option></select><select id="format-size" aria-label="글자 크기"><option value="">크기</option>${[12,14,16,18,20,24,28,32].map(size=>`<option value="${size}">${size}px</option>`).join('')}</select><label class="color-tool" title="글자 색상"><span>A</span><input type="color" id="format-color" value="#a95f50" aria-label="글자 색상" /></label><span class="toolbar-divider"></span>${[['bold','bold','굵게'],['italic','italic','기울임'],['strike','strikethrough','취소선'],['heading','heading-2','제목'],['list','list','목록'],['quote','quote','인용'],['link','link','링크'],['table','table-2','표 삽입'],['code','code-2','Python 코드블럭']].map(([action,name,label])=>`<button class="tool-button" data-format="${action}" title="${label}" aria-label="${label}">${icon(name)}</button>`).join('')}</div><div class="writing-modes"><button data-write-mode="edit" title="작성" aria-label="작성">${icon('pencil')}</button><button data-write-mode="split" title="분할 보기" aria-label="분할 보기">${icon('columns-2')}</button><button data-write-mode="preview" title="미리보기" aria-label="미리보기">${icon('eye')}</button></div></div><div class="writing-area" data-mode="${mode}"><div class="markdown-edit-pane"><div class="pane-label"><span>Markdown</span></div><div id="markdown-editor"></div></div><div class="markdown-preview-pane"><div class="pane-label"><span>미리보기</span><button class="text-button" data-action="code-theme">${icon('sun')}코드 테마</button></div><article id="markdown-preview" class="prose"></article></div></div><details class="starter-settings"><summary><span>${icon('file-code-2')}시작 코드 </span>${icon('chevron-down')}</summary><div class="starter-content"><div class="starter-file-tools"><select id="starter-file" aria-label="시작 코드 파일">${Object.keys(lesson.files).map(file=>`<option>${esc(file)}</option>`).join('')}</select><button class="text-button" data-action="starter-add">${icon('file-plus-2')}파일 추가</button><button class="icon-button danger" data-action="starter-delete" aria-label="시작 코드 파일 삭제">${icon('trash-2')}</button><label>실행 모듈<input id="lesson-entrypoint" value="${esc(lesson.entrypoint)}" placeholder="main:app" /></label></div><textarea id="starter-code" spellcheck="false" aria-label="시작 코드">${esc(lesson.files[starterFile])}</textarea><p class="small muted">폴더는 <code>routers/items.py</code>처럼 파일 경로로 만들 수 있습니다. 기본 실행 모듈은 <code>main:app</code>입니다.</p></div></details></section></div></div><footer class="studio-footer"><span class="muted small">강좌 ${course.lessons.length}개</span><button class="button primary" data-action="download-course">${icon('download')}다운로드<span class="button-tag">.ZIP</span></button></footer></div>`;
    document.querySelector('#app').innerHTML = shell(html, 'create', 'creator-shell');
    editor = makeEditor(document.querySelector('#markdown-editor'), { value: lesson.content, language: 'markdown', dark: state.settings.theme === 'dark', onChange: value => { lesson.content = value; autoSave(); clearTimeout(previewTimer); previewTimer = setTimeout(() => !destroyed && renderMarkdown(document.querySelector('#markdown-preview'), value), 180); }, onSave: save });
    renderMarkdown(document.querySelector('#markdown-preview'), lesson.content);
    updateMode(); paintIcons(); bind();
  }
  function updateMode() {
    document.querySelector('.writing-area').dataset.mode = mode;
    document.querySelectorAll('[data-write-mode]').forEach(button=>button.classList.toggle('active',button.dataset.writeMode === mode));
    editor?.view.requestMeasure();
  }
  function updateOutline() { const outlineRoot = document.querySelector('.creator-outline'); outlineRoot.innerHTML = outline(); paintIcons(outlineRoot); }
  function bind() {
    const fields = { 'course-title': [course,'title'], 'lesson-title': [current(),'title'], 'lesson-entrypoint': [current(),'entrypoint'] };
    for (const [elementId,[target,key]] of Object.entries(fields)) document.getElementById(elementId).addEventListener('input', event => { target[key] = event.target.value; if (elementId === 'lesson-title') updateOutline(); autoSave(); });
    document.querySelector('#starter-code').oninput = event => { current().files[starterFile] = event.target.value; autoSave(); };
    document.querySelector('#starter-file').onchange = event => { starterFile = event.target.value; document.querySelector('#starter-code').value = current().files[starterFile]; };
    document.querySelector('#format-font').onchange = event => { if (event.target.value) editor.insert(`<span style="font-family:'${event.target.value}'">`, '</span>', '텍스트'); event.target.value = ''; };
    document.querySelector('#format-size').onchange = event => { if (event.target.value) editor.insert(`<span style="font-size:${event.target.value}px">`, '</span>', '텍스트'); event.target.value = ''; };
    document.querySelector('#format-color').onchange = event => editor.insert(`<span style="color:${event.target.value}">`, '</span>', '텍스트');
  }
  function validate() {
    if (!course.title.trim()) { document.querySelector('#course-title').focus(); throw new Error('강의 제목을 입력하세요.'); }
    if (course.lessons.some(lesson=>!lesson.title.trim())) throw new Error('모든 강좌의 제목을 입력하세요.');
    course.lessons.forEach((lesson,index)=>{lesson.order = index+1;});
    return structuredClone(course);
  }
  async function save() { const saved = await window.learncode.saveCourse(validate()); course = saved; localStorage.removeItem('learncode:creator-draft'); await onSaved(saved); render(); toast('강의를 저장했습니다.'); autoSave(); }
  async function download() { const result = await window.learncode.downloadCourse(validate()); if (result) toast(`${result.count}개 강좌를 ZIP으로 저장했습니다.`); }
  function addFile() {
    promptModal('파일 추가', '파일 경로 (예: routers/items.py)', 'utils.py', name => { if (!/^(?:[A-Za-z_]\w*\/)*[A-Za-z_]\w*\.py$/.test(name)) throw new Error('영문, 숫자, 밑줄을 사용한 .py 경로를 입력하세요.'); if (Object.hasOwn(current().files,name)) throw new Error('같은 이름의 파일이 있습니다.'); current().files[name] = ''; autoSave(); render(); document.querySelector('.starter-settings').open = true; document.querySelector('#starter-file').value = name; document.querySelector('#starter-file').dispatchEvent(new Event('change')); });
  }
  async function action(name, target) {
    if (target?.dataset.creatorLesson !== undefined) { lessonIndex = Number(target.dataset.creatorLesson); render(); return true; }
    if (target?.dataset.writeMode) { mode = target.dataset.writeMode; updateMode(); return true; }
    if (target?.dataset.format) {
      const formats = { bold:['**','**','굵은 글씨'], italic:['*','*','기울임 글씨'], strike:['~~','~~','취소선'], heading:['\n## ','\n','제목'], list:['\n- ','\n','목록 내용'], quote:['\n> ','\n','인용문'], link:['[','](https://example.com)','링크 텍스트'], table:['\n| 제목 | 설명 |\n| --- | --- |\n| 항목 | 내용 |\n','',''], code:['\n```python\n','\n```\n',starter] };
      editor.insert(...formats[target.dataset.format]); return true;
    }
    if (name === 'save-course') { await save(); return true; }
    if (name === 'download-course') { await download(); return true; }
    if (name === 'add-lesson') { if (course.lessons.length >= 100) throw new Error('강좌는 최대 100개까지 추가할 수 있습니다.'); course.lessons.push(newLesson(course.lessons.length+1)); lessonIndex = course.lessons.length-1; render(); autoSave(); return true; }
    if (name === 'delete-lesson') { if (course.lessons.length > 1) confirmModal('강좌 삭제', '이 강좌의 내용과 실습 코드를 삭제합니다.',()=>{course.lessons.splice(lessonIndex,1); lessonIndex = Math.min(lessonIndex,course.lessons.length-1); render(); autoSave();},'삭제'); return true; }
    if (['lesson-up','lesson-down'].includes(name)) { const destination = lessonIndex + (name === 'lesson-up' ? -1 : 1); if (destination >= 0 && destination < course.lessons.length) { [course.lessons[lessonIndex], course.lessons[destination]] = [course.lessons[destination],course.lessons[lessonIndex]]; lessonIndex = destination; render(); autoSave(); } return true; }
    if (name === 'starter-add') { addFile(); return true; }
    if (name === 'starter-delete') { if (Object.keys(current().files).length < 2) throw new Error('Python 파일은 하나 이상 필요합니다.'); confirmModal('시작 코드 파일 삭제', `${starterFile} 파일을 삭제합니다.`,()=>{delete current().files[starterFile]; render(); autoSave(); document.querySelector('.starter-settings').open = true;},'삭제'); return true; }
    if (name === 'new-draft') { confirmModal('새로 만들기', '작성 중인 내용을 비우고 새 강의를 만듭니다. 필요한 내용은 먼저 저장하세요.',()=>{course = newCourse(); lessonIndex = 0; render(); autoSave();},'만들기'); return true; }
    return false;
  }
  render();
  return { action, save, download, theme: () => editor?.setTheme(state.settings.theme === 'dark'), destroy() { destroyed = true; clearTimeout(draftTimer); clearTimeout(previewTimer); try { localStorage.setItem('learncode:creator-draft',JSON.stringify(course)); } catch {} editor?.destroy(); } };
}

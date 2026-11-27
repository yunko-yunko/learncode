const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const AdmZip = require('adm-zip');
const { CourseStore, lessonDocuments } = require('./core/store.cjs');
const { normalizeCourse, courseFromDocuments, safeName } = require('./core/schema.cjs');
const { PythonRuntime } = require('./core/runtime.cjs');

let window, store, runtime;
let closing = false;
let closeRequested = false;
let closeApproved = false;
const testing = process.env.LEARNCODE_TEST === '1';
if (testing && process.env.LEARNCODE_TEST_DATA) app.setPath('userData', path.resolve(process.env.LEARNCODE_TEST_DATA));
const gotLock = testing || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const dataDir = app.getPath('userData');
    const seeds = app.isPackaged ? path.join(process.resourcesPath, 'resource') : path.join(app.getAppPath(), 'resource');
    const resources = testing ? path.join(dataDir, 'resource') : app.isPackaged ? path.join(dataDir, 'resource') : seeds;
    store = new CourseStore(resources, dataDir);
    await store.init(seeds);
    runtime = new PythonRuntime({ dataDir, developmentDir: app.isPackaged ? undefined : app.getAppPath(), onEvent: event => { if (window && !window.isDestroyed()) window.webContents.send('runtime:event', event); } });
    registerIPC();
    window = new BrowserWindow({
      width: 1440, height: 960, minWidth: 420, minHeight: 560,
      title: 'learncode', backgroundColor: '#f8f7f3',
      frame: false, show: !testing,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => {
      if (!closing && !closeApproved && !window.webContents.isCrashed()) {
        event.preventDefault();
        if (!closeRequested) { closeRequested = true; window.webContents.send('app:before-close'); }
      }
    });
    window.on('maximize', () => window.webContents.send('window:state', true));
    window.on('unmaximize', () => window.webContents.send('window:state', false));
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL === 'http://127.0.0.1:5173') await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    else await window.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }).catch(error => { dialog.showErrorBox('learncode 시작 오류', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (!closing && runtime) { event.preventDefault(); closing = true; runtime.dispose().finally(() => app.quit()); }
  });
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('허용되지 않은 요청입니다.');
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
function registerIPC() {
  handle('library:read', () => store.library());
  handle('course:save', course => store.save(course));
  handle('course:import', async kind => {
    const result = await dialog.showOpenDialog(window, kind === 'folder' ? { title: '강의 폴더 선택', properties: ['openDirectory'] } : { title: '파일 선택', properties: ['openFile', 'multiSelections'], filters: [{ name: 'learncode 강의', extensions: ['zip','json'] }] });
    if (result.canceled) return null;
    let documents = [];
    if (kind === 'folder') {
      const folder = result.filePaths[0];
      const names = (await fs.readdir(folder)).filter(name => name.toLowerCase().endsWith('.json'));
      if (names.length > 100) throw new Error('최대 100개의 강좌를 가져올 수 있습니다.');
      for (const name of names) documents.push(await readJSON(path.join(folder, name)));
    } else {
      for (const file of result.filePaths) {
        if (file.toLowerCase().endsWith('.zip')) {
          if (result.filePaths.length > 1) throw new Error('ZIP 파일은 하나씩 선택하세요.');
          if ((await fs.stat(file)).size > 20000000) throw new Error('ZIP 파일은 20MB 이하여야 합니다.');
          const zip = new AdmZip(file);
          const entries = zip.getEntries().filter(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.json') && !entry.entryName.startsWith('__MACOSX/'));
          if (!entries.length || entries.length > 100 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 20000000 || entries.some(entry => entry.header.size > 5000000)) throw new Error('압축파일에 유효한 강좌가 없거나 크기 제한을 초과했습니다.');
          documents = entries.map(entry => JSON.parse(entry.getData().toString('utf8').replace(/^\uFEFF/, '')));
        } else documents.push(await readJSON(file));
      }
    }
    return store.save(courseFromDocuments(documents, { freshIds: true }));
  });
  handle('course:download', async input => {
    const course = normalizeCourse(input);
    const result = await dialog.showSaveDialog(window, { title: 'ZIP 저장', defaultPath: path.join(app.getPath('downloads'), `${safeName(course.title)}.zip`), filters: [{ name: 'ZIP 압축 폴더', extensions: ['zip'] }] });
    if (result.canceled) return null;
    const zip = new AdmZip();
    for (const doc of lessonDocuments(course)) zip.addFile(`${safeName(course.title)}/${doc.name}`, Buffer.from(JSON.stringify(doc.data, null, 2), 'utf8'));
    await fs.writeFile(result.filePath, zip.toBuffer());
    return { path: result.filePath, count: course.lessons.length };
  });
  handle('progress:update', (...args) => store.updateProgress(...args));
  handle('workspace:save', (...args) => store.saveWorkspace(...args));
  handle('preferences:save', settings => store.preferences(settings));
  handle('runtime:check', () => runtime.check());
  handle('runtime:setup', () => runtime.setup());
  handle('runtime:start', input => runtime.start(input));
  handle('runtime:stop', () => runtime.stop());
  handle('runtime:docs', () => shell.openExternal('http://127.0.0.1:8083/docs'));
  handle('link:open', url => { const link = new URL(url); if (!['https:', 'http:'].includes(link.protocol)) throw new Error('지원하지 않는 링크입니다.'); return shell.openExternal(link.href); });
  handle('window:control', action => {
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
  });
  handle('window:ready-to-close', () => { closeApproved = true; setImmediate(() => window.close()); });
}
async function readJSON(file) {
  if ((await fs.stat(file)).size > 5000000) throw new Error('JSON 파일은 5MB 이하여야 합니다.');
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

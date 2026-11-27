const { contextBridge, ipcRenderer } = require('electron');
const call = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('learncode', {
  library: () => call('library:read'),
  saveCourse: course => call('course:save', course),
  importCourse: kind => call('course:import', kind),
  downloadCourse: course => call('course:download', course),
  updateProgress: (course, lesson, changes) => call('progress:update', course, lesson, changes),
  saveWorkspace: (course, lesson, workspace) => call('workspace:save', course, lesson, workspace),
  savePreferences: settings => call('preferences:save', settings),
  checkRuntime: () => call('runtime:check'),
  setupRuntime: () => call('runtime:setup'),
  startRuntime: input => call('runtime:start', input),
  stopRuntime: () => call('runtime:stop'),
  openDocs: () => call('runtime:docs'),
  openLink: url => call('link:open', url),
  windowControl: action => call('window:control', action),
  onBeforeClose: listener => {
    ipcRenderer.on('app:before-close', async () => { await listener(); await call('window:ready-to-close'); });
  },
  onRuntime: listener => { const callback = (_, event) => listener(event); ipcRenderer.on('runtime:event', callback); return () => ipcRenderer.removeListener('runtime:event', callback); },
});

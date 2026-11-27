const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeCourse, courseFromDocuments, safeName, validId, validateFiles } = require('./schema.cjs');

function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('허용되지 않은 저장 경로입니다.');
  return target;
}
async function atomicJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}
function lessonDocuments(course) {
  const { lessons, ...metadata } = normalizeCourse(course);
  return lessons.map(lesson => ({ name: `${safeName(metadata.title)}_${lesson.order}강.json`, data: { schemaVersion: 1, course: metadata, lesson } }));
}
class CourseStore {
  constructor(resourceDir, dataDir) {
    this.resourceDir = resourceDir; this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, 'learning-state.json');
    this.queue = Promise.resolve();
  }
  async init(seedDir) {
    await fs.mkdir(this.resourceDir, { recursive: true });
    await fs.mkdir(this.dataDir, { recursive: true });
    if (seedDir && path.resolve(seedDir) !== path.resolve(this.resourceDir) && !(await fs.readdir(this.resourceDir)).length) await fs.cp(seedDir, this.resourceDir, { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(this.stateFile, 'utf8')); }
    catch { this.state = { progress: {}, workspaces: {}, settings: { theme: 'light', codeTheme: 'dark' } }; }
    this.state.progress ||= {}; this.state.workspaces ||= {}; this.state.settings ||= { theme: 'light', codeTheme: 'dark' };
  }
  serialize(task) {
    const next = this.queue.then(task);
    this.queue = next.catch(() => {});
    return next;
  }
  async list() {
    const courses = []; const issues = [];
    for (const entry of await fs.readdir(this.resourceDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        const folder = path.join(this.resourceDir, entry.name);
        const files = (await fs.readdir(folder)).filter(name => name.endsWith('.json'));
        if (!files.length) continue;
        const documents = await Promise.all(files.map(async name => {
          const file = path.join(folder, name);
          if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('심볼릭 링크는 가져올 수 없습니다.');
          if ((await fs.stat(file)).size > 5000000) throw new Error('JSON 파일은 5MB 이하여야 합니다.');
          return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
        }));
        const course = courseFromDocuments(documents);
        if (courses.some(item => item.id === course.id)) throw new Error('강의 ID가 중복되었습니다.');
        courses.push({ ...course, folder });
      } catch (error) { issues.push(`${entry.name}: ${error.message}`); }
    }
    return { courses, issues };
  }
  async library() {
    const { courses, issues } = await this.list();
    return { courses: courses.map(({ folder, ...course }) => course), issues, ...this.state, resourceDir: this.resourceDir };
  }
  async save(input) {
    return this.serialize(async () => {
      const course = normalizeCourse(input);
      course.updatedAt = new Date().toISOString();
      const { courses } = await this.list();
      const previous = courses.find(item => item.id === course.id);
      const base = safeName(course.title);
      let folder = path.join(this.resourceDir, base);
      const occupied = courses.find(item => item.folder.toLowerCase() === folder.toLowerCase() && item.id !== course.id);
      if (occupied || (!previous && await fs.access(folder).then(() => true, () => false))) folder = path.join(this.resourceDir, `${base}_${course.id.slice(0,8)}`);
      if (previous) folder = previous.folder;
      const staging = inside(this.resourceDir, path.join(this.resourceDir, `.saving-${crypto.randomUUID()}`));
      const backup = inside(this.resourceDir, path.join(this.resourceDir, `.backup-${crypto.randomUUID()}`));
      inside(this.resourceDir, folder);
      await fs.mkdir(staging);
      try {
        for (const document of lessonDocuments(course)) await atomicJSON(path.join(staging, document.name), document.data);
        if (previous) await fs.rename(folder, backup);
        try { await fs.rename(staging, folder); }
        catch (error) { if (previous) await fs.rename(backup, folder); throw error; }
        if (previous) await fs.rm(inside(this.resourceDir, backup), { recursive: true, force: true });
      } catch (error) { await fs.rm(inside(this.resourceDir, staging), { recursive: true, force: true }); throw error; }
      return course;
    });
  }
  async updateProgress(courseId, lessonId, changes = {}) {
    if (!validId(courseId) || (lessonId && !validId(lessonId))) throw new Error('올바르지 않은 강의 ID입니다.');
    return this.serialize(async () => {
      const progress = this.state.progress[courseId] ||= { completed: [], lastLessonId: null };
      if (lessonId) { progress.lastLessonId = lessonId; progress.lastOpenedAt = new Date().toISOString(); }
      if (typeof changes.completed === 'boolean' && lessonId) progress.completed = changes.completed ? [...new Set([...progress.completed, lessonId])] : progress.completed.filter(item => item !== lessonId);
      await atomicJSON(this.stateFile, this.state);
      return progress;
    });
  }
  async saveWorkspace(courseId, lessonId, workspace) {
    if (!validId(courseId) || !validId(lessonId)) throw new Error('올바르지 않은 강의 ID입니다.');
    const files = validateFiles(workspace.files);
    return this.serialize(async () => {
      this.state.workspaces[`${courseId}/${lessonId}`] = { files, activeFile: Object.hasOwn(files, workspace.activeFile) ? workspace.activeFile : Object.keys(files)[0] };
      await atomicJSON(this.stateFile, this.state);
      return true;
    });
  }
  async preferences(settings) {
    return this.serialize(async () => {
      for (const key of ['theme', 'codeTheme']) if (['light','dark'].includes(settings[key])) this.state.settings[key] = settings[key];
      await atomicJSON(this.stateFile, this.state);
      return this.state.settings;
    });
  }
}
module.exports = { CourseStore, atomicJSON, lessonDocuments, inside };

const crypto = require('node:crypto');

function text(value, fallback = '', max = 200000) {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}
function safeName(value) {
  const cleaned = text(value, '제목 없음', 100).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
  return (!cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) ? `강의_${cleaned || '제목 없음'}` : cleaned;
}
function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id); }
function id(value) { return validId(value) ? value : crypto.randomUUID(); }
function validateFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length > 80) throw new Error('Python 파일은 최대 80개까지 사용할 수 있습니다.');
  const result = {};
  const seen = new Set();
  let total = 0;
  for (const [name, content] of Object.entries(files)) {
    const normalized = name.replace(/\\/g, '/');
    if (normalized.length > 160 || !normalized.endsWith('.py') || normalized.split('/').some(part => !/^[A-Za-z_][A-Za-z0-9_]*\.(py)$/.test(part) && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) || normalized.includes('..') || normalized.startsWith('/') || seen.has(normalized.toLowerCase()) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\/|$)/i.test(normalized) || normalized.split('/').some(p => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
      throw new Error(`올바르지 않은 파일 경로입니다: ${name}. 영문, 숫자, 밑줄로 된 .py 경로를 사용하세요.`);
    }
    if (typeof content !== 'string' || content.length > 300000) throw new Error('파일 내용은 300KB 이하여야 합니다.');
    total += Buffer.byteLength(content);
    if (total > 3000000) throw new Error('전체 실습 코드는 3MB 이하여야 합니다.');
    seen.add(normalized.toLowerCase());
    result[normalized] = content;
  }
  return result;
}
const defaultCode = 'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/")\ndef read_root():\n    return {"message": "Hello, learncode!"}\n';
function normalizeCourse(input, { freshIds = false } = {}) {
  if (!input || typeof input !== 'object' || !text(input.title).trim()) throw new Error('강의 제목이 필요합니다.');
  if (!Array.isArray(input.lessons) || input.lessons.length === 0 || input.lessons.length > 100) throw new Error('강좌를 1개 이상, 100개 이하로 추가하세요.');
  const lessonIds = new Set();
  const course = {
    schemaVersion: 1, id: freshIds ? crypto.randomUUID() : id(input.id),
    title: input.title.trim().slice(0, 100), description: text(input.description, '', 500),
    category: text(input.category, 'FastAPI', 30), level: text(input.level, '입문', 20),
    accent: ['coral', 'sage', 'sand', 'slate'].includes(input.accent) ? input.accent : 'coral',
    createdAt: text(input.createdAt, new Date().toISOString(), 40), updatedAt: text(input.updatedAt, new Date().toISOString(), 40),
    lessons: input.lessons.map((lesson, index) => {
      if (!lesson || typeof lesson !== 'object' || !text(lesson.title).trim()) throw new Error(`${index + 1}강의 제목이 필요합니다.`);
      const lessonId = freshIds ? crypto.randomUUID() : id(lesson.id);
      if (lessonIds.has(lessonId)) throw new Error('강좌 ID가 중복되었습니다.');
      lessonIds.add(lessonId);
      const files = validateFiles(lesson.files || { 'main.py': defaultCode });
      if (!Object.keys(files).length) files['main.py'] = defaultCode;
      const entrypoint = text(lesson.entrypoint, 'main:app', 160);
      if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$/.test(entrypoint)) throw new Error('실행 경로는 main:app 또는 package.main:app 형식이어야 합니다.');
      return { id: lessonId, order: index + 1, title: lesson.title.trim().slice(0, 120), content: text(lesson.content), duration: Math.max(1, Math.min(240, Number(lesson.duration) || 10)), files, entrypoint };
    }),
  };
  return course;
}
function courseFromDocuments(documents, options) {
  if (documents.length === 1 && Array.isArray(documents[0].lessons)) return normalizeCourse(documents[0], options);
  if (!documents.length) throw new Error('선택한 폴더에 JSON 강좌가 없습니다.');
  const first = documents[0];
  if (!first.course || !first.lesson) throw new Error('learncode 강의 JSON 형식이 아닙니다.');
  if (documents.some(doc => !doc.course || !doc.lesson || doc.course.id !== first.course.id || doc.course.title !== first.course.title)) throw new Error('같은 강의의 JSON 파일만 함께 가져올 수 있습니다.');
  const orders = documents.map(doc => doc.lesson.order);
  if (new Set(orders).size !== orders.length) throw new Error('강좌 순서가 중복되었습니다.');
  return normalizeCourse({ ...first.course, lessons: documents.map(doc => doc.lesson).sort((a,b) => a.order - b.order) }, options);
}
module.exports = { safeName, validId, validateFiles, normalizeCourse, courseFromDocuments, defaultCode };

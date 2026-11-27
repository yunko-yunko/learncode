const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { normalizeCourse, validateFiles, courseFromDocuments, safeName } = require('../src/core/schema.cjs');
const { CourseStore, lessonDocuments, inside } = require('../src/core/store.cjs');
const { PythonRuntime } = require('../src/core/runtime.cjs');
const { courses } = require('../scripts/seed.cjs');
const testRoot = path.resolve(__dirname,'../test-results');
async function temporary(fn) {
  await fs.mkdir(testRoot,{recursive:true}); const dir = inside(testRoot,path.join(testRoot,crypto.randomUUID()));
  await fs.mkdir(dir);
  try { await fn(dir); } finally { await fs.rm(inside(testRoot,dir),{recursive:true,force:true}); }
}
test('파일 경로 탈출, Windows 예약 이름, 대소문자 충돌 차단',()=>{
  for (const name of ['../oops.py','C:/oops.py','/oops.py','routers/../../oops.py','routers/CON.py','bad-name.py','empty.txt']) assert.throws(()=>validateFiles({[name]:''}));
  assert.throws(()=>validateFiles({'Main.py':'','main.py':''}));
  assert.deepEqual(validateFiles({'routers/items.py':'print(1)','routers/__init__.py':''}),{'routers/items.py':'print(1)','routers/__init__.py':''});
  assert.equal(safeName('con'),'강의_con'); assert.equal(safeName('a/b:c'),'a_b_c');
});
test('JSON 강좌 순서 정렬 및 서로 다른 강의 혼합 차단',()=>{
  const documents = lessonDocuments(courses[0]);
  const reconstructed = courseFromDocuments(documents.map(doc=>doc.data).reverse());
  assert.equal(reconstructed.lessons[0].title,courses[0].lessons[0].title);
  assert.equal(reconstructed.lessons.length,4);
  assert.throws(()=>courseFromDocuments([documents[0].data,lessonDocuments(courses[1])[0].data]));
  assert.throws(()=>normalizeCourse({...courses[0],lessons:[courses[0].lessons[0],courses[0].lessons[0]]}));
});
test('ZIP에 제목 폴더와 강좌별 JSON 저장 · 가져오기 왕복',()=>{
  const zip = new AdmZip();
  for (const doc of lessonDocuments(courses[0])) zip.addFile(`${safeName(courses[0].title)}/${doc.name}`,Buffer.from(JSON.stringify(doc.data)));
  const reopened = new AdmZip(zip.toBuffer());
  assert.equal(reopened.getEntries().length,4);
  assert.match(reopened.getEntries()[0].entryName,/FastAPI 기초_1강\.json$/);
  const imported = courseFromDocuments(reopened.getEntries().map(entry=>JSON.parse(entry.getData().toString())),{freshIds:true});
  assert.notEqual(imported.id,courses[0].id);
  assert.equal(imported.lessons[3].files['routers/items.py'],courses[0].lessons[3].files['routers/items.py']);
});
test('강의 저장과 제목 변경 · 진도와 작업 파일이 재시작 후 보존',()=>temporary(async dir=>{
  const store = new CourseStore(path.join(dir,'resource'),path.join(dir,'data')); await store.init();
  const saved = await store.save(courses[0]);
  await store.updateProgress(saved.id,saved.lessons[0].id,{completed:true});
  await store.saveWorkspace(saved.id,saved.lessons[0].id,{files:{'main.py':'# edited'},activeFile:'main.py'});
  await store.save({...saved,title:'바뀐 제목',lessons:saved.lessons.slice(0,2)});
  const duplicate = await store.save({...saved,id:'different-course',title:'바뀐 제목'});
  assert.equal(duplicate.id,'different-course');
  const restarted = new CourseStore(store.resourceDir,store.dataDir); await restarted.init();
  const library = await restarted.library(); assert.equal(library.courses.length,2);
  assert.equal(library.issues.length,0);
  assert.equal(library.courses.find(item=>item.id === saved.id).lessons.length,2);
  assert.deepEqual(library.progress[saved.id].completed,[saved.lessons[0].id]);
  assert.equal(library.workspaces[`${saved.id}/${saved.lessons[0].id}`].files['main.py'],'# edited');
}));
test('동시 진도/설정 저장 시 업데이트를 잃지 않음',()=>temporary(async dir=>{
  const store = new CourseStore(path.join(dir,'resource'),dir); await store.init();
  await Promise.all([store.updateProgress('course','one',{completed:true}),store.updateProgress('course','two',{completed:true}),store.preferences({theme:'dark'}),store.saveWorkspace('course','one',{files:{'main.py':'# saved'},activeFile:'main.py'})]);
  const state = JSON.parse(await fs.readFile(store.stateFile,'utf8'));
  assert.deepEqual(state.progress.course.completed,['one','two']); assert.equal(state.settings.theme,'dark'); assert.equal(state.workspaces['course/one'].files['main.py'],'# saved');
}));
test('FastAPI 다중 파일 실제 실행, HTTP 요청, 포트 충돌, 오류 뒤 정리', {timeout:60000},()=>temporary(async dir=>{
  const logs = []; const runtime = new PythonRuntime({dataDir:dir,onEvent:event=>logs.push(event)});
  try {
    const lesson = courses[0].lessons[3];
    const payload = {courseId:'test',lessonId:'routers',files:lesson.files,entrypoint:'main:app'};
    await runtime.start(payload);
    const response = await runtime.request({method:'GET',route:'/items/7'});
    assert.equal(response.status,200); assert.deepEqual(JSON.parse(response.body),{id:7,name:'item-7'});
    const other = new PythonRuntime({dataDir:dir});
    await assert.rejects(other.start(payload),/8083/);
    await runtime.stop(); assert.equal(await runtime.portOccupied(),false);
    await assert.rejects(runtime.start({...payload,files:{'main.py':'this is invalid python!!!'}}));
    assert.equal(await runtime.portOccupied(),false);
    assert.ok(logs.some(event=>event.type === 'status' && event.status === 'running'));
  } finally { await runtime.dispose(); }
}));

const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { validId, validateFiles } = require('./schema.cjs');
const { inside } = require('./store.cjs');
const exec = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

class PythonRuntime {
  constructor({ dataDir, developmentDir, onEvent = () => {} }) { this.dataDir = dataDir; this.developmentDir = developmentDir; this.onEvent = onEvent; this.child = null; this.busy = false; this.installing = false; this.status = 'stopped'; }
  emit(type, values = {}) { this.onEvent({ type, ...values }); }
  async python() {
    const local = path.join(this.dataDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const candidates = [...(this.developmentDir ? [{ command: path.join(this.developmentDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), args: [] }] : []), { command: local, args: [] }, { command: 'python', args: [] }, { command: 'python3', args: [] }, ...(process.platform === 'win32' ? [{ command: 'py', args: ['-3'] }] : [])];
    for (const candidate of candidates) {
      try { const { stdout } = await exec(candidate.command, [...candidate.args, '-c', 'import sys; print(sys.executable)'], { windowsHide: true, timeout: 10000 }); return { command: stdout.trim(), args: [] }; } catch {}
    }
    throw new Error('Python 3.10 이상이 필요합니다. Python을 설치한 뒤 앱을 다시 실행하세요.');
  }
  async check() {
    try {
      const python = await this.python();
      const { stdout } = await exec(python.command, ['-c', 'import json, sys, fastapi, uvicorn; print(json.dumps({"python": sys.version.split()[0], "fastapi": fastapi.__version__, "uvicorn": uvicorn.__version__}))'], { windowsHide: true, timeout: 15000 });
      return { ready: true, path: python.command, ...JSON.parse(stdout) };
    } catch (error) { return { ready: false, message: error.message.includes('Python 3.10') ? error.message : 'FastAPI와 Uvicorn이 필요합니다. 설치를 누르세요.' }; }
  }
  async command(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
      this.setupChild = child;
      child.stdout.on('data', data => this.emit('setup-log', { text: data.toString() }));
      child.stderr.on('data', data => this.emit('setup-log', { text: data.toString() }));
      child.on('error', reject);
      child.on('close', code => { if (this.setupChild === child) this.setupChild = null; code === 0 ? resolve() : reject(new Error(`환경 설치에 실패했습니다 (종료 코드 ${code}). 설치 로그를 확인하세요.`)); });
    });
  }
  async setup() {
    if (this.installing || this.child || this.busy) throw new Error('실습을 중지한 뒤 다시 시도하세요.');
    this.installing = true;
    try {
      const python = await this.python();
      const venv = path.join(this.dataDir, '.venv');
      const executable = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      this.emit('setup-log', { text: '가상 환경 생성 중…\n' });
      const exists = await fs.access(executable).then(() => true, () => false);
      if (!exists) await this.command(python.command, ['-m', 'venv', venv]);
      await this.command(executable, ['-m', 'pip', 'install', '--disable-pip-version-check', 'fastapi>=0.115.12,<1.0', 'uvicorn>=0.34.2,<1.0']);
      return this.check();
    } finally { this.installing = false; }
  }
  async portOccupied() {
    return new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port: 8083 });
      socket.setTimeout(400);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
  }
  async start({ courseId, lessonId, files, entrypoint = 'main:app' }) {
    if (this.busy || this.installing) throw new Error('잠시 후 다시 실행하세요.');
    if (!validId(courseId) || !validId(lessonId)) throw new Error('올바르지 않은 강좌입니다.');
    files = validateFiles(files);
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$/.test(entrypoint)) throw new Error('실행 경로를 확인하세요. 예: main:app');
    const moduleFile = `${entrypoint.split(':')[0].replace(/\./g, '/')}.py`;
    if (!Object.hasOwn(files, moduleFile)) throw new Error(`실행할 ${moduleFile} 파일을 찾을 수 없습니다.`);
    this.busy = true;
    try {
      await this.stop();
      if (await this.portOccupied()) throw new Error('8083 포트를 다른 프로그램이 사용하고 있습니다. 해당 프로그램을 종료한 뒤 다시 실행하세요.');
      const environment = await this.check();
      if (!environment.ready) throw new Error(environment.message);
      const runRoot = path.join(this.dataDir, 'runtime');
      await fs.mkdir(runRoot, { recursive: true });
      const cwd = inside(runRoot, path.join(runRoot, `${courseId}_${lessonId}`));
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.mkdir(cwd, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        const target = inside(cwd, path.join(cwd, ...name.split('/')));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, 'utf8');
      }
      this.status = 'starting'; this.emit('status', { status: 'starting' });
      const child = spawn(environment.path, ['-m', 'uvicorn', entrypoint, '--host', '127.0.0.1', '--port', '8083', '--no-access-log', '--no-use-colors'], { cwd, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
      this.child = child;
      let failure = '';
      child.stdout.on('data', data => this.emit('log', { text: data.toString() }));
      child.stderr.on('data', data => { failure = (failure + data.toString()).slice(-6000); this.emit('log', { text: data.toString() }); });
      child.on('error', error => { failure = error.message; this.emit('log', { text: `${error.message}\n` }); });
      child.on('close', code => {
        if (this.child === child) { this.child = null; this.status = 'stopped'; this.emit('status', { status: 'stopped', exitCode: code }); }
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        await pause(100);
        if (this.child !== child || child.exitCode !== null) throw new Error(failure || '서버가 종료되었습니다. 코드를 확인하세요.');
        if (await this.portOccupied()) { this.status = 'running'; this.emit('status', { status: 'running' }); return { status: 'running', url: 'http://127.0.0.1:8083' }; }
      }
      await this.stop(); throw new Error('서버 시작 시간이 초과되었습니다. 실행 로그를 확인하세요.');
    } catch (error) { this.status = 'stopped'; this.emit('status', { status: 'stopped' }); throw error; }
    finally { this.busy = false; }
  }
  async kill(child) {
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') { try { await exec('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch {} }
    else { child.kill('SIGTERM'); }
    for (let i = 0; i < 30 && child.exitCode === null; i++) await pause(50);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  async stop() {
    const child = this.child;
    await this.kill(child);
    if (this.child === child) { this.child = null; this.status = 'stopped'; this.emit('status', { status: 'stopped' }); }
    return { status: 'stopped' };
  }
  async dispose() { await this.stop(); await this.kill(this.setupChild); }
  async request({ method = 'GET', route = '/', body = '' }) {
    if (!this.child || this.status !== 'running') throw new Error('먼저 실습 서버를 실행하세요.');
    if (!['GET','POST','PUT','PATCH','DELETE'].includes(method) || typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || /[\r\n]/.test(route) || route.length > 2048 || typeof body !== 'string' || Buffer.byteLength(body) > 1000000) throw new Error('요청 형식을 확인하세요.');
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const request = http.request({ hostname: '127.0.0.1', port: 8083, path: route, method, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > 2000000) { response.destroy(); reject(new Error('응답은 2MB까지 표시할 수 있습니다.')); } else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8'), time: Date.now() - started, headers: response.headers }));
      });
      request.setTimeout(10000, () => request.destroy(new Error('요청 시간이 초과되었습니다.')));
      request.on('error', reject);
      if (body) request.write(body);
      request.end();
    });
  }
}
module.exports = { PythonRuntime };

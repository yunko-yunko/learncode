const path = require('node:path');
const { PythonRuntime } = require('../src/core/runtime.cjs');

const runtime = new PythonRuntime({ dataDir: path.resolve(__dirname, '..'), onEvent: (event) => { if (event.text) process.stdout.write(event.text); } });
runtime.setup().then(() => console.log('\nFastAPI 설치했습니다.')).catch((error) => { console.error(error.message); process.exitCode = 1; });

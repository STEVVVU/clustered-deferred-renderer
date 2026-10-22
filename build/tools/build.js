import { mkdirSync } from 'fs';
import { spawnAndCheck } from '../lib/spawn.js';

mkdirSync('out', { recursive: true });

spawnAndCheck(process.execPath, ['build/tools/copy.js'], {
  stdio: 'inherit',
});

spawnAndCheck(process.execPath, ['node_modules/rollup/dist/bin/rollup', '-c'], {
  stdio: 'inherit',
});

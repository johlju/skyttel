// Simulate an external writer at the CLI's filesystem boundary.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const open = fs.openSync;
let changed = false;
fs.openSync = (path, ...args) => {
  const grow = !changed && path === process.env.FS_RACE_INPUT;
  const descriptor = open(path, ...(grow ? ['r+'] : args));
  if (grow) {
    changed = true;
    // Trailing JSON whitespace keeps the original document syntactically valid.
    const padding = Buffer.alloc(8 * 1024 * 1024, ' ');
    fs.writeSync(descriptor, padding, 0, padding.length, fs.fstatSync(descriptor).size);
  }
  return descriptor;
};
syncBuiltinESMExports();

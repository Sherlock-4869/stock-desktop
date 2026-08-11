'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PreferencesStore, validBounds } = require('../src/main/preferences-store');

test('window preferences persist public layout data but no session credential', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-desktop-test-'));
  t.after(() => fs.rmSync(directory, { recursive:true, force:true }));
  const store = new PreferencesStore(directory);
  store.load();
  store.setServerUrl('https://stock.example.test');
  store.setMainWindowBounds({ x:10, y:20, width:1200, height:800 });
  store.setOverlay({ bounds:{ x:30, y:40, width:500, height:390 }, opacity:0.72, alwaysOnTop:false, groupId:'g_value' });

  const restored = new PreferencesStore(directory);
  assert.deepEqual(restored.load(), {
    version:1,
    serverUrl:'https://stock.example.test',
    mainWindowBounds:{ x:10, y:20, width:1200, height:800 },
    overlay:{ bounds:{ x:30, y:40, width:500, height:390 }, opacity:0.72, alwaysOnTop:false, groupId:'g_value' },
  });
  const written = fs.readFileSync(path.join(directory, 'desktop-preferences.json'), 'utf8');
  assert.doesNotMatch(written, /token|password|session/i);
});

test('window bounds reject invalid or unsafe values', () => {
  assert.equal(validBounds({ x:0, y:0, width:359, height:300 }), null);
  assert.equal(validBounds({ x:Infinity, y:0, width:500, height:300 }), null);
  assert.deepEqual(validBounds({ x:-20, y:40, width:500, height:300 }), { x:-20, y:40, width:500, height:300 });
});

/** Verify the settings store's merge, guard and failure behaviour. */
const store = new Map();
globalThis.localStorage = {
	getItem: k => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, v),
	removeItem: k => store.delete(k),
};
const { createSettings } = await import('../packages/addon-sdk/dist/runtime/settings.js');

const defaults = { targetSkill: 'total', runs: 3, excludeFailed: true };
const s = createSettings('test', defaults);
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : (fail++, console.log('  FAIL:', name)); };

check('key is namespaced', s.key === 'oss-idle-addon:test');
check('empty store returns defaults', JSON.stringify(s.load()) === JSON.stringify(defaults));

s.save({ targetSkill: 'speed', runs: 5, excludeFailed: false });
check('round-trips', s.load().targetSkill === 'speed' && s.load().runs === 5);

// a setting added in a later version must not invalidate stored values
store.set('oss-idle-addon:test', JSON.stringify({ targetSkill: 'speed' }));
const merged = s.load();
check('missing key falls back to default', merged.runs === 3 && merged.targetSkill === 'speed');

// a removed setting cleans itself up
store.set('oss-idle-addon:test', JSON.stringify({ targetSkill: 'speed', gone: 42 }));
check('unknown key dropped', !('gone' in s.load()));

// hand-edited / stale entries must not change a value's type
store.set('oss-idle-addon:test', JSON.stringify({ runs: 'lots' }));
check('type mismatch ignored', s.load().runs === 3);

store.set('oss-idle-addon:test', 'not json{');
check('corrupt entry returns defaults', s.load().runs === 3);

store.set('oss-idle-addon:test', 'null');
check('null entry returns defaults', s.load().targetSkill === 'total');

// settings saved before the rename to oss!idle carry over
store.delete('oss-idle-addon:test');
store.set('osu-idle-addon:test', JSON.stringify({ targetSkill: 'stamina' }));
check('legacy key read', s.load().targetSkill === 'stamina');
s.save({ ...defaults, runs: 7 });
check('saves under the new key', JSON.parse(store.get('oss-idle-addon:test')).runs === 7 && s.load().runs === 7);

// storage that throws (private mode / quota) must not take the add-on down
globalThis.localStorage = {
	getItem: () => { throw new Error('denied'); },
	setItem: () => { throw new Error('quota'); },
	removeItem: () => { throw new Error('denied'); },
};
const hostile = createSettings('test', defaults);
check('load survives throwing storage', hostile.load().runs === 3);
let threw = false;
try { hostile.save({ ...defaults }); hostile.clear(); } catch { threw = true; }
check('save/clear survive throwing storage', !threw);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

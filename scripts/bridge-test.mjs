/**
 * Do the database bridges behave against a real database?
 *
 * Runs the built `gameDb` and score helpers against sql.js carrying the
 * client's own schema, with `window.db` stubbed by the same read/write contract
 * the client publishes - so the write path is exercised, not just the SQL.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SQL = await require('sql.js')();
const db = new SQL.Database();

// The client's schema, as its DDL generator emits it.
db.run(`
CREATE TABLE IF NOT EXISTS score (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  characterId INTEGER NOT NULL,
  beatmapId INTEGER NOT NULL,
  playedAt INTEGER NOT NULL
);
`);

let writes = 0;
globalThis.window = {
	db: {
		read: async fn => fn(db),
		write: async fn => { writes++; return fn(db); },
	},
};

const dist = join(REPO_ROOT, 'packages/addon-sdk/dist');
const { gameDb } = await import(pathToFileURL(join(dist, 'bridge/db.js')).href);
const { playCountsSince, recentPlayCounts } =
	await import(pathToFileURL(join(dist, 'bridge/scores.js')).href);

const rows = sql => { const r = db.exec(sql); return r[0] ? r[0].values : []; };
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
	cond ? pass++ : (fail++, console.log('  FAIL:', name, extra));
};

// --- gameDb ---------------------------------------------------------------

const insertScore = { sql: 'INSERT INTO score (characterId, beatmapId, playedAt) VALUES (?, ?, ?)', params: [3, 950, 0] };
await gameDb.run(insertScore.sql, insertScore.params);
check('run goes through the write path', writes === 1, `writes=${writes}`);
await gameDb.batch([insertScore, insertScore]);
check('batch is one save', writes === 2, `writes=${writes}`);
check('reads see the writes',
	(await gameDb.value('SELECT COUNT(*) FROM score WHERE characterId = 3')) === 3);

// --- scores ---------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const play = (characterId, beatmapId, at) =>
	db.run('INSERT INTO score (characterId, beatmapId, playedAt) VALUES (?, ?, ?)',
		[characterId, beatmapId, at]);

play(1, 900, now - 2 * DAY);      // before the cutoff
play(1, 900, now - 1000);
play(1, 900, now - 2000);
play(1, 901, now - 3000);
play(2, 900, now - 4000);         // another character

const counts = await playCountsSince(1, now - DAY);
check('counts only this character', counts[900] === 2, JSON.stringify(counts));
check('counts per map', counts[901] === 1);
check('ignores plays before the cutoff', Object.values(counts).reduce((a, b) => a + b, 0) === 3);

const recent = await recentPlayCounts(1);
check('recent counts per map', recent.get(900) === 2 && recent.get(901) === 1);
check('recent excludes other characters', !recent.has(902));

console.log(`\n${pass} passed, ${fail} failed  (write-path calls: ${writes})`);
process.exit(fail ? 1 : 0);

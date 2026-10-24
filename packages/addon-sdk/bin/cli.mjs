#!/usr/bin/env node
/**
 * oss-idle-addon - the oss!idle Addon SDK command line.
 *
 *   oss-idle-addon init [dir] [--name "My Add-on"] [--template react|plain]
 *   oss-idle-addon build [--config addon.config.json] [--minify] [--watch]
 *   oss-idle-addon setup
 *   oss-idle-addon release [patch|minor|major|<version>]
 */
import { readFile } from 'node:fs/promises';
import { existsSync, statSync, watch } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { scaffold, TEMPLATE_NAMES } from './scaffold.mjs';
import { git, isPublic, MAX_BUNDLE, repoProblems, repoUrl } from './repo.mjs';

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'build';
const args = argv.slice(argv[0] === command ? 1 : 0);

const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
/** First argument that is not a flag or a flag's value. */
const positional = () => {
	for (let i = 0; i < args.length; i++) {
		if (args[i].startsWith('--')) { i++; continue; }
		return args[i];
	}
	return undefined;
};

const usage = `oss!idle Addon SDK

  oss-idle-addon init [dir]        create a new add-on project
    --name "My Add-on"             display name (default: the directory name)
    --template ${TEMPLATE_NAMES.join('|').padEnd(20)}starting point (default: react)
    --license <spdx>               default: AGPL-3.0-only
    --force                        write into a non-empty directory

  oss-idle-addon build             bundle the add-on into one ES module
    --config <path>                default: addon.config.json
    --minify                       smaller, but harder for players to read
    --sourcemap                    inline source map
    --watch                        rebuild on change

  oss-idle-addon setup             check the repository is ready for oss!idle to
                                   build, and print what to fill in in game

  oss-idle-addon release [bump]    lint, build, tag the next version and push it
                                   bump: patch (default), minor, major or 1.2.3
`;

const die = (message) => { console.error(message); process.exit(1); };

if (flag('help') || flag('h') || command === 'help') {
	console.log(usage);
	process.exit(0);
}

if (command === 'init') {
	const dir = positional() ?? '.';
	const name = option('name', resolve(dir).split(/[\\/]/).pop());

	const result = await scaffold({
		dir,
		name,
		template: option('template', 'react'),
		license: option('license', 'AGPL-3.0-only'),
		force: flag('force'),
	}).catch(e => die(e.message));

	const where = relative(process.cwd(), result.target) || '.';
	console.log(`Created ${name} in ${where}/  (${result.template} template)\n`);
	console.log('Next:');
	if (where !== '.') console.log(`  cd ${where}`);
	console.log('  npm install');
	console.log('  npm run build\n');
	console.log(`Then paste ${result.outfile} into the in-game add-on editor.`);
	process.exit(0);
}

if (!['build', 'setup', 'release'].includes(command)) die(`Unknown command "${command}".\n\n${usage}`);

const configPath = resolve(option('config', 'addon.config.json'));
if (!existsSync(configPath)) {
	die(`No config at ${configPath}.\nRun "oss-idle-addon init" to create a project, or pass --config.`);
}

const config = JSON.parse(await readFile(configPath, 'utf8'));
const cwd = resolve(configPath, '..');

if (!config.entry || !config.outfile) {
	die(`${configPath} needs both "entry" and "outfile".`);
}

/**
 * The add-on's version, from package.json - the one file that must carry one.
 * Repeating it in addon.config.json is how a bundle ends up claiming a version
 * it is not.
 */
const pkgVersion = await readFile(resolve(cwd, 'package.json'), 'utf8')
	.then(raw => JSON.parse(raw).version)
	.catch(() => undefined);

const bail = (problems) => die(`Not ready for oss!idle to build:\n${problems.map(p => `  - ${p}`).join('\n')}`);

// ---- setup ---------------------------------------------------------------

if (command === 'setup') {
	const problems = repoProblems(cwd, config);
	if (problems.length) bail(problems);

	const url = repoUrl(cwd);
	if (!isPublic(url)) {
		bail([`${url} does not answer without credentials: make it public and push it.`]);
	}

	const pkg = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
	const rows = [
		['Name', config.name],
		['Repository', url],
		['Description', pkg.description],
		['Type', (config.types ?? ['gameplay']).join(', ')],
		['Tags', pkg.keywords?.join(', ')],
	];
	console.log('In game: Options → Add-ons → Manage → Create new add-on,');
	console.log('choose "Built from a git repository" and fill in:\n');
	for (const [label, value] of rows.filter(([, value]) => value)) console.log(`  ${label.padEnd(12)} ${value ?? ''}`);
	console.log('\nSave it, then add the webhook address it shows to the repository as a push webhook.');
	console.log('Release with "npx oss-idle-addon release" (each version tag is built by oss!idle).');
	process.exit(0);
}

// ---- release -------------------------------------------------------------

if (command === 'release') {
	const problems = repoProblems(cwd, config);
	if (git(cwd, 'status', '--porcelain')) problems.push('Uncommitted changes: commit or stash them first.');
	if (problems.length) bail(problems);

	const pkg = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
	const npm = (...npmArgs) => execFileSync('npm', npmArgs, { cwd, stdio: 'inherit' });
	try {
		// what oss!idle refuses, flagged in the sources before it is in a tag
		if (pkg.scripts?.lint) npm('run', 'lint');
		npm('run', 'build');
	} catch {
		die('Fix the errors above, then release again.');
	}

	const outfile = resolve(cwd, config.outfile);
	if (!existsSync(outfile)) die(`npm run build did not emit ${config.outfile}.`);
	if (statSync(outfile).size > MAX_BUNDLE) {
		die(`${config.outfile} is over ${MAX_BUNDLE / 1024 / 1024} MB, the most oss!idle accepts.`);
	}

	const bump = positional() ?? 'patch';
	// commits package.json and its lockfile, and tags v<version>
	const tag = execFileSync('npm', ['version', bump, '-m', 'Release %s'], { cwd, encoding: 'utf8' })
		.trim().split('\n').at(-1);
	try {
		git(cwd, 'push', '--atomic', 'origin', 'HEAD', `refs/tags/${tag}`);
	} catch (e) {
		die(`${e.stderr ?? e.message}\n${tag} is tagged here but not pushed: git push --atomic origin HEAD ${tag}`);
	}
	console.log(`Pushed ${tag}. oss!idle builds it when the webhook fires: its builds show in game.`);
	process.exit(0);
}

// ---- build ---------------------------------------------------------------

const { bundleAddon } = await import('../dist/build/index.js');

const run = async () => {
	const started = Date.now();
	const { outfile, bytes } = await bundleAddon({
		entry: resolve(cwd, config.entry),
		outfile: resolve(cwd, config.outfile),
		gameRoot: process.env.OSS_IDLE_PATH ?? config.gameRoot,
		minify: flag('minify') || !!config.minify,
		sourcemap: flag('sourcemap'),
		stubModules: config.stubModules,
		dedupe: config.dedupe,
		dedupeFrom: cwd,
		sharedReact: !!config.sharedReact,
		meta: {
			name: config.name,
			version: pkgVersion,
			gameVersion: process.env.OSS_IDLE_GAME_VERSION ?? config.gameVersion,
			license: config.license,
		},
	});
	console.log(
		`built ${relative(process.cwd(), outfile)} - ${(bytes / 1024).toFixed(1)} kB`
		+ ` in ${Date.now() - started}ms`,
	);
};

await run().catch(e => die(e.message ?? e));

if (flag('watch')) {
	const src = resolve(cwd, 'src');
	console.log(`watching ${relative(process.cwd(), src)}/ ...`);
	let queued;
	watch(src, { recursive: true }, () => {
		clearTimeout(queued);
		queued = setTimeout(() => run().catch(e => console.error(e.message ?? e)), 120);
	});
}

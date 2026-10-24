/**
 * An add-on repository as oss!idle's builder sees it: what `setup` and `release`
 * check before anything reaches the game.
 *
 * The builder clones the newest version tag over https, runs
 * `npm ci --ignore-scripts` then `npm run build` offline, and reads `outfile`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** oss!idle's MAX_ADDON_BUNDLE: players download a bundle whole. */
export const MAX_BUNDLE = 8 * 1024 * 1024;

export const git = (cwd, ...args) => execFileSync('git', args, {
	cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return undefined; } };

/**
 * The https address the game asks for, from a git remote: `git@host:o/r.git` and
 * `ssh://git@host/o/r.git` become `https://host/o/r.git`, credentials dropped.
 * Undefined for a remote with no https form (a local path).
 */
export const httpsUrl = (remote) => {
	const scp = /^[\w.-]+@([^:/]+):(?!\/)(.+)$/.exec(remote);
	if (scp) return `https://${scp[1]}/${scp[2]}`;
	let url;
	try { url = new URL(remote); } catch { return undefined; }
	if (url.protocol === 'https:') {
		url.username = url.password = '';
		return url.href;
	}
	// an ssh or git port is not the https port, so it goes
	return ['ssh:', 'git:', 'http:'].includes(url.protocol)
		? `https://${url.hostname}${url.pathname}`
		: undefined;
};

/** The origin remote's https address, if there is one. */
export const repoUrl = (cwd) => {
	const remote = tryGit(cwd, 'remote', 'get-url', 'origin');
	return remote && httpsUrl(remote);
};

/** Whether the address answers without credentials, as it must for the builder. */
export const isPublic = (url) => {
	try {
		execFileSync('git', ['-c', 'credential.helper=', 'ls-remote', '--heads', url], {
			stdio: 'ignore', timeout: 20_000,
			env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' },
		});
		return true;
	} catch {
		return false;
	}
};

/** What would stop oss!idle from building this repository, in the author's words. */
export const repoProblems = (cwd, config) => {
	const root = tryGit(cwd, 'rev-parse', '--show-toplevel');
	if (!root) return ['This is not a git repository: run "git init", commit, and push it somewhere public.'];

	const problems = [];
	const tracked = (file) => tryGit(cwd, 'ls-files', '--error-unmatch', file) !== undefined;
	const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));

	if (resolve(root) !== resolve(cwd)) {
		problems.push(`The add-on has to be the repository's root: oss!idle builds from ${root}, not ${cwd}.`);
	}
	if (!repoUrl(cwd)) {
		problems.push('No "origin" remote with an https address: git remote add origin https://<host>/<you>/<repo>.git');
	}
	if (!pkg.scripts?.build) problems.push('package.json has no "build" script.');
	if (!existsSync(resolve(cwd, 'package-lock.json'))) {
		problems.push('No package-lock.json: run "npm install" and commit it (the builder runs npm ci).');
	} else {
		if (!tracked('package-lock.json')) problems.push('Commit package-lock.json: the builder runs npm ci.');
		if (/"resolved":\s*"git\+/.test(readFileSync(resolve(cwd, 'package-lock.json'), 'utf8'))) {
			problems.push('A dependency comes from git: the builder installs without git (an https tarball is fine).');
		}
	}
	if (tracked(config.outfile)) {
		problems.push(`${config.outfile} is committed: the builder builds it itself, git rm --cached it.`);
	}
	if (config.gameRoot) {
		const rel = relative(cwd, resolve(cwd, config.gameRoot));
		if (rel.startsWith('..') || isAbsolute(rel)) {
			problems.push(`gameRoot (${config.gameRoot}) is outside the repository: the builder has no oss!idle checkout.`
				+ ' Depend on a game release tarball and point gameRoot at node_modules/oss-idle.');
		}
	}
	return problems;
};

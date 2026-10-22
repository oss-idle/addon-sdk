# __ADDON_NAME__

An add-on for [oss!idle](https://github.com/oss-idle/oss-idle), built with the
[oss!idle Addon SDK](https://github.com/oss-idle/addon-sdk).

## Build

```sh
npm install
npm run build
```

That emits `__OUTFILE__` - a single self-contained ES module. Paste its contents
into the in-game add-on editor (Options → Add-ons → Manage) and enable it.

`npm run dev` rebuilds on save; re-paste to see changes.

## Publish from a repository

Instead of pasting, oss!idle can build your add-on from a public git repository
(any host: GitHub, GitLab, Codeberg...):

1. Push this folder with its `package-lock.json` (`dist/` stays out of git).
2. In game, create an add-on, choose **Built from a git repository** and give the
   repository's https address.
3. Add the webhook address it shows to your repository as a push webhook.
4. Release by tagging: `npm version patch && git push --follow-tags`.

oss!idle refuses a built file that can run code nobody reviewed: `eval`, `new Function`,
`import()`, imports from an address, script elements, string timers and the like.
`npm run lint` flags them in your own code before you push.

Each new version tag is built by oss!idle itself (`npm ci`, then `npm run build`,
offline, with install scripts skipped) and goes to review; the moderator reads the
repository's changes, never the bundle.

## How an add-on runs

The game imports your built file as an ES module from a Blob URL and calls its
`mount` / `unmount` exports. Nothing is injected and nothing resolves at load
time, so every dependency is bundled into that one file.

`unmount` has to genuinely undo everything, because add-ons are enabled,
disabled, updated and removed without a page reload. The SDK's `Addon` base
class records teardown for every listener, timer and overlay it hands you and
reverses it for you.

## Licence

__LICENSE__

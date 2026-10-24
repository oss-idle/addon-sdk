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
2. `npm run setup` checks the repository is buildable and prints what to fill in.
3. In game, under Add-ons → Manage → **Create new add-on**, choose **Built from a git
   repository** and fill it in.
4. Add the webhook address it shows to your repository as a push webhook.
5. Release with `npm run release` (or `npm run release -- minor`): it lints,
   builds, tags the next version and pushes it.

`npm run setup` reads the type from `"types"` in `addon.config.json`
(`["gameplay"]`, `["editor"]` or both) and the tags from `keywords` in `package.json`.

oss!idle refuses a built file that can run code players cannot read in it: `eval`, `new Function`,
`import()`, imports from an address, script elements, string timers and the like.
`npm run lint` flags them in your own code before you push.

Each new version tag is built by oss!idle itself (`npm ci`, then `npm run build`,
offline, with install scripts skipped) and reaches players at once when the add-on is
published. Add-ons are not reviewed: you are responsible for what yours does.

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

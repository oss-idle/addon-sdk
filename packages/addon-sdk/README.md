<p align="center">
  <img src="https://raw.githubusercontent.com/oss-idle/addon-sdk/HEAD/icon.svg" alt="" width="112">
</p>

<h1 align="center">oss!idle Addon SDK</h1>

<p align="center">
  Build <a href="https://github.com/oss-idle/oss-idle">oss!idle</a> add-ons in
  TypeScript, with your dependencies bundled.
</p>

```sh
npx @oss-idle/addon-sdk-create@latest my-addon
cd my-addon
npm install
npm run build
```

That emits one self-contained ES module. Paste it into the in-game add-on editor
(Options → Add-ons → Manage) and enable it.

## The contract

The game loads an add-on by importing its source as a Blob ES module and calling
`mount` / `unmount`. `mount` is handed the game's host (`this.host` in an
`Addon`): its version, its React, and the editor for add-ons of the Editor type.
Add-ons run unsandboxed in the page realm and reach for the rest themselves. The
full guide, the editor API included, is at
https://oss.idle.rhythmgamers.net/web/docs/addons.

```ts
import { Addon, defineAddon } from '@oss-idle/addon-sdk';

class Hello extends Addon {
	constructor() { super({ name: 'Hello' }); }

	protected onMount() {
		this.interval(() => this.log.info('tick'), 1000);
	}
}

export const { mount, unmount } = defineAddon(() => new Hello());
```

Two things follow from that, and they shape the whole SDK:

1. **A Blob module resolves nothing** - no base URL, no import map. React, CSS,
   workers and any game code you use must already be inside the one emitted
   file. That is what `oss-idle-addon build` produces.
2. **`unmount` has to genuinely undo everything**, because add-ons are enabled,
   disabled, updated and removed without a page reload. Anything you register
   through `this.on`, `this.interval`, `this.timeout` or `this.own` is torn down
   for you, in reverse order, even if one teardown throws.

## Editor add-ons

An add-on of the Editor type (picked when you make it in game) reaches the map
editor while it is open. Everything registered through the editor's API goes when
the editor closes or the add-on unmounts.

```ts
class Mirror extends Addon {
	constructor() { super({ name: 'Mirror' }); }

	protected onMount() {
		this.editor(editor => {
			editor.addAction({
				id: 'mirror-selection', label: 'Mirror the selected notes', keys: ['Alt+M'],
				run: () => {
					const picked = new Set(editor.selection());
					editor.edit({
						notes: editor.notes().map(note => picked.has(note)
							? { ...note, column: editor.keys - 1 - note.column } : note),
					});
				},
			});
		});
	}
}
```

`EditorApi` and the other host types are exported from the package.

## React overlays

```tsx
import { ReactAddon } from '@oss-idle/addon-sdk/react';
import styles from './styles.css';

export class MyAddon extends ReactAddon {
	private open = false;

	constructor() { super({ name: 'My add-on', styles }); }

	protected override onReady() {
		this.own(this.hotkeys.register('Ctrl+Shift+K', () => {
			this.open = !this.open;
			this.refresh();
		}, { allowInText: true }));
	}

	protected render() { return <Panel open={this.open} />; }
}
```

`ReactAddon` renders into a **shadow root**, so the game's CSS cannot reach your
overlay and yours cannot restyle the game. For another framework, subclass
`Addon` and use `createOverlay` directly.

Render your panel hidden rather than returning `null`: `null` unmounts the tree,
discarding its state and running cleanup, so anything the overlay started dies
the moment the player closes it.

## Staying out of the game's way

The client binds gameplay controls as **bubble-phase listeners on `window`**,
which is what lets an overlay coexist with it.

- `isolateInput(root)`, applied for you by `createOverlay`, stops input events at
  the overlay's root while they bubble. The event still reached its target, so a
  text field types normally, but it never continues to `window` - typing "speed"
  into a filter box cannot press four gameplay keys, and scrolling a list cannot
  change the game's volume.
- `keepFocus(root)`, also applied by `createOverlay`, keeps typing in the
  overlay's fields. Since 1.2 the game holds focus in its topmost surface's box
  (song select's search, the chat), judged by `document.activeElement` - the
  shadow host, for a field in an overlay - so unguarded it takes focus from
  every overlay field and each key typed there lands in its box.
- `HotkeyManager` listens in the **capture** phase, ahead of every game handler,
  so a shortcut claims its combo before gameplay sees it. A claimed combo never
  reaches the game, so take Escape only while your panel is open (the template
  registers it on open): closed, Escape is the game's, to close its own topmost
  surface.
- Overlays default to `z-index: 50000` - above the game's UI, below its drawn
  cursor. Stack above the cursor layer (99999+) and the player loses their
  pointer entirely, because the game hides the system cursor with
  `cursor: none`, which inherits through the shadow boundary.

## Reading the game's state

Add-ons cannot import the client's modules, so the SDK talks to what the page
exposes:

```ts
import {
	gameDb, gameCharacter, beatmapStore, playlists, recentPlayCounts,
} from '@oss-idle/addon-sdk';

await gameDb.ready();                            // the client opens it lazily
const me = await gameCharacter.live();           // who is being played
const maps = await beatmapStore.difficulties();  // downloaded charts
const played = await recentPlayCounts(me.id);    // plays per map, last 24h
await playlists.replace('My rotation', [101, 102]);
```

`gameDb` wraps the sql.js handle the client publishes on `window`. Reads go
through its read path, **writes through its write path** - that is what persists
the database back to IndexedDB; a write applied on the read handle lives only
until reload.

`gameCharacter.live()` resolves who is playing from the most recent stored score,
because the client keeps that answer in module state an add-on cannot see. Note
that `character.current = 1` marks the live **guest**, not the signed-in
character - reading it directly is a quiet way to simulate the wrong player.

`beatmapStore` opens the beatmap IndexedDB **without a version number**, on
purpose: passing one could trigger an upgrade and take out the player's library.

`playlists` reads and writes the client's own playlist tables. `replace()` keeps
an existing playlist's id, so regenerating one does not orphan anything pointing
at it. The client caches playlists behind a version counter it bumps itself and
an add-on cannot reach, so **song select keeps showing the old list until it
re-reads** - say so rather than leaving the player wondering.

`playCountsSince` and `recentPlayCounts` count plays per map from the `score`
table, in one query rather than per map. The 24h/50-play window
`recentPlayCounts` uses is the one the server scores repetition over, so an
add-on predicting what a play is worth has to read it the same way.

## Remembering settings

```ts
import { createSettings } from '@oss-idle/addon-sdk';
import { usePersistedSettings } from '@oss-idle/addon-sdk/react';

const DEFAULTS = { skill: 'total', runs: 3 };
const store = createSettings('my-addon', DEFAULTS);

const [settings, update] = usePersistedSettings(store, DEFAULTS);
```

Keys live under `oss-idle-addon:<namespace>`, which matters: the client writes
its own options under bare, unprefixed keys and parses them without a guard, so a
collision would corrupt a game setting. Stored values merge over your defaults,
so shipping a new setting does not invalidate what players saved, and every
access is guarded - storage can be unavailable or full.

Use it for settings, not data. localStorage is shared with the client, so filling
it breaks the game and not just your add-on.

## Building

```sh
oss-idle-addon build [--minify] [--watch] [--config addon.config.json]
```

```jsonc
{
  "name": "My Add-on",
  "entry": "src/index.ts",
  "outfile": "dist/my-addon.js"
}
```

The version comes from `package.json`. The build stamps it into the banner and
into the bundle, so `this.meta.version` reports the version that was built:

```ts
super({ name: 'My Add-on' });   // version filled in by the bundler
this.meta.version               // "0.1.0"
buildMeta().gameVersion         // the oss!idle release it was built against
```

The build fails if the output would not export `mount` - a bundle missing it
loads without error and does nothing, which is miserable to debug from inside the
game.

Output is **not minified by default**: published add-ons are read by a human
moderator before they go live.

| Feature | Why it exists |
|---|---|
| Everything inlined into one ES module | A Blob module resolves nothing at load time. |
| `import styles from './x.css'` → string | For injecting into the overlay's shadow root. |
| `import make from 'worker:./x.worker'` | Workers must travel inside the same file. Heavy work belongs off the main thread - the game is a rhythm game sharing it. |
| `import bytes from './x.wasm?base64'` | Same reason: a Blob module cannot fetch a sibling asset. |
| `gameRoot` → resolves `@oss-idle/shared/*` | The game's package is unpublished, so its TypeScript is compiled from a checkout (`$OSS_IDLE_PATH`). |
| `dedupe` | Your sources and the game's come from different checkouts, so shared packages would otherwise be bundled twice - which silently breaks prototype patches and `instanceof`. |
| `stubModules` | Trims a heavy dependency a game module imports but your add-on never calls. Stubs **throw** if reached. |
| `plugins` | Extra esbuild plugins for the add-on and its workers, run before the SDK's own - e.g. to redirect one of the game's imports to your own module. |

### Using the game's own code

An add-on can bundle oss!idle's simulation, skills and helpers straight from a
checkout:

```jsonc
{
  "gameRoot": "/path/to/oss-idle",       // or set $OSS_IDLE_PATH
  "dedupe": ["osu-classes", "osu-parsers", "osu-mania-stable"]
}
```

```ts
import { ManiaGame } from '@oss-idle/shared/sim/maniaGame';
```

Doing so makes your add-on a derivative work of oss!idle, which is **AGPL-3.0** -
so it must be AGPL-3.0 too. Pin the game version you built against; the sources
are internal and do move between releases.

### The game's React

Set `"sharedReact": true` in `addon.config.json` (the template does) and the
bundle reads React from the game instead of shipping its own: one React on the
page, a smaller add-on, and no React to install - `@types/react` and
`@types/react-dom` are enough to typecheck. A worker gets a React that loads
but has nothing to render with. A game too old to hand out its React refuses the
add-on with a message; leave the option off to support those.

## Licence

AGPL-3.0-only.

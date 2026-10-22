import { Addon } from './addon.js';
import type { AddonHost } from './host.js';

/** The module shape oss!idle's add-on runtime imports and drives. */
export type AddonModule = {
	mount: (meta?: unknown, host?: AddonHost) => void;
	unmount: () => Promise<void>;
};

/**
 * Turn an {@link Addon} subclass into the `mount` / `unmount` pair the runtime
 * expects:
 *
 * ```ts
 * export const { mount, unmount } = defineAddon(() => new MyAddon());
 * ```
 *
 * The runtime calls `mount` synchronously and ignores what it returns, so an
 * async `onMount` is started and left to run - its failure is reported here
 * rather than surfacing as an unhandled rejection in the player's console.
 * `unmount` returns its teardown, which the runtime awaits before mounting an
 * updated version.
 *
 * A mount still settling when `unmount` arrives (disable clicked mid-boot) is
 * awaited first, so teardown never races a half-built overlay.
 */
export const defineAddon = (create: () => Addon): AddonModule => {
	let instance: Addon | undefined;
	let settling: Promise<void> = Promise.resolve();

	return {
		mount: (_meta, host) => {
			instance = create();
			const addon = instance;
			settling = addon._mount(host).catch((e: unknown) => {
				console.error('[addon] mount failed', e);
			});
		},
		unmount: () => {
			const addon = instance;
			if (!addon) return settling;
			instance = undefined;
			settling = settling
				.then(() => addon._unmount())
				.catch((e: unknown) => console.error('[addon] unmount failed', e));
			return settling;
		},
	};
};

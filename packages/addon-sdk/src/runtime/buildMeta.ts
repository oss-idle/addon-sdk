/**
 * What the bundler stamped into this add-on.
 *
 * `bundleAddon` defines these from the manifest it was given, and `Addon` takes
 * `version` from here when a subclass passes none. Every field is optional: a
 * bundle built by other tooling carries none of them.
 */
declare const __OSS_IDLE_ADDON__: BuildMeta | undefined;

export type BuildMeta = {
	name?: string;
	version?: string;
	/** The oss!idle release the bundle was built against. */
	gameVersion?: string;
	/** The @oss-idle/addon-sdk that built it. */
	sdkVersion?: string;
	license?: string;
};

export const buildMeta = (): BuildMeta =>
	typeof __OSS_IDLE_ADDON__ === 'undefined' ? {} : __OSS_IDLE_ADDON__;

/**
 * What the game hands an add-on: `mount(meta, host)`, and the same object on
 * `globalThis.ossIdle` for code that runs before `mount` (the `sharedReact`
 * build reads React there). Mirrors the game's `addons/host.ts` and
 * `editor/editorApi.ts`; an older game hands none.
 */

/** A teardown; running it undoes what returned it. */
type Disposer = () => void;

/** A note as the editor holds it; `end` makes it a long note. */
export type EditorNote = {
	time: number;
	column: number;
	end?: number;
	/** the .osu hitSound bits, as written */
	hitSound: string;
	/** the .osu sample fields, as written */
	sample: string;
};

export type EditorTimingPoint = {
	time: number;
	/** ms per beat for a BPM point; -100 / the multiplier for a scroll speed one */
	beatLength: number;
	meter: number;
	sound: string;
	effects: string;
};

export type EditorMetadata = {
	title: string;
	titleUnicode: string;
	artist: string;
	artistUnicode: string;
	creator: string;
	version: string;
	source: string;
	tags: string;
	previewTime: number;
};

/** Draws into `container`; what it returns runs when it goes. */
export type EditorRender = (container: HTMLElement) => void | (() => void);

/**
 * The open editor. Notes and points are the editor's own objects: read them,
 * never change them, and hand new ones to `edit`. Everything registered here
 * goes when the editor closes or the add-on stops.
 */
export type EditorApi = {
	readonly keys: number;
	notes(): readonly EditorNote[];
	timing(): readonly EditorTimingPoint[];
	scroll(): readonly EditorTimingPoint[];
	metadata(): Readonly<EditorMetadata>;
	bookmarks(): readonly number[];
	text(): string;
	edit(change: {
		notes?: EditorNote[];
		timing?: EditorTimingPoint[];
		scroll?: EditorTimingPoint[];
		bookmarks?: number[];
		metadata?: Partial<EditorMetadata>;
	}, select?: EditorNote[]): void;
	undo(): void;
	redo(): void;
	save(): void;
	selection(): EditorNote[];
	select(notes: EditorNote[]): void;
	now(): number;
	seek(ms: number): void;
	play(): void;
	pause(): void;
	isPlaying(): boolean;
	snap(ms: number): number;
	divisor(): number;
	setDivisor(divisor: number): void;
	onChange(callback: () => void): Disposer;
	addAction(action: { id: string; label: string; keys?: string[]; run: () => void }): Disposer;
	addTab(tab: { id: string; label: string; render: EditorRender }): Disposer;
	addPanel(panel: { id: string; title?: string; render: EditorRender }): Disposer;
	openWindow(window: {
		title: string; width?: number; height?: number; render: EditorRender; onClose?: () => void;
	}): { close(): void };
};

export type AddonHost = {
	/** the game's version */
	version: string;
	/** the game's React modules by import path */
	react: Record<string, unknown>;
	editor: {
		/** `onOpen` runs whenever the editor opens (now, if it is open), `onClose` when it closes. */
		watch(onOpen: (editor: EditorApi) => void, onClose?: () => void): Disposer;
	};
};

/** The game's host, if it hands one out (older games do not). */
export const gameHost = (): AddonHost | undefined =>
	(globalThis as { ossIdle?: AddonHost }).ossIdle;

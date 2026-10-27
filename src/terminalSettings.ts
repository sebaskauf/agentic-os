import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { ITheme } from "@xterm/xterm";

/**
 * Terminal-Darstellung (Schriftgröße + Farben), vom Nutzer anpassbar.
 *
 * Gespeichert werden NUR die Werte, die der Nutzer selbst geändert hat, in
 * ~/.agentic-os/terminal-settings.json. Die Datei liegt bewusst außerhalb des
 * Plugin-Ordners: Ein Update ersetzt main.js/styles.css/manifest.json, die
 * Einstellungen bleiben dabei erhalten. Ohne Datei sieht das Terminal exakt
 * so aus wie vorher (DEFAULT_* unten = die bisherigen fest eingebauten Werte).
 *
 * Wer künftig die Standard-Optik ändert: nur DEFAULT_FONT_SIZE / DEFAULT_THEME
 * anpassen. Nutzer ohne eigene Werte bekommen die neue Optik automatisch,
 * Nutzer mit eigenen Werten behalten ihre Werte.
 */

export const DEFAULT_FONT_SIZE = 12.5;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;

export const DEFAULT_THEME: Readonly<ITheme> = Object.freeze({
	background: "#0a0a0a",
	foreground: "#e5e5e5",
	cursor: "#FF6B1A",
	cursorAccent: "#0a0a0a",
	selectionBackground: "#3a2515",
	black: "#0a0a0a",
	red: "#f87171",
	green: "#4ade80",
	yellow: "#fbbf24",
	blue: "#60a5fa",
	magenta: "#c084fc",
	cyan: "#22d3ee",
	white: "#e5e5e5",
	brightBlack: "#5a5a5a",
	brightRed: "#fca5a5",
	brightGreen: "#86efac",
	brightYellow: "#fde68a",
	brightBlue: "#93c5fd",
	brightMagenta: "#d8b4fe",
	brightCyan: "#67e8f9",
	brightWhite: "#f5f5f5",
});

/** Farbschlüssel, die per Datei oder Einstellungen überschrieben werden dürfen. */
export type TerminalColorKey =
	| "background" | "foreground" | "cursor" | "cursorAccent" | "selectionBackground"
	| "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white"
	| "brightBlack" | "brightRed" | "brightGreen" | "brightYellow"
	| "brightBlue" | "brightMagenta" | "brightCyan" | "brightWhite";

export const COLOR_KEYS: readonly TerminalColorKey[] = [
	"background", "foreground", "cursor", "cursorAccent", "selectionBackground",
	"black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
	"brightBlack", "brightRed", "brightGreen", "brightYellow",
	"brightBlue", "brightMagenta", "brightCyan", "brightWhite",
];

/** Was auf der Platte steht: nur eigene Abweichungen vom Standard. */
export interface StoredTerminalSettings {
	fontSize?: number;
	colors?: Partial<Record<TerminalColorKey, string>>;
}

/** Was das Terminal tatsächlich bekommt: Standard + eigene Werte. */
export interface ResolvedTerminalSettings {
	fontSize: number;
	theme: ITheme;
}

const DIR = join(homedir(), ".agentic-os");
export const TERMINAL_SETTINGS_FILE = join(DIR, "terminal-settings.json");

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isValidFontSize(v: unknown): v is number {
	return typeof v === "number" && Number.isFinite(v) && v >= MIN_FONT_SIZE && v <= MAX_FONT_SIZE;
}

/** Ungültige oder unbekannte Einträge werden still verworfen, damit eine kaputte Datei nie das Terminal bricht. */
export function sanitizeStored(raw: unknown): StoredTerminalSettings {
	const out: StoredTerminalSettings = {};
	if (raw === null || typeof raw !== "object") return out;
	const obj = raw as Record<string, unknown>;
	if (isValidFontSize(obj.fontSize)) out.fontSize = obj.fontSize;
	const colors = obj.colors;
	if (colors !== null && typeof colors === "object") {
		const clean: Partial<Record<TerminalColorKey, string>> = {};
		for (const key of COLOR_KEYS) {
			const v = (colors as Record<string, unknown>)[key];
			if (typeof v === "string" && HEX_COLOR.test(v.trim())) clean[key] = v.trim();
		}
		if (Object.keys(clean).length > 0) out.colors = clean;
	}
	return out;
}

/** Standard + eigene Werte zusammenführen. Ohne eigene Werte = exakt der bisherige Look. */
export function resolveTerminalSettings(stored: StoredTerminalSettings): ResolvedTerminalSettings {
	const colors = stored.colors ?? {};
	const theme: ITheme = { ...DEFAULT_THEME, ...colors };
	// Cursor-Zeichenfarbe folgt dem Hintergrund, solange sie nicht selbst gesetzt ist
	// (Standard: beide #0a0a0a, also keine Änderung am bisherigen Look).
	if (colors.cursorAccent === undefined && colors.background !== undefined) {
		theme.cursorAccent = colors.background;
	}
	return { fontSize: stored.fontSize ?? DEFAULT_FONT_SIZE, theme };
}

let cache: StoredTerminalSettings | null = null;
const listeners = new Set<(s: ResolvedTerminalSettings) => void>();

export function loadStoredTerminalSettings(): StoredTerminalSettings {
	if (cache !== null) return cache;
	try {
		if (existsSync(TERMINAL_SETTINGS_FILE)) {
			cache = sanitizeStored(JSON.parse(readFileSync(TERMINAL_SETTINGS_FILE, "utf8")));
			return cache;
		}
	} catch (e) {
		console.warn("[agentic-os] terminal-settings.json nicht lesbar, nutze Standard:", e);
	}
	cache = {};
	return cache;
}

export function getTerminalSettings(): ResolvedTerminalSettings {
	return resolveTerminalSettings(loadStoredTerminalSettings());
}

/** Speichert und wendet sofort auf alle offenen Terminals an. */
export function saveStoredTerminalSettings(next: StoredTerminalSettings): void {
	const clean = sanitizeStored(next);
	cache = clean;
	try {
		if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
		writeFileSync(TERMINAL_SETTINGS_FILE, JSON.stringify(clean, null, 2) + "\n", "utf8");
	} catch (e) {
		console.error("[agentic-os] terminal-settings.json konnte nicht gespeichert werden:", e);
	}
	const resolved = resolveTerminalSettings(clean);
	listeners.forEach((fn) => {
		try { fn(resolved); } catch (_) { /* ein kaputter Listener darf die anderen nicht stoppen */ }
	});
}

/** Datei neu einlesen (z. B. nach Handbearbeitung) und an offene Terminals geben. */
export function reloadTerminalSettings(): void {
	cache = null;
	const resolved = getTerminalSettings();
	listeners.forEach((fn) => {
		try { fn(resolved); } catch (_) { /* ignore */ }
	});
}

export function onTerminalSettingsChange(fn: (s: ResolvedTerminalSettings) => void): () => void {
	listeners.add(fn);
	return () => { listeners.delete(fn); };
}

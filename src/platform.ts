import * as os from "os";
import * as path from "path";
import { existsSync } from "fs";

/**
 * Zentrale Plattform-Util. Eine Quelle der Wahrheit fuer alle OS-spezifischen
 * Werte (HOME, PATH, Shell, claude-Binary). Ersetzt das Hardcoding aus
 * tmuxSession.ts/sendKeys.ts. Scope Welle 1: alles was der node-pty-Spawn braucht.
 */

export const isMac = process.platform === "darwin";
export const isWin = process.platform === "win32";
export const isLinux = process.platform === "linux";

/** Plattformneutrales HOME. Win: %USERPROFILE%, mac/linux: $HOME. Niemals hardcoden. */
export const homeDir: string = os.homedir();

export const pathDelim: string = path.delimiter; // ":" vs ";"

/**
 * Zusaetzliche Verzeichnisse die jeder Agent via --add-dir Schreibzugriff bekommt.
 * Generisch leer: der cwd (Vault-Root bzw. Projekt-Ordner) ist von claude ohnehin
 * implizit erlaubt.
 */
export const ALWAYS_ALLOWED_DIRS: string[] = [];

/**
 * Vault-Root via globalem Obsidian-app (kein homedir-Raten). Leer wenn nicht ermittelbar.
 * Quelle der Wahrheit fuer den "vault"-Workspace + den @-Mention-Datei-Scanner.
 */
export function vaultRoot(): string {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const app = (window as any).app;
		const adapter = app?.vault?.adapter;
		if (adapter !== undefined && typeof adapter.getBasePath === "function") {
			return adapter.getBasePath() as string;
		}
	} catch (_) { /* ignore */ }
	return "";
}

/** Kandidaten-Bin-Dirs je Plattform fuer den PATH-Aufbau (claude/node finden). */
function candidateBinDirs(): string[] {
	if (isWin) {
		const appData = process.env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
		const local = process.env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local");
		return [
			path.join(appData, "npm"),                    // npm global (.cmd shims)
			path.join(local, "Microsoft", "WindowsApps"), // winget/Store
			path.join(homeDir, ".bun", "bin"),
			path.join(homeDir, ".local", "bin"),
		];
	}
	return [
		path.join(homeDir, ".npm-global", "bin"),
		path.join(homeDir, ".bun", "bin"),
		path.join(homeDir, ".local", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
	];
}

/** PATH fuer gespawnte Prozesse: Kandidaten prepend, bestehenden PATH anhaengen. */
export function buildPath(): string {
	const existing = process.env.PATH ?? process.env.Path ?? "";
	return [...candidateBinDirs(), existing].filter((p) => p.length > 0).join(pathDelim);
}

/**
 * Komplettes env-Objekt fuer den node-pty-Spawn. Setzt PATH + claude-TUI-Flags
 * direkt (ersetzt den alten `export PATH=... && export CLAUDE_...` Shell-Wrapper).
 * Gefiltert auf string-Werte, weil node-pty ein Record<string,string> erwartet.
 */
export function spawnEnv(extra?: Record<string, string>): Record<string, string> {
	const base: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string") base[k] = v;
	}
	base.PATH = buildPath();
	base.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN = "1";
	base.CLAUDE_CODE_DISABLE_MOUSE = "1";
	base.TERM = "xterm-256color";
	if (extra !== undefined) {
		for (const [k, v] of Object.entries(extra)) base[k] = v;
	}
	return base;
}

/** Sucht ein Binary ueber Kandidaten-Dirs + PATH. Win: probiert .cmd/.exe/.bat. */
export function resolveBinary(name: string): string | undefined {
	const exts = isWin ? ["", ".cmd", ".exe", ".bat"] : [""];
	const dirs = [...candidateBinDirs(), ...(process.env.PATH ?? "").split(pathDelim)];
	for (const dir of dirs) {
		if (dir.length === 0) continue;
		for (const ext of exts) {
			const full = path.join(dir, name + ext);
			try {
				if (existsSync(full)) return full;
			} catch (_) { /* ignore */ }
		}
	}
	return undefined;
}

/**
 * Resolver fuer die claude-CLI. node-pty spawnt das Binary direkt (keine
 * Login-Shell), daher muss der Pfad absolut aufloesbar sein. Fallback "claude"
 * delegiert ans PATH-Lookup (env.PATH greift). Win: claude.cmd (npm-Shim).
 */
export function claudeBinary(): string {
	return resolveBinary("claude") ?? (isWin ? "claude.cmd" : "claude");
}

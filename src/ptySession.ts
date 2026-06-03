import * as path from "path";
import type { IPty } from "node-pty";
import { loadPty } from "./ptyLoader";
import { homeDir, ALWAYS_ALLOWED_DIRS, claudeBinary, spawnEnv, vaultRoot } from "./platform";

/**
 * node-pty Session-Manager — ersetzt den externen tmux-Server durch einen
 * Modul-Singleton im Renderer. Haelt pro Session eine IPty + Ring-Buffer
 * (fuer Replay bei Tab-Wechsel) + Multi-Subscriber-Fan-out (mehrere XtermPanes
 * derselben Session, z.B. Drawer + Pop-out-Leaf).
 *
 * pty.onData ist ein Single-Drain-Stream: wir abonnieren ihn GENAU EINMAL pro
 * Session, schreiben in den Ring und faechern an N Subscriber auf.
 */

// Re-export der plattform-agnostischen Parser, damit Consumer (ChatDrawer/StatusBar)
// weiterhin von EINER Stelle importieren koennen (frueher tmuxSession.ts).
export {
	stripFooter,
	parseTmuxChat,
	detectThinking,
	parseStatusInfo,
	stripAnsi,
	cleanResponseLines,
	cleanResponseToBlocks,
	mapVerbToTool,
} from "./chatParser";
export type { ContentBlock, ParsedMessage, StatusInfo, ParsedChat } from "./chatParser";

import { stripAnsi } from "./chatParser";

/** Roh-Bytes (inkl. ANSI) die wir fuer Replay vorhalten. ~256 KB ≈ tmux scrollback 5000. */
const RING_CAPACITY = 256 * 1024;

type DataSub = (chunk: string) => void;
type ExitSub = (code: number, signal?: number) => void;

interface ManagedSession {
	pty: IPty;
	ring: string;            // letzte ~RING_CAPACITY Bytes roher Output (ANSI inklusive)
	dataSubs: Set<DataSub>;  // Fan-out an XtermPanes (Live-Stream)
	exitSubs: Set<ExitSub>;
	exited: boolean;
	exitCode: number | null;
	cols: number;
	rows: number;
}

// === MODUL-SINGLETON === (ueberlebt React-Remounts, wie der tmux-Server)
const SESSIONS: Map<string, ManagedSession> = new Map();

/** Ring anhaengen + cappen. Cut nur an \n-Grenze, sonst zerschnittene ANSI-/UTF-8-Sequenz = Muell oben. */
function appendToRing(s: ManagedSession, chunk: string): void {
	s.ring += chunk;
	if (s.ring.length > RING_CAPACITY) {
		const cutFrom = s.ring.length - RING_CAPACITY;
		const nl = s.ring.indexOf("\n", cutFrom);
		s.ring = nl >= 0 ? s.ring.slice(nl + 1) : s.ring.slice(cutFrom);
	}
}

/* ============================ Lifecycle ============================ */

export interface SpawnOpts {
	sessionName: string;
	agentName?: string;
	cwd?: string;
	// "home" = neutral $HOME. "vault" = cwd auf den Obsidian-Vault des Users.
	workspace?: "home" | "vault";
	// Wenn true: claude mit --dangerously-skip-permissions (YOLO/bypass).
	dangerous?: boolean;
	cols?: number;   // Start-Groesse; Default 180×50 wie tmux -x180 -y50
	rows?: number;
}

/**
 * Spawnt eine node-pty-Session die `claude` (optional mit Agent) im echten PTY laeuft.
 * Idempotent: existierende lebende Session = no-op {ok:true} (wie tmux has-session → re-attach).
 */
export function spawnSession(opts: SpawnOpts): { ok: boolean; error?: string } {
	const name = opts.sessionName;
	const existing = SESSIONS.get(name);
	if (existing !== undefined && !existing.exited) return { ok: true };
	if (existing !== undefined && existing.exited) SESSIONS.delete(name);

	const pty = loadPty();
	if (pty === null) return { ok: false, error: "node-pty nicht ladbar (siehe Notice/Konsole)" };

	const workspace = opts.workspace ?? "home";
	const vault = vaultRoot();
	const cwd = opts.cwd ?? (workspace === "vault" && vault.length > 0 ? vault : homeDir);

	// Argv statt Shell-String — kein Quoting, plattformneutral.
	const args: string[] = [];
	if (opts.agentName !== undefined) args.push(`--agent=${opts.agentName}`);
	const addDirs = new Set(ALWAYS_ALLOWED_DIRS);
	addDirs.delete(cwd);
	addDirs.delete(homeDir);
	for (const d of addDirs) { args.push("--add-dir", d); }
	if (opts.dangerous === true) args.push("--dangerously-skip-permissions");

	const cols = opts.cols ?? 180;
	const rows = opts.rows ?? 50;

	try {
		const file = claudeBinary();
		const child = pty.spawn(file, args, {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env: spawnEnv(),
		});

		const s: ManagedSession = {
			pty: child,
			ring: "",
			dataSubs: new Set(),
			exitSubs: new Set(),
			exited: false,
			exitCode: null,
			cols,
			rows,
		};
		// GENAU EIN onData-Abo → Ring + Fan-out
		child.onData((chunk: string) => {
			appendToRing(s, chunk);
			for (const cb of s.dataSubs) { try { cb(chunk); } catch (_) { /* isoliert */ } }
		});
		child.onExit(({ exitCode, signal }) => {
			s.exited = true;
			s.exitCode = exitCode;
			for (const cb of s.exitSubs) { try { cb(exitCode, signal); } catch (_) { /* */ } }
		});

		SESSIONS.set(name, s);
		return { ok: true };
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error("[agentic-os] spawnSession threw:", msg);
		return { ok: false, error: msg };
	}
}

export function sessionExists(name: string): boolean {
	const s = SESSIONS.get(name);
	return s !== undefined && !s.exited;
}

export function listChatSessions(): string[] {
	return Array.from(SESSIONS.keys()).filter((n) => n.startsWith("chat-"));
}

export function killSession(name: string): void {
	const s = SESSIONS.get(name);
	if (s === undefined) return;
	try { s.pty.kill(); } catch (_) { /* schon tot */ }
	s.dataSubs.clear();
	s.exitSubs.clear();
	SESSIONS.delete(name);
}

/** Plugin-onunload: alle PTYs killen, sonst Zombie-claude-Prozesse (Kinder des Renderers). */
export function killAllSessions(): void {
	for (const name of Array.from(SESSIONS.keys())) killSession(name);
}

/* ============================ Input ============================ */

const BRACKET_START = "\x1b[200~";
const BRACKET_END = "\x1b[201~";

/**
 * Sendet text + submit an claude. \r (CR) ist Submit (Enter); \n allein nur Zeilenumbruch.
 * Mehrzeiliger Text in Bracketed-Paste huellen (interne \n submitten dann NICHT),
 * dann abschliessendes \r zum Absenden. Repliziert tmux load-buffer/paste-buffer -d + Enter.
 */
export function sendMessage(name: string, text: string): { ok: boolean; error?: string } {
	const s = SESSIONS.get(name);
	if (s === undefined || s.exited) return { ok: false, error: "session not running" };
	try {
		if (text.includes("\n")) {
			const safe = text.split(BRACKET_END).join("");
			s.pty.write(BRACKET_START + safe + BRACKET_END);
			s.pty.write("\r");
		} else {
			s.pty.write(text + "\r");
		}
		return { ok: true };
	} catch (e: unknown) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

// Named keys → Terminal-Byte-Sequenzen (ersetzt tmux send-keys named keys).
const KEY_BYTES: Record<string, string> = {
	Enter: "\r",
	Escape: "\x1b",
	Up: "\x1b[A",
	Down: "\x1b[B",
	Right: "\x1b[C",
	Left: "\x1b[D",
	"C-c": "\x03",   // Ctrl+C — STOP/interrupt
	BTab: "\x1b[Z",  // Shift+Tab — Permission-Mode-Cycle
	Tab: "\t",
};

/** Ersetzt ChatDrawer.sendKeystroke + tmux send-keys (named). Single-char keys (y/n) gehen direkt. */
export function sendKey(name: string, key: string): void {
	const bytes = KEY_BYTES[key] ?? (key.length === 1 ? key : undefined);
	if (bytes === undefined) { console.warn("[agentic-os] unknown key:", key); return; }
	writeRaw(name, bytes);
}

/** xterm onData → PTY: rohe Bytes 1:1 (ersetzt send-keys -l in XtermPane.onData). */
export function writeRaw(name: string, data: string): void {
	const s = SESSIONS.get(name);
	if (s === undefined || s.exited) return;
	try { s.pty.write(data); } catch (_) { /* */ }
}

/** Reiner Paste ohne Auto-Submit (ersetzt load-buffer/paste-buffer -d). Single-line ungewrappt. */
export function paste(name: string, text: string): void {
	const s = SESSIONS.get(name);
	if (s === undefined || s.exited || text.length === 0) return;
	const safe = text.split(BRACKET_END).join("");
	try {
		if (safe.includes("\n")) s.pty.write(BRACKET_START + safe + BRACKET_END);
		else s.pty.write(safe);
	} catch (_) { /* */ }
}

export function resize(name: string, cols: number, rows: number): void {
	const s = SESSIONS.get(name);
	if (s === undefined || s.exited || cols <= 0 || rows <= 0) return;
	s.cols = cols;
	s.rows = rows;
	try { s.pty.resize(cols, rows); } catch (_) { /* */ }
}

/* ============================ Output ============================ */

/** Roher Ring-Inhalt inkl. ANSI — fuer xterm-Replay (XtermPane). */
export function getBuffer(name: string): string {
	return SESSIONS.get(name)?.ring ?? "";
}

/** ANSI-gestrippter Klartext — fuer die Parser. Drop-in fuer altes capturePane(). */
export function getPlainBuffer(name: string): string {
	return stripAnsi(getBuffer(name));
}

/** XtermPane abonniert Live-Bytes. Returns unsubscribe. */
export function subscribe(name: string, onData: DataSub): () => void {
	const s = SESSIONS.get(name);
	if (s === undefined) return () => { /* noop */ };
	s.dataSubs.add(onData);
	return () => { s.dataSubs.delete(onData); };
}

export function onExit(name: string, cb: ExitSub): () => void {
	const s = SESSIONS.get(name);
	if (s === undefined) return () => { /* noop */ };
	s.exitSubs.add(cb);
	return () => { s.exitSubs.delete(cb); };
}

/* ====================== PtyHandle-Fassade (XtermPane) ====================== */

/** Schmale Session-Fassade fuer XtermPane — kapselt das atomare attach() (Replay+Subscribe race-frei). */
export interface PtyHandle {
	readonly sessionName: string;
	readonly alive: boolean;
	/**
	 * Schreibt synchron den Ring-Buffer (Replay) und registriert den Live-Listener
	 * in EINEM Call → kein Doppel-Chunk-Race zwischen getBuffer() und subscribe().
	 * Returns detach-fn.
	 */
	attach(write: DataSub): () => void;
	onExit(cb: ExitSub): () => void;
	getReplayBuffer(): string;
	write(data: string): void;
	resize(cols: number, rows: number): void;
}

/** Holt die Session-Fassade zu einem Namen (reiner Lookup, kein lazy spawn). */
export function getPtySession(sessionName: string): PtyHandle | null {
	const s = SESSIONS.get(sessionName);
	if (s === undefined) return null;
	return {
		sessionName,
		get alive(): boolean { return !s.exited; },
		attach(write: DataSub): () => void {
			if (s.ring.length > 0) {
				try { write(s.ring); } catch (_) { /* */ }
			}
			s.dataSubs.add(write);
			return () => { s.dataSubs.delete(write); };
		},
		onExit(cb: ExitSub): () => void {
			s.exitSubs.add(cb);
			return () => { s.exitSubs.delete(cb); };
		},
		getReplayBuffer(): string { return s.ring; },
		write(data: string): void {
			if (s.exited) return;
			try { s.pty.write(data); } catch (_) { /* */ }
		},
		resize(cols: number, rows: number): void {
			if (s.exited || cols <= 0 || rows <= 0) return;
			s.cols = cols;
			s.rows = rows;
			try { s.pty.resize(cols, rows); } catch (_) { /* */ }
		},
	};
}

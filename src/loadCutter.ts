import { spawn, execSync } from "child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync, openSync } from "fs";
import { get as httpGet } from "http";
import { join } from "path";
import { homedir, platform } from "os";

export const COCKPIT_PORT = 8766;
export const COCKPIT_URL = `http://127.0.0.1:${COCKPIT_PORT}/`;
// Unterstützt macOS und Windows; auf anderen Plattformen zeigt der Tab
// einen Hinweis und verweist auf den Browser-Weg (Cockpit läuft überall).
export const IS_WIN = platform() === "win32";
export const IS_SUPPORTED = platform() === "darwin" || IS_WIN;

/** Pfad zum venv-Python des Cutter-Repos (Windows: Scripts/ statt bin/). */
function venvPython(dir: string): string {
	return join(dir, IS_WIN ? ".venv312/Scripts/python.exe" : ".venv312/bin/python");
}
// Konventionen aus dem claude-video-cutter-Repo (video-cut-uebergabe-Skill):
const SEGMENTS_REL = "segments_v5_repaired.json";
const QA_REL = "verify2/qa_stage_a.json";
const QA_FALLBACK_REL = "qa_stage_a.json";

/** QA-Datei: verify2-Konvention bevorzugt, Stage-A-Datei als Fallback
 * (Repair kann 0 Kanten ändern → manche Workdirs haben kein verify2/). */
function qaRelFor(workdir: string): string | null {
	if (existsSync(join(workdir, QA_REL))) return QA_REL;
	if (existsSync(join(workdir, QA_FALLBACK_REL))) return QA_FALLBACK_REL;
	return null;
}

/**
 * Debug-Log als Datei (<cutter>/cutter-plugin.log) — Obsidians DevTools-Konsole
 * ist von außen nicht lesbar; ohne File-Log bleiben Status-Fehler unsichtbar.
 * Gedrosselt auf max. 1 Zeile / 10s, wirft nie.
 */
let lastDebugLog = 0;
function logDebug(msg: string): void {
	try {
		const now = Date.now();
		if (now - lastDebugLog < 10_000) return;
		lastDebugLog = now;
		const d = cutterDir();
		if (d === null) return;
		appendFileSync(join(d, "cutter-plugin.log"), `${new Date().toISOString()} ${msg}\n`);
	} catch (_) {
		/* Logging darf nie stören */
	}
}

/**
 * Health-Check via NODE-http (nicht Obsidians requestUrl!). requestUrl läuft
 * über Chromiums Netzwerk-Stack und kann 127.0.0.1 unerreichbar melden,
 * obwohl der Server läuft — Node-http nimmt denselben Weg wie curl.
 */
function fetchState(timeoutMs = 4000): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = httpGet(
			{ host: "127.0.0.1", port: COCKPIT_PORT, path: "/api/state", timeout: timeoutMs },
			(res) => {
				let data = "";
				res.setEncoding("utf8");
				res.on("data", (c: string) => {
					data += c;
					if (data.length > 8_000_000) req.destroy(new Error("body too large"));
				});
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
			},
		);
		req.on("timeout", () => req.destroy(new Error("timeout")));
		req.on("error", reject);
	});
}

/**
 * Findet das claude-video-cutter-Repo des Users.
 * 1. Explizit: ~/.claude-video-cutter-path (eine Zeile, absoluter Pfad —
 *    schreibt die INSTALL-AGENTIC-OS.md bei der Einrichtung)
 * 2. Fallback: übliche Klon-Orte
 */
export function cutterDir(): string | null {
	const cfg = join(homedir(), ".claude-video-cutter-path");
	try {
		if (existsSync(cfg)) {
			const p = readFileSync(cfg, "utf-8").trim();
			if (p !== "" && existsSync(join(p, "scripts/cockpit_server.py"))) return p;
		}
	} catch (_) {
		/* weiter mit Fallbacks */
	}
	const candidates = [
		join(homedir(), "claude-video-cutter"),
		join(homedir(), "Documents/Projects/claude-video-cutter"),
		join(homedir(), "Documents/claude-video-cutter"),
	];
	for (const c of candidates) {
		if (existsSync(join(c, "scripts/cockpit_server.py"))) return c;
	}
	return null;
}

export interface CockpitStatus {
	running: boolean;
	workdir?: string;
}

export interface WorkdirEntry {
	name: string;
	path: string;
	ready: boolean;
	srcVideo?: string;
	mtimeMs: number;
}

export interface CockpitManifest {
	src_video: string;
	segments?: string;
	qa?: string;
	port?: number;
}

/**
 * Health-Check. requestUrl statt fetch: der Cockpit-Server sendet keine
 * CORS-Header, ein Renderer-fetch von app://obsidian.md würde geblockt.
 */
export async function cockpitStatus(): Promise<CockpitStatus> {
	try {
		const r = await fetchState();
		if (r.status !== 200) {
			logDebug(`cockpitStatus: HTTP ${r.status} von /api/state`);
			return { running: false };
		}
		let workdir: string | undefined;
		try {
			workdir = (JSON.parse(r.body) as { paths?: { workdir?: string } }).paths?.workdir;
		} catch (_) {
			/* running zählt, workdir ist optional */
		}
		return { running: true, workdir };
	} catch (e) {
		logDebug(`cockpitStatus: ${String(e)}`);
		return { running: false };
	}
}

/** Scannt <cutter>/work/* — ready = cockpit-fähig (segments+qa vorhanden). */
export function listWorkdirs(dir: string): WorkdirEntry[] {
	const base = join(dir, "work");
	try {
		return readdirSync(base)
			.filter((n) => !n.startsWith("."))
			.map((n): WorkdirEntry | null => {
				const p = join(base, n);
				try {
					const st = statSync(p);
					if (!st.isDirectory()) return null;
					const ready = existsSync(join(p, SEGMENTS_REL)) && qaRelFor(p) !== null;
					const mf = readManifest(p);
					return { name: n, path: p, ready, srcVideo: mf?.src_video, mtimeMs: st.mtimeMs };
				} catch (_) {
					return null;
				}
			})
			.filter((e): e is WorkdirEntry => e !== null)
			.sort((a, b) => b.mtimeMs - a.mtimeMs);
	} catch (_) {
		return [];
	}
}

/** cockpit.json pro Workdir — persistiert src_video für den 1-Klick-Start. */
export function readManifest(workdir: string): CockpitManifest | null {
	const f = join(workdir, "cockpit.json");
	if (!existsSync(f)) return null;
	try {
		return JSON.parse(readFileSync(f, "utf-8")) as CockpitManifest;
	} catch (_) {
		return null;
	}
}

export function writeManifest(workdir: string, m: CockpitManifest): void {
	writeFileSync(join(workdir, "cockpit.json"), JSON.stringify(m, null, 2), "utf-8");
}

/** Startet den Server detached (überlebt Obsidian). stdout/err → workdir/cockpit.log. */
export function startCockpit(dir: string, workdir: string, srcVideo: string): { ok: boolean; error?: string } {
	if (!IS_SUPPORTED) return { ok: false, error: "CUTTER-Tab läuft auf macOS und Windows — nutze sonst das Cockpit im Browser" };
	const venvPy = venvPython(dir);
	const server = join(dir, "scripts/cockpit_server.py");
	if (!existsSync(venvPy)) return { ok: false, error: "Python-venv fehlt (" + venvPy + ") — INSTALL.md ausführen" };
	if (!existsSync(server)) return { ok: false, error: "Server-Script fehlt: " + server };
	if (!existsSync(srcVideo)) return { ok: false, error: "Quell-Video nicht gefunden: " + srcVideo };
	try {
		const log = openSync(join(workdir, "cockpit.log"), "a");
		const qaRel = qaRelFor(workdir) ?? QA_REL;
		const child = spawn(
			venvPy,
			[server, workdir, join(workdir, SEGMENTS_REL), join(workdir, qaRel), String(COCKPIT_PORT), srcVideo],
			{ cwd: dir, detached: true, stdio: ["ignore", log, log] },
		);
		child.unref();
		return { ok: true };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
}

/** Killt den Prozess auf dem Cockpit-Port (macOS: lsof · Windows: PowerShell). */
export function stopCockpit(): void {
	try {
		if (IS_WIN) {
			execSync(
				`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${COCKPIT_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`,
				{ encoding: "utf-8" },
			);
		} else {
			// NUR den Listener killen — ohne -sTCP:LISTEN trifft lsof auch die
			// ESTABLISHED-Clients (Obsidians eigene iframe-Verbindung!) und der
			// Server überlebt als Zombie, der Neustarts blockiert.
			execSync(`lsof -ti :${COCKPIT_PORT} -sTCP:LISTEN | xargs kill`, { encoding: "utf-8" });
		}
	} catch (_) {
		/* lief nichts auf dem Port */
	}
}

/** Pollt /api/state bis der Server antwortet (braucht 1-3s: Peaks/Audio-Init). */
export async function waitForCockpit(timeoutMs = 20000): Promise<boolean> {
	const t0 = Date.now();
	while (Date.now() - t0 < timeoutMs) {
		const s = await cockpitStatus();
		if (s.running) return true;
		await new Promise<void>((r) => window.setTimeout(r, 500));
	}
	return false;
}

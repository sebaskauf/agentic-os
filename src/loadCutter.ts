import { spawn, execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, openSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { requestUrl } from "obsidian";

export const COCKPIT_PORT = 8766;
export const COCKPIT_URL = `http://127.0.0.1:${COCKPIT_PORT}/`;
// Der Server-Spawn/Kill nutzt macOS-Prozess-Tools (lsof, zsh) — auf anderen
// Plattformen zeigt der Tab einen Hinweis und verweist auf den Browser-Weg.
export const IS_MAC = platform() === "darwin";
// Konventionen aus dem claude-video-cutter-Repo (video-cut-uebergabe-Skill):
const SEGMENTS_REL = "segments_v5_repaired.json";
const QA_REL = "verify2/qa_stage_a.json";

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
		const res = await requestUrl({ url: COCKPIT_URL + "api/state", throw: false });
		if (res.status !== 200) return { running: false };
		const body = res.json as { paths?: { workdir?: string } } | undefined;
		return { running: true, workdir: body?.paths?.workdir };
	} catch (_) {
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
					const ready = existsSync(join(p, SEGMENTS_REL)) && existsSync(join(p, QA_REL));
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
	if (!IS_MAC) return { ok: false, error: "CUTTER-Tab ist aktuell macOS-only — nutze das Cockpit im Browser" };
	const venvPy = join(dir, ".venv312/bin/python");
	const server = join(dir, "scripts/cockpit_server.py");
	if (!existsSync(venvPy)) return { ok: false, error: "Python-venv fehlt (" + venvPy + ") — INSTALL.md ausführen" };
	if (!existsSync(server)) return { ok: false, error: "Server-Script fehlt: " + server };
	if (!existsSync(srcVideo)) return { ok: false, error: "Quell-Video nicht gefunden: " + srcVideo };
	try {
		const log = openSync(join(workdir, "cockpit.log"), "a");
		const child = spawn(
			venvPy,
			[server, workdir, join(workdir, SEGMENTS_REL), join(workdir, QA_REL), String(COCKPIT_PORT), srcVideo],
			{ cwd: dir, detached: true, stdio: ["ignore", log, log] },
		);
		child.unref();
		return { ok: true };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
}

/** Killt den Prozess auf dem Cockpit-Port (macOS/lsof). */
export function stopCockpit(): void {
	if (!IS_MAC) return;
	try {
		execSync(`lsof -ti :${COCKPIT_PORT} | xargs kill`, { encoding: "utf-8" });
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

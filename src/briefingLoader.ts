import { spawn } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { vaultRoot, resolveBinary, spawnEnv, isWin } from "./platform";

/**
 * Liest die taeglichen Briefings aus "<vault>/Briefings/" (ein git-Klon, in den ein
 * Cloud-Agent YYYY-MM-DD.md legt) und haelt sie per `git pull --ff-only` aktuell.
 * Rein lesend + non-blocking; jeder Fehler wird geschluckt (kein Briefing == kein Drama).
 */

const FOLDER = "Briefings";
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

export interface Briefing {
	date: string;     // "2026-06-04"
	file: string;     // "2026-06-04.md"
	content: string;  // roher Markdown-Inhalt
}

export interface BriefingData {
	latest: Briefing | null;  // neuestes Briefing (hoechstes Datum)
	older: Briefing[];        // restliche, absteigend sortiert (ohne latest)
}

function folderPath(): string {
	const root = vaultRoot();
	return root.length > 0 ? join(root, FOLDER) : "";
}

/**
 * Liest alle YYYY-MM-DD.md im Briefings-Ordner, absteigend sortiert (neuestes zuerst).
 * Robust gegen fehlenden Ordner: liefert dann { latest:null, older:[] }.
 */
export function loadBriefings(): BriefingData {
	const dir = folderPath();
	if (dir.length === 0 || !existsSync(dir)) return { latest: null, older: [] };
	try {
		const dated = readdirSync(dir)
			.map((name) => {
				const m = name.match(DATE_RE);
				return m !== null ? { date: m[1] ?? "", file: name } : null;
			})
			.filter((x): x is { date: string; file: string } => x !== null)
			.sort((a, b) => b.date.localeCompare(a.date)); // absteigend: neuestes zuerst

		const briefings: Briefing[] = [];
		for (const d of dated) {
			try {
				briefings.push({ date: d.date, file: d.file, content: readFileSync(join(dir, d.file), "utf-8") });
			} catch (_) { /* einzelne unlesbare Datei ueberspringen */ }
		}
		return { latest: briefings[0] ?? null, older: briefings.slice(1) };
	} catch (_) {
		return { latest: null, older: [] };
	}
}

/**
 * Liest den aktuellen HEAD-Commit-SHA direkt aus dem .git-Ordner (loose ref, sonst
 * packed-refs). Locale-unabhaengig — dient dem Vorher/Nachher-Vergleich beim Pull.
 */
function headCommit(dir: string): string {
	try {
		const headFile = join(dir, ".git", "HEAD");
		if (!existsSync(headFile)) return "";
		const head = readFileSync(headFile, "utf-8").trim();
		const m = head.match(/^ref:\s*(.+)$/);
		if (m === null) return head; // detached HEAD ist bereits ein SHA
		const ref = (m[1] ?? "").trim();
		const looseRef = join(dir, ".git", ref);
		if (existsSync(looseRef)) return readFileSync(looseRef, "utf-8").trim();
		const packed = join(dir, ".git", "packed-refs");
		if (existsSync(packed)) {
			for (const line of readFileSync(packed, "utf-8").split("\n")) {
				if (line.startsWith("#") || line.startsWith("^")) continue;
				const sp = line.indexOf(" ");
				if (sp > 0 && line.slice(sp + 1).trim() === ref) return line.slice(0, sp).trim();
			}
		}
		return "";
	} catch (_) { return ""; }
}

let pullInFlight = false;

/**
 * `git pull --ff-only` im Briefings-Ordner. Non-blocking, schluckt jeden Fehler,
 * reentrancy-geschuetzt (parallele Aufrufe werden ignoriert). Ruft cb(changed) auf:
 * changed=true, wenn der Pull den HEAD bewegt hat (also neue Commits/Briefings kamen).
 */
export function pullBriefings(cb: (changed: boolean) => void): void {
	if (pullInFlight) return;
	const dir = folderPath();
	if (dir.length === 0 || !existsSync(join(dir, ".git"))) return;

	pullInFlight = true;
	const git = resolveBinary("git") ?? (isWin ? "git.exe" : "git");
	const before = headCommit(dir);
	let settled = false;
	const finish = (changed: boolean): void => {
		if (settled) return;
		settled = true;
		pullInFlight = false;
		try { cb(changed); } catch (_) { /* ignore */ }
	};

	let child;
	try {
		child = spawn(git, ["pull", "--ff-only"], { cwd: dir, env: spawnEnv(), windowsHide: true });
	} catch (_) {
		finish(false);
		return;
	}

	const killTimer = setTimeout(() => {
		try { child.kill(); } catch (_) { /* */ }
		finish(false);
	}, 30000);

	// stdout/stderr leeren wir bewusst nur, um den Buffer nicht volllaufen zu lassen.
	child.stdout?.on("data", () => { /* ignore */ });
	child.stderr?.on("data", () => { /* Fehler ignorieren */ });
	child.on("error", () => { clearTimeout(killTimer); finish(false); });
	child.on("close", (code: number | null) => {
		clearTimeout(killTimer);
		const after = headCommit(dir);
		finish(code === 0 && after.length > 0 && after !== before);
	});
}

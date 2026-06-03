import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homeDir } from "./platform";

/**
 * Recent-Runs: loggt jeden ans Terminal gesendeten Skill/Command lokal. Echte,
 * generische Datenquelle (das Plugin kennt seine eigenen sendMessage-Calls) → macht
 * das Dashboard "lebendig" statt statisch. Liegt in ~/.agentic-os/activity.json.
 */

export interface ActivityEntry {
	at: string;     // ISO timestamp
	label: string;  // gesendeter Command/Skill (gekuerzt)
	target: string; // Tab-/Session-Name
}

const FILE = join(homeDir, ".agentic-os", "activity.json");
const CAP = 60;

function read(): ActivityEntry[] {
	try {
		if (!existsSync(FILE)) return [];
		const j = JSON.parse(readFileSync(FILE, "utf-8")) as unknown;
		return Array.isArray(j) ? (j as ActivityEntry[]) : [];
	} catch (_) { return []; }
}

/** Neuesten Eintrag vorne anstellen, auf CAP kappen. nowIso vom Caller. */
export function appendActivity(label: string, target: string, nowIso: string): void {
	try {
		const dir = join(homeDir, ".agentic-os");
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		const list = read();
		list.unshift({ at: nowIso, label: label.slice(0, 80), target });
		writeFileSync(FILE, JSON.stringify(list.slice(0, CAP), null, 2), "utf-8");
	} catch (_) { /* ignore */ }
}

/** Neueste zuerst. */
export function loadActivity(): ActivityEntry[] {
	return read();
}

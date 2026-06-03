import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface ChatTab {
	id: string;          // uuid, used as tmux session suffix
	name: string;        // display name
	type: "claude" | "agent";
	agentName?: string;  // if type=agent
	draft?: string;      // unsent textarea content
	// workspace = which cwd + add-dir to use when spawning claude.
	// "home" = neutral $HOME, no add-dir (claude default-tab behaviour).
	// "vault" = cwd auf den Obsidian-Vault des Users.
	// undefined = treat as "home" for backwards-compat with old chat-tabs.json
	workspace?: "home" | "vault";
	// If true, claude spawned with --dangerously-skip-permissions (YOLO/bypass mode).
	// Adds bypassPermissions to Shift+Tab cycle so user can toggle in/out.
	dangerous?: boolean;
	// Explizites Working-Directory für Projekt-Tabs (claude im Projekt-Ordner starten).
	// Wenn gesetzt, überschreibt es den workspace-abgeleiteten cwd in spawnSession.
	cwd?: string;
}

export interface ProjectEntry {
	name: string;
	path: string;
}

export interface TabsState {
	tabs: ChatTab[];
	activeId: string | null;
}

const TABS_FILE = join(homedir(), ".claude-cockpit/chat-tabs.json");

function ensureDir(): void {
	const dir = join(homedir(), ".claude-cockpit");
	if (!existsSync(dir)) {
		try { mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
	}
}

export function loadTabs(): TabsState {
	ensureDir();
	if (!existsSync(TABS_FILE)) {
		// Bootstrap default: 1 claude tab
		const defaultId = makeUUID();
		const initial: TabsState = {
			tabs: [{ id: defaultId, name: "claude", type: "claude", workspace: "home" }],
			activeId: defaultId,
		};
		saveTabs(initial);
		return initial;
	}
	try {
		const parsed = JSON.parse(readFileSync(TABS_FILE, "utf-8")) as TabsState;
		if (parsed.tabs.length === 0) {
			const defaultId = makeUUID();
			const initial: TabsState = {
				tabs: [{ id: defaultId, name: "claude", type: "claude", workspace: "home" }],
				activeId: defaultId,
			};
			saveTabs(initial);
			return initial;
		}
		return parsed;
	} catch (e) {
		console.error("[claude-cockpit] failed loading chat-tabs.json:", e);
		const defaultId = makeUUID();
		return {
			tabs: [{ id: defaultId, name: "claude", type: "claude", workspace: "home" }],
			activeId: defaultId,
		};
	}
}

export function saveTabs(state: TabsState): void {
	ensureDir();
	try {
		writeFileSync(TABS_FILE, JSON.stringify(state, null, 2), "utf-8");
	} catch (e) {
		console.error("[claude-cockpit] failed saving chat-tabs.json:", e);
	}
}

export function makeUUID(): string {
	const hex = (n: number): string => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
	return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

export function tabSessionName(tab: ChatTab): string {
	return `chat-${tab.id}`;
}

/**
 * Listet die Projektordner unter ~/Documents/Projects als auswählbare Targets
 * für den Picker (claude im jeweiligen Projekt-Ordner starten). Leer wenn der
 * Ordner nicht existiert — rein optional.
 */
export function loadProjects(): ProjectEntry[] {
	const base = join(homedir(), "Documents/Projects");
	try {
		const entries = readdirSync(base)
			.filter((n) => !n.startsWith("."))
			.map((n) => ({ name: n, path: join(base, n) }))
			.filter((p) => {
				try { return statSync(p.path).isDirectory(); } catch (_) { return false; }
			});
		entries.sort((a, b) => a.name.localeCompare(b.name));
		return entries;
	} catch (_) {
		return [];
	}
}

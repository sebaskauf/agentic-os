import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { vaultRoot } from "./platform";

export type LocalHandler =
	| "local-clear"
	| "local-help"
	| "local-usage"
	| "local-cost"
	| "local-model"
	| "local-effort"
	| "local-permissions"
	| "local-context"
	| "local-plugin";

export interface SlashCommand {
	name: string;          // "/clear" or "/superpowers:brainstorming"
	description: string;
	source: "builtin" | "user" | "plugin";
	pluginName?: string;
	pluginDir?: string;    // for plugin commands, where the plugin lives
	handler?: LocalHandler;
}

// Built-in Claude Code commands — these are NOT in filesystem, hardcoded.
// Source: Claude Code v2.1.150+ binary strings + official docs.
// Commands with handler: "local-*" are handled in Plugin UI without round-trip to claude.
const BUILTIN_COMMANDS: SlashCommand[] = [
	// Session management
	{ name: "/clear", description: "Neuen Chat starten (kill + respawn tmux session)", source: "builtin", handler: "local-clear" },
	{ name: "/compact", description: "Conversation komprimieren, weiter mit komprimiertem Context", source: "builtin" },
	{ name: "/resume", description: "Frühere Conversation laden", source: "builtin" },
	{ name: "/branch", description: "Conversation forken", source: "builtin" },
	{ name: "/rewind", description: "Rollback auf Checkpoint", source: "builtin" },
	{ name: "/teleport", description: "Web-Session ins Terminal pullen", source: "builtin" },
	{ name: "/remote-control", description: "Session von anderem Device fortsetzen", source: "builtin" },
	{ name: "/exit", description: "Session beenden", source: "builtin" },
	{ name: "/quit", description: "Session beenden", source: "builtin" },

	// Settings (UI in Plugin via local-handler)
	{ name: "/model", description: "Modell wechseln (Opus / Sonnet / Haiku)", source: "builtin", handler: "local-model" },
	{ name: "/effort", description: "Thinking-Effort umstellen (none/medium/high/xhigh/max)", source: "builtin", handler: "local-effort" },
	{ name: "/permissions", description: "Permission-Modus (default/auto/plan)", source: "builtin", handler: "local-permissions" },
	{ name: "/config", description: "Config anzeigen", source: "builtin" },
	{ name: "/fast", description: "Opus 4.6 Fast-Mode toggle", source: "builtin" },

	// Context + memory
	{ name: "/context", description: "Context-Window-Breakdown (Tokens by category)", source: "builtin", handler: "local-context" },
	{ name: "/memory", description: "Memory-Files editieren", source: "builtin" },
	{ name: "/memories", description: "Alle Memories anzeigen", source: "builtin" },
	{ name: "/init", description: "CLAUDE.md im Projekt anlegen", source: "builtin" },
	{ name: "/include", description: "File-Content inkludieren", source: "builtin" },

	// Tools + agents + plugins
	{ name: "/agents", description: "Liste aller Subagents", source: "builtin" },
	{ name: "/mcp", description: "MCP-Server-Status", source: "builtin" },
	{ name: "/hooks", description: "Hooks-Übersicht", source: "builtin" },
	{ name: "/plugin", description: "Plugin-Marketplace UI öffnen (Plugins+Skills+Install)", source: "builtin", handler: "local-plugin" },

	// Workflow
	{ name: "/batch", description: "Große Changes in Worktrees decomposen", source: "builtin" },
	{ name: "/loop", description: "In Schleife laufen", source: "builtin" },
	{ name: "/goal", description: "Session-Ziel setzen", source: "builtin" },
	{ name: "/diff", description: "Diff anzeigen", source: "builtin" },

	// Review + Quality
	{ name: "/review", description: "Read-only Code-Review", source: "builtin" },
	{ name: "/security-review", description: "Security-Review", source: "builtin" },
	{ name: "/code-review", description: "Code-Review (Diff-fokussiert)", source: "builtin" },

	// Debug + Help (mit local-handlers)
	{ name: "/help", description: "Alle Commands listen", source: "builtin", handler: "local-help" },
	{ name: "/usage", description: "Token-Verbrauch + Cost (5h-Window)", source: "builtin", handler: "local-usage" },
	{ name: "/cost", description: "Cost-Übersicht", source: "builtin", handler: "local-cost" },
	{ name: "/doctor", description: "Install-Diagnose", source: "builtin" },
	{ name: "/debug", description: "Debug-Modus", source: "builtin" },
	{ name: "/feedback", description: "Bug an Anthropic melden", source: "builtin" },

	// Auth
	{ name: "/login", description: "Anmelden", source: "builtin" },
	{ name: "/logout", description: "Abmelden", source: "builtin" },
];

function parseFrontmatter(text: string): Record<string, string> {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (m === null || m[1] === undefined) return {};
	const out: Record<string, string> = {};
	for (const line of m[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
		if (key.length > 0 && val.length > 0) out[key] = val;
	}
	return out;
}

function scanCommandsDir(dir: string, source: "user" | "plugin", pluginName?: string): SlashCommand[] {
	if (!existsSync(dir)) return [];
	const out: SlashCommand[] = [];
	try {
		const entries = readdirSync(dir);
		for (const f of entries) {
			const full = join(dir, f);
			if (!f.endsWith(".md")) {
				// might be a subfolder for namespacing
				try {
					if (statSync(full).isDirectory()) {
						const subCommands = scanCommandsDir(full, source, pluginName);
						out.push(...subCommands);
					}
				} catch (_) { /* ignore */ }
				continue;
			}
			try {
				const content = readFileSync(full, "utf-8");
				const fm = parseFrontmatter(content);
				const baseName = basename(f, ".md");
				let name = `/${baseName}`;
				if (pluginName !== undefined) {
					name = `/${pluginName}:${baseName}`;
				}
				out.push({
					name,
					description: fm.description ?? "",
					source,
					pluginName,
				});
			} catch (_) { /* ignore */ }
		}
	} catch (_) { /* ignore */ }
	return out;
}

export function loadCommands(): SlashCommand[] {
	const out: SlashCommand[] = [...BUILTIN_COMMANDS];

	// User commands
	const userDir = join(homedir(), ".claude/commands");
	out.push(...scanCommandsDir(userDir, "user"));

	// Project-local commands: der Vault des Users ist das "Projekt".
	const vault = vaultRoot();
	if (vault.length > 0) {
		out.push(...scanCommandsDir(join(vault, ".claude/commands"), "user"));
	}

	// Plugin commands — scan ~/.claude/plugins/cache/*/<plugin>/<version>/commands/
	const pluginsDir = join(homedir(), ".claude/plugins/cache");
	if (existsSync(pluginsDir)) {
		try {
			for (const marketplace of readdirSync(pluginsDir)) {
				const mp = join(pluginsDir, marketplace);
				if (!statSync(mp).isDirectory()) continue;
				for (const pluginName of readdirSync(mp)) {
					const pluginRoot = join(mp, pluginName);
					if (!statSync(pluginRoot).isDirectory()) continue;
					// Find newest version dir
					let versions: string[] = [];
					try {
						versions = readdirSync(pluginRoot).filter((v) => {
							try { return statSync(join(pluginRoot, v)).isDirectory(); } catch (_) { return false; }
						});
					} catch (_) { /* ignore */ }
					if (versions.length === 0) {
						// commands directly under plugin root?
						const cmdsDir = join(pluginRoot, "commands");
						if (existsSync(cmdsDir)) {
							out.push(...scanCommandsDir(cmdsDir, "plugin", pluginName));
						}
						continue;
					}
					versions.sort();
					const newest = versions[versions.length - 1] ?? "";
					const cmdsDir = join(pluginRoot, newest, "commands");
					if (existsSync(cmdsDir)) {
						out.push(...scanCommandsDir(cmdsDir, "plugin", pluginName));
					}
				}
			}
		} catch (_) { /* ignore */ }
	}

	// Dedup by name (last wins for same name)
	const dedup = new Map<string, SlashCommand>();
	for (const c of out) dedup.set(c.name, c);
	return Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
	if (!query.startsWith("/")) return [];
	// Filter by the FIRST word only so picker still shows `/model` while user types `/model sonnet`.
	const firstWord = query.split(/\s+/)[0] ?? query;
	const q = firstWord.slice(1).toLowerCase();
	if (q.length === 0) return commands;
	// Smart match: prefix-first, then substring
	const prefix: SlashCommand[] = [];
	const substr: SlashCommand[] = [];
	for (const c of commands) {
		const n = c.name.slice(1).toLowerCase();
		if (n.startsWith(q)) prefix.push(c);
		else if (n.includes(q)) substr.push(c);
	}
	return [...prefix, ...substr].slice(0, 30);
}

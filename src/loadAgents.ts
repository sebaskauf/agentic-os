import { readFileSync, readdirSync, existsSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AgentDef {
	name: string;
	description: string;
	color?: string;
	tools?: string;
	path: string;
}

/**
 * Reads ~/.claude/agents/*.md, parses YAML frontmatter into AgentDef[].
 * Skips gsd-* (internal GSD framework agents).
 */
export function loadAgents(): AgentDef[] {
	const dir = join(homedir(), ".claude/agents");
	if (!existsSync(dir)) return [];
	const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
	const out: AgentDef[] = [];
	for (const f of files) {
		if (f.startsWith("gsd-")) continue;
		const path = join(dir, f);
		try {
			const text = readFileSync(path, "utf-8");
			const fm = parseFrontmatter(text);
			if (fm.name !== undefined) {
				out.push({
					name: fm.name,
					description: fm.description ?? "",
					color: fm.color,
					tools: fm.tools,
					path,
				});
			}
		} catch (e) {
			console.error("[agentic-os] failed agent parse:", f, e);
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

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

/* ---------- Chat Persistence ---------- */

export interface ChatMessage {
	role: "user" | "assistant" | "system";
	text: string;
	at: string;
	pending?: boolean;
}

export interface ChatSessionState {
	agent: string;
	session_uuid: string;
	session_started: boolean;
	messages: ChatMessage[];
	created_at: string;
	updated_at: string;
}

const CHATS_DIR = join(homedir(), ".agentic-os/chats");

function ensureDir(): void {
	if (!existsSync(CHATS_DIR)) {
		try {
			require("fs").mkdirSync(CHATS_DIR, { recursive: true });
		} catch (_) {
			/* ignore */
		}
	}
}

export function loadChat(agentName: string): ChatSessionState | null {
	ensureDir();
	const path = join(CHATS_DIR, `${agentName}.json`);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as ChatSessionState;
	} catch (e) {
		console.error("[agentic-os] failed chat load:", agentName, e);
		return null;
	}
}

export function saveChat(state: ChatSessionState): void {
	ensureDir();
	const path = join(CHATS_DIR, `${state.agent}.json`);
	state.updated_at = new Date().toISOString();
	try {
		writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
	} catch (e) {
		console.error("[agentic-os] failed chat save:", state.agent, e);
	}
}

export function clearChat(agentName: string): ChatSessionState {
	ensureDir();
	const path = join(CHATS_DIR, `${agentName}.json`);
	if (existsSync(path)) {
		const ts = Math.floor(Date.now() / 1000);
		const archive = join(CHATS_DIR, `${agentName}.archive-${ts}.json`);
		try {
			renameSync(path, archive);
		} catch (_) {
			/* ignore */
		}
	}
	return {
		agent: agentName,
		session_uuid: makeUUID(),
		session_started: false,
		messages: [],
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};
}

export function makeUUID(): string {
	// RFC4122 v4
	const hex = (n: number): string => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
	return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

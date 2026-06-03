import { requestUrl } from "obsidian";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homeDir } from "./platform";

/**
 * Echter Research-Feed generisch via GitHub-Search-API (auth-frei, 60 req/h).
 * Holt frische/populaere Claude-Code-Skill+Agent-Repos. Gecacht in ~/.agentic-os/research.json,
 * refetch nur alle 6h (Rate-Limit-schonend). Ersetzt Sebastians fetch-research.py.
 */

export interface GHRepo {
	name: string;
	owner: string;
	url: string;
	description: string;
	stars: number;
	language: string;
	pushed_at: string;
}

export interface ResearchSection {
	id: string;
	title: string;
	items: GHRepo[];
}

export interface ResearchData {
	fetched_at: string;
	sections: ResearchSection[];
	error?: string;
}

const CACHE_FILE = join(homeDir, ".agentic-os", "research.json");
const REFRESH_MS = 2 * 60 * 60 * 1000; // 2h — frisch genug, schont GitHub-Rate-Limit

// stars:>N filtert die 0-Stern-Zufalls-Repos raus → Qualität statt Rauschen.
const QUERIES: Array<{ id: string; title: string; q: string; sort: "updated" | "stars" }> = [
	{ id: "fresh", title: "Frisch aktualisiert — Claude Code Ökosystem", q: "claude-code stars:>8", sort: "updated" },
	{ id: "skills", title: "Skills & Subagents", q: "claude skill OR claude subagent stars:>5", sort: "stars" },
	{ id: "popular", title: "Beliebt — Claude Tooling", q: "claude-code OR claude-agent stars:>30", sort: "stars" },
];

interface RawItem {
	name?: string;
	owner?: { login?: string };
	html_url?: string;
	description?: string | null;
	stargazers_count?: number;
	language?: string | null;
	pushed_at?: string;
}

function mapItem(it: RawItem): GHRepo {
	return {
		name: it.name ?? "?",
		owner: it.owner?.login ?? "?",
		url: it.html_url ?? "",
		description: it.description ?? "",
		stars: typeof it.stargazers_count === "number" ? it.stargazers_count : 0,
		language: it.language ?? "",
		pushed_at: it.pushed_at ?? "",
	};
}

function readCache(): ResearchData | null {
	try {
		if (!existsSync(CACHE_FILE)) return null;
		return JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as ResearchData;
	} catch (_) { return null; }
}

function writeCache(data: ResearchData): void {
	try {
		const dir = join(homeDir, ".agentic-os");
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
	} catch (_) { /* ignore */ }
}

async function searchRepos(q: string, sort: "updated" | "stars"): Promise<GHRepo[]> {
	const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=8`;
	const res = await requestUrl({
		url,
		method: "GET",
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "agentic-os-obsidian-plugin",
		},
		throw: false,
	});
	if (res.status !== 200) throw new Error(`GitHub ${res.status}`);
	const json = res.json as { items?: RawItem[] };
	const items = Array.isArray(json.items) ? json.items : [];
	return items.map(mapItem);
}

/**
 * Liefert den Research-Feed. nowIso/nowMs vom Caller (Plugin). force=true umgeht den Cache.
 * Bei Fehler: alter Cache (falls vorhanden) + error-Flag, sonst leere Sections.
 */
export async function loadResearch(nowIso: string, nowMs: number, force = false): Promise<ResearchData> {
	const cache = readCache();
	if (!force && cache !== null) {
		const age = nowMs - new Date(cache.fetched_at).getTime();
		if (isFinite(age) && age < REFRESH_MS && cache.sections.length > 0) return cache;
	}

	const sections: ResearchSection[] = [];
	let anyOk = false;
	for (const query of QUERIES) {
		try {
			const items = await searchRepos(query.q, query.sort);
			sections.push({ id: query.id, title: query.title, items });
			if (items.length > 0) anyOk = true;
		} catch (_) {
			sections.push({ id: query.id, title: query.title, items: [] });
		}
	}

	if (!anyOk && cache !== null) {
		return { ...cache, error: "GitHub nicht erreichbar — zeige Cache" };
	}
	const data: ResearchData = { fetched_at: nowIso, sections };
	if (anyOk) writeCache(data);
	return data;
}

/** Reiner Cache-Read (synchron) fuer instant-Render beim Mount. */
export function loadResearchCache(): ResearchData | null {
	return readCache();
}

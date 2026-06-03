import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface PluginInfo {
	id: string;
	name: string;
	marketplace: string;
	version?: string;
	description?: string;
	commands: number;
	skills: number;
	agents: number;
}

export interface SkillInfo {
	id: string;
	name: string;
	description?: string;
	source: "user" | "plugin";
	plugin?: string;
}

function readJson(p: string): unknown {
	try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
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

function countFilesIn(dir: string): number {
	if (!existsSync(dir)) return 0;
	try {
		return readdirSync(dir).filter((f) => f.endsWith(".md")).length;
	} catch { return 0; }
}

function countSubdirs(dir: string): number {
	if (!existsSync(dir)) return 0;
	try {
		return readdirSync(dir).filter((f) => {
			try { return statSync(join(dir, f)).isDirectory(); } catch { return false; }
		}).length;
	} catch { return 0; }
}

export function loadPlugins(): PluginInfo[] {
	const cacheDir = join(homedir(), ".claude/plugins/cache");
	if (!existsSync(cacheDir)) return [];
	const out: PluginInfo[] = [];
	try {
		for (const marketplace of readdirSync(cacheDir)) {
			const mp = join(cacheDir, marketplace);
			if (!statSync(mp).isDirectory()) continue;
			for (const pluginName of readdirSync(mp)) {
				const pluginRoot = join(mp, pluginName);
				let pluginDir = pluginRoot;
				try { if (!statSync(pluginRoot).isDirectory()) continue; } catch { continue; }
				let versions: string[] = [];
				try { versions = readdirSync(pluginRoot).filter((v) => { try { return statSync(join(pluginRoot, v)).isDirectory(); } catch { return false; } }); } catch { /* ignore */ }
				if (versions.length > 0) {
					versions.sort();
					pluginDir = join(pluginRoot, versions[versions.length - 1] ?? "");
				}
				const meta = readJson(join(pluginDir, ".claude-plugin/plugin.json")) as { name?: string; version?: string; description?: string } | null;
				out.push({
					id: `${marketplace}/${pluginName}`,
					name: meta?.name ?? pluginName,
					marketplace,
					version: meta?.version,
					description: meta?.description,
					commands: countFilesIn(join(pluginDir, "commands")),
					skills: countSubdirs(join(pluginDir, "skills")) + countFilesIn(join(pluginDir, "skills")),
					agents: countFilesIn(join(pluginDir, "agents")),
				});
			}
		}
	} catch (e) { console.error("[agentic-os] loadPlugins:", e); }
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadSkills(): SkillInfo[] {
	const out: SkillInfo[] = [];
	// User-installed
	const userDir = join(homedir(), ".claude/skills");
	if (existsSync(userDir)) {
		try {
			for (const entry of readdirSync(userDir)) {
				const full = join(userDir, entry);
				try {
					const st = statSync(full);
					if (st.isDirectory()) {
						const skillMd = join(full, "SKILL.md");
						if (existsSync(skillMd)) {
							const fm = parseFrontmatter(readFileSync(skillMd, "utf-8"));
							out.push({ id: entry, name: fm.name ?? entry, description: fm.description, source: "user" });
						} else {
							out.push({ id: entry, name: entry, source: "user" });
						}
					} else if (entry.endsWith(".md")) {
						const fm = parseFrontmatter(readFileSync(full, "utf-8"));
						const base = entry.slice(0, -3);
						out.push({ id: base, name: fm.name ?? base, description: fm.description, source: "user" });
					}
				} catch { /* ignore */ }
			}
		} catch { /* ignore */ }
	}
	// Plugin-bundled
	for (const p of loadPlugins()) {
		if (p.skills === 0) continue;
		const cacheDir = join(homedir(), ".claude/plugins/cache", p.id);
		// find versioned dir if any
		let skillsDir = join(cacheDir, "skills");
		if (!existsSync(skillsDir)) {
			try {
				const versions = readdirSync(cacheDir).filter((v) => { try { return statSync(join(cacheDir, v)).isDirectory(); } catch { return false; } });
				versions.sort();
				if (versions.length > 0) skillsDir = join(cacheDir, versions[versions.length - 1] ?? "", "skills");
			} catch { /* ignore */ }
		}
		if (!existsSync(skillsDir)) continue;
		try {
			for (const entry of readdirSync(skillsDir)) {
				const full = join(skillsDir, entry);
				try {
					const st = statSync(full);
					if (st.isDirectory()) {
						const skillMd = join(full, "SKILL.md");
						if (existsSync(skillMd)) {
							const fm = parseFrontmatter(readFileSync(skillMd, "utf-8"));
							out.push({ id: `${p.id}:${entry}`, name: fm.name ?? entry, description: fm.description, source: "plugin", plugin: p.name });
						}
					} else if (entry.endsWith(".md")) {
						const fm = parseFrontmatter(readFileSync(full, "utf-8"));
						const base = entry.slice(0, -3);
						out.push({ id: `${p.id}:${base}`, name: fm.name ?? base, description: fm.description, source: "plugin", plugin: p.name });
					}
				} catch { /* ignore */ }
			}
		} catch { /* ignore */ }
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

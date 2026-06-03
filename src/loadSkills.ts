import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/**
 * Scannt die echten Skills des Users unter ~/.claude/skills/ (Top-Level .md-Dateien
 * ODER Verzeichnisse). Echte, generische Quelle — fuer das Skill-Grid + echte Counts.
 */

export interface SkillDef {
	name: string;
	category: string;
}

// Leichte Heuristik-Kategorien aus dem Namen (Fallback "Skills").
const CATEGORY_RULES: Array<{ cat: string; re: RegExp }> = [
	{ cat: "Planning", re: /plan|briefing|woche|heute|todo|session-handoff|handoff/i },
	{ cat: "Research", re: /research|recherche|council|analyz|search/i },
	{ cat: "Content", re: /content|skript|script|b-?roll|broll|video|caption|insta|landing|lead-magnet|remotion|higgsfield|hyperframe/i },
	{ cat: "Mail & Ops", re: /mail|gmail|inbox|n8n|automation/i },
	{ cat: "Design & UI", re: /ui|ux|css|animation|gsap|lottie|tailwind|design|anime/i },
	{ cat: "Docs & Data", re: /pdf|docx|pptx|xlsx|sheet|data|supabase/i },
];

function categorize(name: string): string {
	for (const r of CATEGORY_RULES) if (r.re.test(name)) return r.cat;
	return "Skills";
}

function isSkillEntry(dir: string, entry: string): boolean {
	if (entry.startsWith(".") || entry.startsWith("_")) return false;
	const full = join(dir, entry);
	try {
		const st = statSync(full);
		if (st.isDirectory()) return true;          // Skill-Verzeichnis
		if (st.isFile() && entry.endsWith(".md")) return true; // Einzeldatei-Skill
	} catch (_) { /* ignore */ }
	return false;
}

export function loadSkills(): SkillDef[] {
	const dir = join(homedir(), ".claude", "skills");
	if (!existsSync(dir)) return [];
	try {
		const out: SkillDef[] = [];
		for (const entry of readdirSync(dir)) {
			if (!isSkillEntry(dir, entry)) continue;
			const name = entry.endsWith(".md") ? entry.slice(0, -3) : entry;
			out.push({ name, category: categorize(name) });
		}
		out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
		return out;
	} catch (_) {
		return [];
	}
}

import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { vaultRoot } from "./platform";

export interface FileEntry {
	path: string;       // absolute path
	relPath: string;    // relative to vault root
	name: string;       // basename
	mtime: number;
}

const SCAN_DEPTH = 5;
const MAX_FILES = 500;
const IGNORE_DIRS = new Set([
	"node_modules",
	".git",
	".obsidian",
	"dist",
	"build",
	"out",
	".trash",
	"__pycache__",
]);
const ALLOWED_EXT = new Set([".md", ".txt", ".json", ".tsx", ".ts", ".js", ".py", ".sh"]);

function scan(dir: string, depth: number, out: FileEntry[], root: string): void {
	if (depth > SCAN_DEPTH || out.length >= MAX_FILES) return;
	try {
		for (const entry of readdirSync(dir)) {
			if (out.length >= MAX_FILES) break;
			if (entry.startsWith(".") && entry !== ".obsidian") {
				// skip dotfiles except things we want
				continue;
			}
			if (IGNORE_DIRS.has(entry)) continue;
			const full = join(dir, entry);
			let st;
			try { st = statSync(full); } catch (_) { continue; }
			if (st.isDirectory()) {
				scan(full, depth + 1, out, root);
			} else if (st.isFile()) {
				const dotIdx = entry.lastIndexOf(".");
				const ext = dotIdx === -1 ? "" : entry.slice(dotIdx).toLowerCase();
				if (!ALLOWED_EXT.has(ext)) continue;
				out.push({
					path: full,
					relPath: relative(root, full),
					name: entry,
					mtime: st.mtimeMs,
				});
			}
		}
	} catch (_) { /* ignore */ }
}

export function loadFiles(): FileEntry[] {
	const out: FileEntry[] = [];
	const root = vaultRoot();
	if (root.length === 0) return out;
	scan(root, 0, out, root);
	// Sort by modification time descending (recent first)
	out.sort((a, b) => b.mtime - a.mtime);
	return out;
}

export function filterFiles(files: FileEntry[], query: string): FileEntry[] {
	if (!query.startsWith("@")) return [];
	const q = query.slice(1).toLowerCase();
	if (q.length === 0) return files.slice(0, 20);
	const prefix: FileEntry[] = [];
	const substr: FileEntry[] = [];
	for (const f of files) {
		const rp = f.relPath.toLowerCase();
		const nm = f.name.toLowerCase();
		if (nm.startsWith(q) || rp.startsWith(q)) prefix.push(f);
		else if (rp.includes(q)) substr.push(f);
	}
	return [...prefix, ...substr].slice(0, 25);
}

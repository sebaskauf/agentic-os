import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { vaultRoot } from "./platform";

/**
 * Daily-Tasks als ECHTE Vault-Markdown-Checkliste (Obsidian-nativ) statt Fake-Mock.
 * Liest/schreibt "<vault>/Agentic OS Tasks.md". Der User editiert die Datei direkt,
 * Toggles persistieren. Beim ersten Mal mit ein paar Beispiel-Tasks angelegt.
 */

export interface TaskItem {
	line: number;   // 0-basierter Zeilenindex in der Datei
	text: string;
	done: boolean;
}

const FILENAME = "Agentic OS Tasks.md";

const STARTER = `# Agentic OS — Tasks

Diese Liste ist eine echte Notiz in deinem Vault. Hak ab, editier sie, füg hinzu —
alles bleibt erhalten. Das Dashboard spiegelt nur diese Datei.

- [ ] Morgenbriefing-Skill mit eigenem Kontext einrichten
- [ ] Inbox checken (mails-pruefen)
- [ ] Tagesplan schreiben (heute-planen)
- [ ] Eine tiefe Recherche starten
- [ ] Session-Handoff vor Feierabend
`;

function filePath(): string {
	const root = vaultRoot();
	return root.length > 0 ? join(root, FILENAME) : "";
}

const TASK_RE = /^(\s*[-*]\s*\[)( |x|X)(\]\s+)(.*)$/;

/** Liest die Tasks. Legt die Datei mit Startern an, wenn sie fehlt. */
export function loadTasks(): TaskItem[] {
	const path = filePath();
	if (path.length === 0) return [];
	try {
		if (!existsSync(path)) {
			writeFileSync(path, STARTER, "utf-8");
		}
		const lines = readFileSync(path, "utf-8").split("\n");
		const out: TaskItem[] = [];
		lines.forEach((l, i) => {
			const m = l.match(TASK_RE);
			if (m !== null) {
				out.push({ line: i, text: (m[4] ?? "").trim(), done: (m[2] ?? " ").toLowerCase() === "x" });
			}
		});
		return out;
	} catch (_) { return []; }
}

/** Kippt den Checkbox-Zustand der gegebenen Zeile und schreibt zurueck. */
export function toggleTask(line: number): void {
	const path = filePath();
	if (path.length === 0) return;
	try {
		const lines = readFileSync(path, "utf-8").split("\n");
		const l = lines[line];
		if (l === undefined) return;
		const m = l.match(TASK_RE);
		if (m === null) return;
		const nowDone = (m[2] ?? " ").toLowerCase() === "x";
		lines[line] = `${m[1]}${nowDone ? " " : "x"}${m[3]}${m[4]}`;
		writeFileSync(path, lines.join("\n"), "utf-8");
	} catch (_) { /* ignore */ }
}

/** Absoluter Pfad der Tasks-Datei (fuer "in Obsidian oeffnen"-Hinweis). */
export function tasksFilePath(): string {
	return filePath();
}

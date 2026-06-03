/**
 * Plattform-agnostische Text-Parser fuer die claude-TUI-Ausgabe.
 * WORTWOERTLICH aus tmuxSession.ts verschoben (null Logikaenderung) —
 * reine String-Verarbeitung, keine tmux-/OS-Abhaengigkeit.
 *
 * Einziger Zusatz: stripAnsi() — der node-pty Ring-Buffer haelt rohe Bytes
 * inkl. ANSI; die Parser erwarten Klartext (wie tmux `capture-pane -p` ihn lieferte).
 */

/**
 * A content-block inside an assistant message.
 * Plugin renders text-blocks as markdown and tool-blocks as ToolCallCards.
 */
export type ContentBlock =
	| { type: "text"; text: string }
	| { type: "tool"; tool: string; summary: string; expandHint?: string; lines?: number };

export interface ParsedMessage {
	role: "user" | "assistant";
	text: string;            // kept for backwards-compat & user messages (always text)
	blocks?: ContentBlock[]; // structured assistant content (text + tool-calls)
}

export interface StatusInfo {
	model?: string;          // "Opus 4.7" / "Sonnet 4.6" / "Haiku 4.5"
	permissionMode?: string; // "auto" / "default" / "plan"
	contextPercent?: number; // 0-100, context-window usage
	effort?: string;         // "none" / "medium" / "high" / "xhigh" / "max"
	workspace?: string;      // current cwd basename
}

export interface ParsedChat {
	messages: ParsedMessage[];
	isThinking: boolean;
	thinkingLabel?: string;
	modalStuck?: boolean;     // claude TUI showing interactive modal expecting arrow-key input
	modalHint?: string;       // brief description of what claude wants
	status?: StatusInfo;      // parsed from TUI footer
}

// Matches collapsed tool-call result lines like:
//   "  Read 1 file (ctrl+o to expand)"
//   "  Updated 3 files"
//   "  Listed 1 directory (ctrl+o to expand)"
//   "  Ran 1 command"
//   "  Searched 2 patterns (ctrl+o to expand)"
//   "  Fetched 1 URL"
//   "  Wrote 2 files"
//   "  Edited 1 file"
//   "  Globbed 5 files"
//   "  Searched the web for ..."
const TOOL_LINE_RE = /^\s+(Read|Listed|Updated|Searched|Ran|Fetched|Wrote|Edited|Globbed|Grep(?:ped)?|WebSearch(?:ed)?|WebFetch(?:ed)?|Asked|Invoked|Used)\s+(.+?)(?:\s+\(ctrl\+o\s+to\s+expand\))?\s*$/;
// Match expanded tool-call header — claude shows during execution: "⏺ ToolName(args)"
const TOOL_EXPANDED_RE = /^\s*⏺\s+(\w+)\s*\(([^)]*)\)\s*$/;

// Patterns that indicate claude is stuck waiting for keyboard navigation in a modal
const MODAL_HINTS_RE = /(Use\s+↑[↓\/]|↑\/↓\s+to\s+navigate|press\s+Enter\s+to\s+select|y\/n|\(y\/N\)|Choose\s+an?\s+option|Select\s+\w+:|→\s+to\s+(use|select)|press\s+the\s+number)/i;

const SEPARATOR_RE = /^─+\s*$/;
const FOOTER_RE = /^\s*[⬆⏵]/;
// Match claude's spinner indicator regardless of which animated char is current.
// v2.1.150+ uses a wide range of unicode chars (✻ ✳ ✴ ✸ ✷ ✺ ✹ ❉ ❋ ❇ ❈ ✦ ✧ ✩ ✪ ★ ☆ ◆ ◇ etc.)
// PLUS braille spinner ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ PLUS ascii (+ * ● ·).
// Instead of hardcoding chars, we accept ANY leading non-word-character followed by
// a capitalized "Verbing…" word. This catches Sautéed, Tomfooling, Saturising etc.
// Content marker: a `\w+ing…` verb OR "running (stop) hook" OR token-counter.
const THINKING_RE = /^\s*[^A-Za-z0-9\s]{0,3}\s*([A-Z]\w+ing…|running\s+(stop\s+)?hook|↓\s+\d+\s+tokens?|↑\s+\d+\s+tokens?)/;
// Tool-progress emojis claude uses for tool-calls (also count as thinking-state)
// `u` flag REQUIRED — without it, JS regex treats surrogate pairs as individual code units
// and `[🔍📖...]` character class fails to match emoji.
const TOOL_PROGRESS_RE = /^\s*[🔍📖🌐⚡🔧🛠⏳⌛💾📝🔎]\s+\S/u;
// Match any past-tense or gerund verb followed by "for Ns" — covers all claude
// completion markers (Baked, Brewed, Worked, Crunched, Smooshed, Nebulized, Sautéed etc.)
// Same flexibility: any non-word leading symbol(s) + Verbed/Verbing + "for Ns".
const FINISHED_MARKER_RE = /^\s*[^A-Za-z0-9\s]{0,3}\s*[A-Z]\w+(ed|ing)\s+for\s+\d+s\b/;
const HOOK_NOISE_RE = /^(\s*View Observations Live|\s*Tip:|\s*Try\s+(refactor|\/|the|using|moving)|\s*Did\s+you\s+know|\s*Run\s+\/|\s*└|\s*\[|\s*🤖|\s*New\s+features?:|\s*Press\s+\?|\s*Use\s+\/|\s*\?\s+for\s+shortcuts)/i;
const USER_PROMPT_RE = /^\s*❯\s+(.+)$/;
const ASSISTANT_MARKER_RE = /^\s*⏺\s+(.*)$/;

// ANSI/VT-Sequenzen via fromCharCode konstruiert — keine rohen Steuerzeichen im Source.
// Kanonisches ansi-regex-Muster (ESC/CSI Start, BEL/Buchstaben-Ende). Reicht fuer claude-TUI.
const _ESC = String.fromCharCode(0x1b);   // ESC
const _CSI = String.fromCharCode(0x9b);   // 8-bit CSI
const _BEL = String.fromCharCode(0x07);   // BEL (OSC terminator)
// eslint-disable-next-line no-control-regex
const ANSI_RE = new RegExp(
	"[" + _ESC + _CSI + "][[\\]()#;?]*(?:" +
	"(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?" + _BEL + ")" +
	"|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
	"g",
);

/** Entfernt ANSI-Escape-Sequenzen aus rohem PTY-Output → Klartext fuer die Parser. */
export function stripAnsi(raw: string): string {
	// eslint-disable-next-line no-control-regex
	return raw.replace(ANSI_RE, "").replace(/\r/g, "");
}

/**
 * Strips trailing empty lines, the persistent footer (auto-mode line + separator),
 * AND the active prompt buffer (the box between two ─── separators that holds
 * what user is currently typing — "❯ <draft>"). That buffer is not a message.
 */
export function stripFooter(text: string): string {
	const lines = text.split("\n");
	while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") {
		lines.pop();
	}
	for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
		const line = lines[i] ?? "";
		if (line.match(/^─+\s*$/) !== null) {
			const next = lines[i + 1] ?? "";
			if (next.includes("⬆") || next.includes("auto mode") || next.includes("Opus") || next.includes("Sonnet")) {
				// Found bottom-of-footer separator. Now also strip the active prompt buffer:
				// i-1 (or back through empty lines) = "❯ <text>" or "❯ " (active draft)
				// i-2 = top separator of the prompt box
				let stripFromIdx = i;
				// Look backwards for top separator with at most one ❯-line between
				for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
					const lj = lines[j] ?? "";
					if (lj.trim() === "") continue;
					if (lj.match(/^❯/) !== null) {
						// continue searching for top separator above this
						for (let k = j - 1; k >= Math.max(0, j - 3); k--) {
							const lk = lines[k] ?? "";
							if (lk.trim() === "") continue;
							if (lk.match(/^─+\s*$/) !== null) {
								stripFromIdx = k; // strip from top separator
							}
							break;
						}
					}
					break;
				}
				return lines.slice(0, stripFromIdx).join("\n").trimEnd();
			}
		}
	}
	return lines.join("\n");
}

/**
 * Detects if claude is currently busy.
 *
 * The KEY insight: claude TUI redraws the spinner inplace AT A FIXED POSITION —
 * immediately above the separator-line that sits above the "❯ <draft>" input box.
 * Anywhere else in scrollback is HISTORICAL noise (old spinners, old tool-progress
 * markers) and must NOT trigger thinking.
 */
export function detectThinking(rawCapture: string): { isThinking: boolean; thinkingLabel?: string } {
	const lines = rawCapture.split("\n");
	const tail = lines.slice(-40);

	// Step 1: locate the "above-input separator" (last separator immediately followed by ❯-line)
	let inputSepIdx = -1;
	for (let i = tail.length - 1; i >= 0; i--) {
		const l = tail[i] ?? "";
		if (!SEPARATOR_RE.test(l)) continue;
		// Look at the next non-empty line below this separator
		for (let j = i + 1; j < tail.length; j++) {
			const next = (tail[j] ?? "").trim();
			if (next.length === 0) continue;
			if (next === "❯" || /^❯[\s ]/.test(next)) {
				inputSepIdx = i;
			}
			break;
		}
		if (inputSepIdx !== -1) break;
	}
	if (inputSepIdx === -1) return { isThinking: false };

	// Step 2: find first non-empty content line above the separator
	for (let i = inputSepIdx - 1; i >= 0; i--) {
		const l = tail[i] ?? "";
		const trimmed = l.trim();
		if (trimmed.length === 0) continue;
		if (HOOK_NOISE_RE.test(l)) continue; // skip "Tip:", "Press ?" etc that some claude versions inject

		// Step 3: spinner patterns → thinking
		if (THINKING_RE.test(l) && (l.includes("…") || /\brunning\b/i.test(l))) {
			const m = trimmed.match(/^[^A-Za-z]*([A-Za-zÀ-ÿ]+ing)/);
			return { isThinking: true, thinkingLabel: m !== null ? m[1] : undefined };
		}
		if (TOOL_PROGRESS_RE.test(l)) {
			return { isThinking: true, thinkingLabel: "Working" };
		}

		// Step 4: anything else → idle. This includes assistant content (⏺), finished
		// markers ("Worked for 5s"), bare text. They mean claude has stopped emitting tokens.
		return { isThinking: false };
	}
	return { isThinking: false };
}

/**
 * Parses status info from the bottom 2-3 footer lines.
 * Example footer (claude v2.1.150):
 *   ⬆ /gsd:update │ Opus 4.7 (1M context) │ agentic-os ░░░░░░░░░░ 5%
 *   ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
 */
export function parseStatusInfo(raw: string): StatusInfo {
	const allLines = raw.split("\n");
	const status: StatusInfo = {};
	let sawFooter = false;  // saw "⬆ ..." line — used to detect default mode (footer present but no mode-on line)

	// Scan ONLY the tail (~12 lines) for permissionMode — old "X mode on" lines
	// in scrollback shouldn't override the CURRENT footer state.
	const tail = allLines.slice(-12);
	for (const l of tail) {
		if (/^\s*⬆/.test(l)) sawFooter = true;
		if (/\baccept\s+edits\s+on\b/i.test(l)) {
			status.permissionMode = "acceptEdits";
		} else if (/\bplan\s+mode\s+on\b/i.test(l)) {
			status.permissionMode = "plan";
		} else if (/\bauto\s+mode\s+on\b/i.test(l)) {
			status.permissionMode = "auto";
		} else if (/\bbypass\s+(permissions|mode)\b/i.test(l)) {
			status.permissionMode = "bypass";
		}
	}

	// Scan all lines. LAST match wins — the most recent state is at the bottom of
	// the capture. claude TUI re-renders the welcome banner at every model/effort change,
	// so the LATEST banner in scrollback reflects current state. Plus we parse the
	// "Set model to X" / "Set effort level to Y" confirmation messages as authoritative.
	for (const l of allLines) {
		// Model — "Opus 4.7 (1M context)" / "Sonnet 4.6" / "Haiku 4.5"
		const mModel = l.match(/(Opus\s+\d+\.\d+(?:\s+\([^)]+\))?|Sonnet\s+\d+\.\d+(?:\s+\([^)]+\))?|Haiku\s+\d+\.\d+(?:\s+\([^)]+\))?)/);
		if (mModel !== null) status.model = mModel[1];

		// Authoritative model confirmation: "Set model to Sonnet 4.6 for this session"
		const mSetModel = l.match(/Set\s+model\s+to\s+([A-Za-z]+\s+\d+\.\d+(?:\s+\([^)]+\))?)/);
		if (mSetModel !== null) status.model = mSetModel[1];

		// Context-window percent — "░░░░░ 5%" or "▒▒▒▒▒ 23%"
		const mCtx = l.match(/[░▒▓█]+\s*(\d+)\s*%/);
		if (mCtx !== null && mCtx[1] !== undefined) status.contextPercent = parseInt(mCtx[1], 10);

		// Effort indicator in footer: "◐ medium · /effort" / "◉ xhigh" etc.
		// Char varies: ◐ ◉ ◑ ◒ ◓ ● ○ ⬤ depending on level/model.
		const mEff = l.match(/[◉●○◐◑◒◓⬤]\s+(none|minimal|medium|high|xhigh|max)\b/i);
		if (mEff !== null && mEff[1] !== undefined) status.effort = mEff[1].toLowerCase();

		// Banner form: "Sonnet 4.6 with medium effort · Claude Max"
		const mEffBanner = l.match(/\bwith\s+(none|minimal|medium|high|xhigh|max)\s+effort\b/i);
		if (mEffBanner !== null && mEffBanner[1] !== undefined) status.effort = mEffBanner[1].toLowerCase();

		// Banner abbreviated form: "Opus 4.7 (1M context) with xh…" (truncated)
		const mEffAbbr = l.match(/\bwith\s+(xh|hi|me|mi|ma|no)…/i);
		if (mEffAbbr !== null && mEffAbbr[1] !== undefined) {
			const abbrev: Record<string, string> = { xh: "xhigh", hi: "high", me: "medium", mi: "minimal", ma: "max", no: "none" };
			const v = abbrev[mEffAbbr[1].toLowerCase()];
			if (v !== undefined) status.effort = v;
		}

		// Authoritative effort confirmation: "Set effort level to max (this session only)"
		const mSetEff = l.match(/Set\s+effort\s+(?:level\s+)?to\s+(none|minimal|medium|high|xhigh|max)/i);
		if (mSetEff !== null && mSetEff[1] !== undefined) status.effort = mSetEff[1].toLowerCase();

		// Workspace name — "│ <name> " often after model in footer
		const mWs = l.match(/│\s+([A-Za-z0-9._-]+)\s+[░▒▓█]/);
		if (mWs !== null) status.workspace = mWs[1];
	}
	// If we saw the footer (⬆ line) but didn't find any mode-on indicator,
	// claude is in DEFAULT mode (which shows no mode-on hint).
	if (sawFooter && status.permissionMode === undefined) {
		status.permissionMode = "default";
	}
	return status;
}

/**
 * Parses the cleaned tmux/pty output into structured chat messages.
 * Recognizes user prompts (lines starting with ❯ <text>) and treats
 * everything until the next user prompt as assistant response.
 * (Name behaelt "parseTmuxChat" fuer Call-Site-Kompatibilitaet.)
 */
export function parseTmuxChat(raw: string): ParsedChat {
	// Thinking-detection on RAW output (footer cursor must be present for idle-state)
	const thinking = detectThinking(raw);
	// Strip footer + active prompt buffer BEFORE parsing messages, so the
	// "❯ <draft>" line between separators isn't mistaken for a user message
	const cleaned = stripFooter(raw);
	const lines = cleaned.split("\n");

	const userPromptIndices: number[] = [];
	lines.forEach((l, i) => {
		const m = l.match(USER_PROMPT_RE);
		if (m !== null) {
			const t = (m[1] ?? "").trim();
			if (
				t.length > 0 &&
				!t.startsWith("Press up") &&
				!t.toLowerCase().startsWith("for shortcuts")
			) {
				userPromptIndices.push(i);
			}
		}
	});

	const messages: ParsedMessage[] = [];

	for (let i = 0; i < userPromptIndices.length; i++) {
		const promptIdx = userPromptIndices[i] ?? 0;
		const nextIdx = userPromptIndices[i + 1] ?? lines.length;

		const promptLine = lines[promptIdx] ?? "";
		const userMatch = promptLine.match(USER_PROMPT_RE);
		const userText = userMatch !== null ? (userMatch[1] ?? "").trim() : "";
		if (userText.length > 0) {
			messages.push({ role: "user", text: userText });
		}

		const responseLines = lines.slice(promptIdx + 1, nextIdx);
		const { text: cleanedText, blocks } = cleanResponseToBlocks(responseLines);
		if (cleanedText.length > 0 || blocks.length > 0) {
			messages.push({ role: "assistant", text: cleanedText, blocks });
		}
	}

	// Detect modal-stuck: scan last 15 non-empty lines for hint patterns
	const tail = raw.split("\n").slice(-25).filter((l) => l.trim().length > 0);
	let modalStuck = false;
	let modalHint: string | undefined;
	for (const l of tail) {
		const m = l.match(MODAL_HINTS_RE);
		if (m !== null) {
			modalStuck = true;
			modalHint = (m[0] ?? "").trim();
			break;
		}
	}

	return {
		messages,
		isThinking: thinking.isThinking,
		thinkingLabel: thinking.thinkingLabel,
		modalStuck,
		modalHint,
		status: parseStatusInfo(raw),
	};
}

export function cleanResponseLines(lines: string[]): string {
	return cleanResponseToBlocks(lines).text;
}

/**
 * Cleans response lines AND extracts tool-call blocks.
 * Returns the plain text (for backwards compat) and a structured blocks array.
 * Text-blocks and tool-blocks appear in the order they occurred in the stream.
 */
export function cleanResponseToBlocks(lines: string[]): { text: string; blocks: ContentBlock[] } {
	const blocks: ContentBlock[] = [];
	let textBuffer: string[] = [];

	const flushText = (): void => {
		while (textBuffer.length > 0 && textBuffer[textBuffer.length - 1] === "") textBuffer.pop();
		while (textBuffer.length > 0 && textBuffer[0] === "") textBuffer.shift();
		if (textBuffer.length > 0) {
			blocks.push({ type: "text", text: textBuffer.join("\n") });
			textBuffer = [];
		}
	};

	for (const l of lines) {
		const trimmed = l.trim();
		if (trimmed.length === 0) {
			if (textBuffer.length > 0 && textBuffer[textBuffer.length - 1] !== "") textBuffer.push("");
			continue;
		}
		if (SEPARATOR_RE.test(l)) continue;
		if (FOOTER_RE.test(l)) continue;
		if (THINKING_RE.test(l)) continue;
		if (FINISHED_MARKER_RE.test(l)) continue;
		if (TOOL_PROGRESS_RE.test(l)) continue;
		if (HOOK_NOISE_RE.test(l)) continue;
		if (trimmed === "❯") continue;
		if (/^\s*[↓↑]\s+\d+\s+tokens?/i.test(l)) continue;

		// Tool-call patterns — both expanded and collapsed forms
		const expanded = l.match(TOOL_EXPANDED_RE);
		if (expanded !== null) {
			flushText();
			const tool = expanded[1] ?? "?";
			const args = (expanded[2] ?? "").trim();
			blocks.push({ type: "tool", tool, summary: args });
			continue;
		}
		const collapsed = l.match(TOOL_LINE_RE);
		if (collapsed !== null) {
			flushText();
			const tool = mapVerbToTool(collapsed[1] ?? "?");
			const summary = (collapsed[2] ?? "").trim();
			const hasExpand = /ctrl\+o\s+to\s+expand/.test(l);
			blocks.push({ type: "tool", tool, summary, expandHint: hasExpand ? "ctrl+o" : undefined });
			continue;
		}

		const am = l.match(ASSISTANT_MARKER_RE);
		if (am !== null) {
			const t = (am[1] ?? "").trim();
			if (t.length > 0) textBuffer.push(t);
			continue;
		}

		textBuffer.push(l.replace(/^\s+/, ""));
	}
	flushText();
	const text = blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n\n").trim();
	return { text, blocks };
}

/** Map past-tense verb in collapsed tool-line to canonical tool name. */
export function mapVerbToTool(verb: string): string {
	const v = verb.toLowerCase();
	if (v === "read") return "Read";
	if (v === "listed") return "Glob";
	if (v === "globbed") return "Glob";
	if (v === "updated" || v === "wrote" || v === "edited") return "Edit";
	if (v === "searched" || v === "grep" || v === "grepped") return "Grep";
	if (v === "ran") return "Bash";
	if (v === "fetched" || v === "webfetched" || v === "webfetch") return "WebFetch";
	if (v === "websearched" || v === "websearch") return "WebSearch";
	if (v === "asked") return "AskUserQuestion";
	if (v === "invoked" || v === "used") return "Skill";
	return verb;
}

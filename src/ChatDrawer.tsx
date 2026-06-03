import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { type ChatTab, type TabsState, type ProjectEntry, loadTabs, saveTabs, makeUUID, tabSessionName, loadProjects } from "./loadChatTabs";
import { spawnSession, sessionExists, sendMessage, sendKey, getPlainBuffer, killSession, parseTmuxChat, type ParsedMessage, type StatusInfo } from "./ptySession";
import { loadAgents, type AgentDef } from "./loadAgents";
import { loadCommands, type SlashCommand } from "./loadCommands";
import { CommandPicker } from "./CommandPicker";
import { loadFiles, type FileEntry } from "./loadFiles";
import { FilePicker } from "./FilePicker";
import { renderMarkdown } from "./renderMarkdown";
import { StatusBar } from "./StatusBar";
import { XtermPane } from "./XtermPane";
import { SelectModal, type SelectOption } from "./SelectModal";
import { PluginMarketplaceModal } from "./PluginMarketplaceModal";
import { Icons } from "./icons";

// Duenner Wrapper auf ptySession.sendKey (named keys → Byte-Sequenzen).
// Behaelt den lokalen Namen, damit die ~15 Aufrufstellen unveraendert bleiben.
function sendKeystroke(sessionName: string, key: string): void {
	sendKey(sessionName, key);
}

/**
 * Sends a slash-command + arg to claude. Claude TUI sometimes opens a confirm-dialog
 * ("Do you really want to change?"). We auto-confirm by sending Enter after a short delay.
 * The confirm dialog's default button is "Yes" so blind Enter works.
 */
function sendCommandWithAutoConfirm(sessionName: string, cmd: string): void {
	const r = sendMessage(sessionName, cmd);
	if (!r.ok) {
		console.error("[claude-cockpit] sendCommandWithAutoConfirm failed:", r.error);
		return;
	}
	// Auto-Enter the confirm dialog. Two delays in case claude is slow rendering.
	window.setTimeout(() => sendKey(sessionName, "Enter"), 900);
	window.setTimeout(() => sendKey(sessionName, "Enter"), 1800);
}

/**
 * Switch permission mode by sending Shift+Tab N times to cycle to target.
 * Empirically verified cycle order for claude v2.1.150+ with auto-mode access:
 *   auto → default → acceptEdits → plan → auto
 * For accounts without auto (cycle of 3): default → acceptEdits → plan → default.
 * The 4-mode index works for both: target=acceptEdits is +1 from default in both cycles,
 * target=plan is +2 in both.
 */
const PERMISSION_CYCLE = ["auto", "default", "acceptEdits", "plan"];

function applyPermissionMode(sessionName: string, target: string, current?: string): void {
	const currentMode = current === undefined || current === "" || current === "?" ? "default" : current;
	if (currentMode === target) return;  // already there
	const currentIdx = PERMISSION_CYCLE.indexOf(currentMode);
	const targetIdx = PERMISSION_CYCLE.indexOf(target);
	if (currentIdx === -1 || targetIdx === -1) {
		console.warn("[claude-cockpit] unknown permission mode:", { currentMode, target });
		return;
	}
	const steps = (targetIdx - currentIdx + PERMISSION_CYCLE.length) % PERMISSION_CYCLE.length;
	for (let i = 0; i < steps; i++) {
		// Stagger BTabs so claude can process each one cleanly
		window.setTimeout(() => sendKeystroke(sessionName, "BTab"), i * 250);
	}
}

const DRAWER_HEIGHT_KEY = "claude-cockpit-drawer-height";
const DEFAULT_HEIGHT = 340;
const MIN_HEIGHT = 320;  // below this, xterm visible-area becomes too small for content to be readable
const DRAWER_COLLAPSED_KEY = "claude-cockpit-drawer-collapsed";
const MAX_HEIGHT_RATIO = 0.85;
const POLL_MS = 250;
const MAX_TABS = 7;

function getInitialHeight(): number {
	try {
		const stored = window.localStorage.getItem(DRAWER_HEIGHT_KEY);
		if (stored !== null) {
			const n = parseInt(stored, 10);
			if (!isNaN(n) && n >= MIN_HEIGHT) return n;
		}
	} catch (_) { /* ignore */ }
	return DEFAULT_HEIGHT;
}

interface ChatPaneProps {
	tab: ChatTab;
	onDraftChange: (draft: string) => void;
	onTabPatch: (patch: Partial<ChatTab>) => void;
	commands: SlashCommand[];
	files: FileEntry[];
}

export function ChatPane({ tab, onDraftChange, onTabPatch, commands, files }: ChatPaneProps): JSX.Element {
	const sessionName = tabSessionName(tab);
	const [messages, setMessages] = useState<ParsedMessage[]>([]);
	const [isThinking, setIsThinking] = useState<boolean>(false);
	const [thinkingLabel, setThinkingLabel] = useState<string | undefined>(undefined);
	const [modalStuck, setModalStuck] = useState<boolean>(false);
	const [modalHint, setModalHint] = useState<string | undefined>(undefined);
	// Status accumulates last-wins per key — TUI footer doesn't always show effort,
	// startup banner does. Merge across captures.
	const [status, setStatus] = useState<StatusInfo>({});
	const [input, setInput] = useState<string>(tab.draft ?? "");
	// Increments on /clear — used as part of XtermPane key to force fresh remount + reset.
	const [xtermResetKey, setXtermResetKey] = useState<number>(0);
	const [sessionReady, setSessionReady] = useState<boolean>(false);
	const [spawnError, setSpawnError] = useState<string | null>(null);
	const [showHelp, setShowHelp] = useState<boolean>(false);
	const [showUsage, setShowUsage] = useState<boolean>(false);
	const [showModelPicker, setShowModelPicker] = useState<boolean>(false);
	const [showEffortPicker, setShowEffortPicker] = useState<boolean>(false);
	const [showPermissionPicker, setShowPermissionPicker] = useState<boolean>(false);
	const [showContextModal, setShowContextModal] = useState<boolean>(false);
	const [showPluginModal, setShowPluginModal] = useState<boolean>(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const lastCaptureRef = useRef<string>("");
	const lastThinkingDetectedRef = useRef<number>(0);
	// 8s hysteresis — claude tool-call cycles + post-turn duration messages can
	// take longer than 5s between thinking-line renders. Plus claude amber-warming
	// after 10s. Bumping to 8s eliminates flicker on agents during long thinks.
	const THINKING_HOLD_MS = 8000;

	// Slash-command picker is open when input starts with "/"
	const showPicker = input.startsWith("/") && !input.includes("\n");
	// File picker: detect "@<query>" at end of input
	const fileMentionMatch = input.match(/@([\w\-./]*)$/);
	const showFilePicker = fileMentionMatch !== null && !showPicker;
	const fileQuery = fileMentionMatch !== null ? "@" + (fileMentionMatch[1] ?? "") : "";

	// Input history (Up/Down navigation through prior user messages)
	const historyRef = useRef<string[]>([]);
	const historyIdxRef = useRef<number>(-1);  // -1 = not navigating

	// Spawn or attach to tmux session on mount
	useEffect(() => {
		const exists = sessionExists(sessionName);
		if (!exists) {
			const result = spawnSession({
				sessionName,
				agentName: tab.type === "agent" ? tab.agentName : undefined,
				workspace: tab.workspace,
				cwd: tab.cwd,
				dangerous: tab.dangerous,
			});
			if (!result.ok) {
				setSpawnError(result.error ?? "unknown spawn error");
				return;
			}
		}
		const pollInterval = window.setInterval(() => {
			const raw = getPlainBuffer(sessionName);
			if (raw.length === 0) return;
			if (raw === lastCaptureRef.current) return;
			lastCaptureRef.current = raw;

			const parsed = parseTmuxChat(raw);
			setModalStuck(parsed.modalStuck ?? false);
			setModalHint(parsed.modalHint);
			if (parsed.status !== undefined) {
				setStatus((prev) => {
					// Merge: new keys win, but undefined doesn't clobber existing values
					const next: StatusInfo = { ...prev };
					for (const k of Object.keys(parsed.status!) as (keyof StatusInfo)[]) {
						const v = parsed.status![k];
						if (v !== undefined) (next as any)[k] = v;
					}
					return next;
				});
			}

			// APPEND-ONLY: never shrink message history. Claude's TUI may briefly
			// hide/redraw a message during streaming — we must not lose it.
			setMessages((prev) => {
				if (parsed.messages.length < prev.length) return prev; // ignore shrink
				if (
					prev.length === parsed.messages.length &&
					prev.every((m, i) => m.role === parsed.messages[i]?.role && m.text === parsed.messages[i]?.text)
				) return prev; // no change
				return parsed.messages;
			});

			// STICKY thinking: turn on instantly, only turn off after THINKING_HOLD_MS
			// of no detection (claude's animated spinner-char regex matches/unmatches per frame)
			const now = Date.now();
			if (parsed.isThinking) {
				lastThinkingDetectedRef.current = now;
				setIsThinking(true);
				if (parsed.thinkingLabel !== undefined) setThinkingLabel(parsed.thinkingLabel);
			} else {
				const sinceLastDetected = now - lastThinkingDetectedRef.current;
				if (sinceLastDetected > THINKING_HOLD_MS) {
					setIsThinking(false);
					setThinkingLabel(undefined);
				}
				// otherwise: keep current isThinking state (sticky)
			}

			if (parsed.messages.length > 0 || raw.includes("❯")) {
				setSessionReady(true);
			}
		}, POLL_MS);

		return () => {
			window.clearInterval(pollInterval);
		};
	}, [sessionName]);

	// Track whether user manually scrolled up (don't yank them back)
	const userScrolledUpRef = useRef<boolean>(false);
	const lastMsgTextRef = useRef<string>("");

	// Detect user manual scroll-up
	useEffect(() => {
		const el = scrollRef.current;
		if (el === null) return;
		const onScroll = (): void => {
			const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
			// If user is more than 200px from bottom, they manually scrolled up
			userScrolledUpRef.current = distFromBottom > 200;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	// Auto-scroll to bottom on new content (unless user scrolled up)
	useEffect(() => {
		const el = scrollRef.current;
		if (el === null) return;
		const lastText = messages.length > 0 ? (messages[messages.length - 1]?.text ?? "") : "";
		// Only scroll if last-msg-text grew/changed AND user is not scrolled up
		if (lastText === lastMsgTextRef.current && !isThinking) return;
		lastMsgTextRef.current = lastText;
		if (userScrolledUpRef.current) return;
		// Use rAF to let DOM update first
		requestAnimationFrame(() => {
			if (scrollRef.current !== null) {
				scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
			}
		});
	}, [messages, isThinking]);

	// Sync draft on unmount
	useEffect(() => {
		return () => {
			onDraftChange(input);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Handle local commands (no claude round-trip). Returns true if handled.
	const tryLocalCommand = useCallback((text: string): boolean => {
		const cmd = commands.find((c) => c.name === text.split(/\s+/)[0]);
		if (cmd === undefined || cmd.handler === undefined) return false;
		switch (cmd.handler) {
			case "local-clear":
				// Kill + respawn tmux session, reset state
				killSession(sessionName);
				lastCaptureRef.current = "";
				setMessages([]);
				setIsThinking(false);
				setThinkingLabel(undefined);
				setSessionReady(false);
				setXtermResetKey((k) => k + 1);  // force XtermPane remount → fresh terminal
				// Respawn after a tick
				setTimeout(() => {
					spawnSession({
						sessionName,
						agentName: tab.type === "agent" ? tab.agentName : undefined,
						workspace: tab.workspace,
						dangerous: tab.dangerous,
					});
				}, 80);
				return true;
			case "local-help":
				setShowHelp(true);
				return true;
			case "local-usage":
			case "local-cost":
				setShowUsage(true);
				return true;
			case "local-model":
				setShowModelPicker(true);
				return true;
			case "local-effort":
				setShowEffortPicker(true);
				return true;
			case "local-permissions":
				setShowPermissionPicker(true);
				return true;
			case "local-context":
				setShowContextModal(true);
				return true;
			case "local-plugin":
				setShowPluginModal(true);
				return true;
			default:
				return false;
		}
	}, [commands, sessionName, tab]);

	const send = useCallback((): void => {
		const text = input.trim();
		if (text.length === 0) return;
		// Local command handlers
		if (tryLocalCommand(text)) {
			setInput("");
			onDraftChange("");
			return;
		}
		const result = sendMessage(sessionName, text);
		if (!result.ok) {
			console.error("[claude-cockpit] send failed:", result.error);
			alert(`Send fehlgeschlagen: ${result.error ?? "unknown"}`);
			return;
		}
		setInput("");
		onDraftChange("");
	}, [input, sessionName, onDraftChange, tryLocalCommand]);

	// Pick command from picker. If it has a local handler, execute IMMEDIATELY.
	// Otherwise paste into input so user can add args.
	const handlePickCommand = useCallback((cmd: SlashCommand): void => {
		if (cmd.handler !== undefined && tryLocalCommand(cmd.name)) {
			setInput("");
			onDraftChange("");
			return;
		}
		setInput(cmd.name + " ");
		onDraftChange(cmd.name + " ");
		setTimeout(() => inputRef.current?.focus(), 10);
	}, [tryLocalCommand, onDraftChange]);

	const closePicker = useCallback((): void => {
		// Just remove the leading slash so picker hides
		setInput("");
		onDraftChange("");
	}, [onDraftChange]);

	// User explicitly wants to send the current /slash-text as-is (even though no match shown).
	// Still try local handler first — picker may have failed match due to trailing space etc.
	const sendRawFromPicker = useCallback((): void => {
		const text = input.trim();
		if (text.length === 0) return;
		if (tryLocalCommand(text)) {
			setInput("");
			onDraftChange("");
			return;
		}
		const result = sendMessage(sessionName, text);
		if (!result.ok) {
			console.error("[claude-cockpit] sendRaw failed:", result.error);
			return;
		}
		setInput("");
		onDraftChange("");
	}, [input, sessionName, onDraftChange, tryLocalCommand]);

	// STOP button: interrupt currently running claude
	const handleStop = useCallback((): void => {
		sendKeystroke(sessionName, "C-c");
	}, [sessionName]);

	// Status-bar click → send slash-command to claude (pass-through, claude shows its picker)
	const sendSlashCommand = useCallback((cmd: string): void => {
		const result = sendMessage(sessionName, cmd);
		if (!result.ok) console.error("[claude-cockpit] slash-command failed:", result.error);
	}, [sessionName]);

	// Global keyboard handler — intercept ESC so Obsidian doesn't catch it (would open Graph View etc.).
	// Forward ESC to claude tmux. Plus when a claude TUI modal is stuck-waiting, forward arrow keys + Enter.
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			const target = e.target as HTMLElement | null;
			// Only intercept when keypress is within our plugin's view
			if (target === null || target.closest === undefined || target.closest(".claude-cockpit-root") === null) return;

			// ESC always goes to claude (so user can close any TUI modal). Stop Obsidian.
			if (e.key === "Escape") {
				// Don't intercept if any of our React modals is open — they handle their own ESC
				const anyModalOpen = showHelp || showUsage || showModelPicker || showEffortPicker
					|| showPermissionPicker || showContextModal || showPluginModal;
				if (anyModalOpen) return;
				e.preventDefault();
				e.stopPropagation();
				sendKeystroke(sessionName, "Escape");
				sendKeystroke(sessionName, "Escape");
				return;
			}

			// When claude TUI modal is stuck-waiting, forward arrows + Enter from any focused element
			if (modalStuck) {
				// If textarea is focused but input is empty (no draft to preserve), forward navigation keys
				const tag = target.tagName.toLowerCase();
				const isTextInput = tag === "textarea" || tag === "input";
				const ourPickerOpen = showPicker || showFilePicker;
				if (!ourPickerOpen && (!isTextInput || (target as HTMLTextAreaElement).value === "")) {
					if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
						e.preventDefault();
						e.stopPropagation();
						const map: Record<string, string> = { ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };
						const k = map[e.key];
						if (k !== undefined) sendKeystroke(sessionName, k);
						return;
					}
					if (e.key === "Enter") {
						e.preventDefault();
						e.stopPropagation();
						sendKeystroke(sessionName, "Enter");
						return;
					}
				}
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [sessionName, modalStuck, showPicker, showFilePicker, showHelp, showUsage, showModelPicker, showEffortPicker, showPermissionPicker, showContextModal, showPluginModal]);

	// ESC button: send Escape (closes modals / pickers / cancels)
	const handleEsc = useCallback((): void => {
		sendKeystroke(sessionName, "Escape");
		sendKeystroke(sessionName, "Escape");
	}, [sessionName]);

	// Sync history from messages on update (user messages only)
	useEffect(() => {
		historyRef.current = messages.filter((m) => m.role === "user").map((m) => m.text);
	}, [messages]);

	const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		// When pickers open, let them own keys
		if (showPicker || showFilePicker) {
			if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
			return;
		}
		// Input history nav: Up/Down arrows on empty/single-line input
		if (e.key === "ArrowUp" && !e.shiftKey && !input.includes("\n")) {
			const h = historyRef.current;
			if (h.length > 0) {
				e.preventDefault();
				const next = historyIdxRef.current === -1 ? h.length - 1 : Math.max(0, historyIdxRef.current - 1);
				historyIdxRef.current = next;
				const txt = h[next] ?? "";
				setInput(txt);
				onDraftChange(txt);
				return;
			}
		}
		if (e.key === "ArrowDown" && !e.shiftKey && historyIdxRef.current !== -1) {
			const h = historyRef.current;
			e.preventDefault();
			const next = historyIdxRef.current + 1;
			if (next >= h.length) {
				historyIdxRef.current = -1;
				setInput("");
				onDraftChange("");
			} else {
				historyIdxRef.current = next;
				const txt = h[next] ?? "";
				setInput(txt);
				onDraftChange(txt);
			}
			return;
		}
		// Any typing resets history pointer
		if (e.key.length === 1 || e.key === "Backspace") {
			historyIdxRef.current = -1;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	};

	// Image paste handler — Cmd+V with image in clipboard. Saves to /tmp and @-mentions path.
	const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
		const items = e.clipboardData?.items;
		if (items === undefined) return;
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item === undefined) continue;
			if (item.kind === "file" && item.type.startsWith("image/")) {
				e.preventDefault();
				const file = item.getAsFile();
				if (file === null) continue;
				const ext = item.type.split("/")[1] ?? "png";
				const reader = new FileReader();
				reader.onload = (): void => {
					try {
						const dir = join(tmpdir(), "claude-cockpit-paste");
						if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
						const filename = `paste-${Date.now()}.${ext}`;
						const fullpath = join(dir, filename);
						const result = reader.result;
						if (result instanceof ArrayBuffer) {
							writeFileSync(fullpath, Buffer.from(result));
							const newInput = input + " @" + fullpath + " ";
							setInput(newInput);
							onDraftChange(newInput);
						}
					} catch (err) {
						console.error("[claude-cockpit] paste-image failed:", err);
					}
				};
				reader.readAsArrayBuffer(file);
				return;
			}
		}
	}, [input, onDraftChange]);

	// File drag-drop handler — drop file from Finder → @-mention path
	const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>): void => {
		const files = e.dataTransfer?.files;
		if (files === undefined || files.length === 0) return;
		e.preventDefault();
		const paths: string[] = [];
		for (let i = 0; i < files.length; i++) {
			const f = files[i];
			if (f === undefined) continue;
			// Electron exposes path on File via non-standard property
			const p = (f as File & { path?: string }).path;
			if (typeof p === "string" && p.length > 0) paths.push(p);
		}
		if (paths.length === 0) return;
		const mentions = paths.map((p) => "@" + p).join(" ");
		const newInput = input.length === 0 ? mentions + " " : input + " " + mentions + " ";
		setInput(newInput);
		onDraftChange(newInput);
	}, [input, onDraftChange]);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>): void => {
		e.preventDefault(); // prevent browser default (file open)
	}, []);

	const handlePickFile = useCallback((f: FileEntry): void => {
		// Replace the partial @<query> with the full @relPath
		const newInput = input.replace(/@([\w\-./]*)$/, "@" + f.relPath + " ");
		setInput(newInput);
		onDraftChange(newInput);
		setTimeout(() => inputRef.current?.focus(), 10);
	}, [input, onDraftChange]);

	const closeFilePicker = useCallback((): void => {
		// Strip the trailing @<query>
		const newInput = input.replace(/@([\w\-./]*)$/, "");
		setInput(newInput);
		onDraftChange(newInput);
	}, [input, onDraftChange]);

	return (
		<div className="chat-pane">
			{spawnError !== null ? (
				<div className="chat-bubble system" style={{ margin: 16 }}>
					<div className="bubble-meta">
						<span className="mono small-caps" style={{ letterSpacing: ".18em", fontSize: 9.5 }}>FEHLER</span>
					</div>
					<div className="bubble-text">⚠️ Terminal-Spawn fehlgeschlagen: {spawnError}</div>
				</div>
			) : (
				<XtermPane key={`${sessionName}-${xtermResetKey}`} sessionName={sessionName} ready={sessionReady} />
			)}
			<StatusBar
				status={status}
				sessionName={sessionName}
				onSlashCommand={sendSlashCommand}
				workspace={tab.workspace}
				agentName={tab.type === "agent" ? tab.agentName : undefined}
				onOpenPlugins={() => setShowPluginModal(true)}
				onOpenModel={() => setShowModelPicker(true)}
				onOpenEffort={() => setShowEffortPicker(true)}
				onOpenPermissions={() => setShowPermissionPicker(true)}
				onOpenContext={() => setShowContextModal(true)}
				onOpenHelp={() => setShowHelp(true)}
			/>
			{modalStuck && (
				<div className="modal-stuck-banner">
					<div className="modal-stuck-info">
						<span className="modal-stuck-label">⚠ CLAUDE WARTET AUF NAVIGATION</span>
						{modalHint !== undefined && <span className="modal-stuck-hint">{modalHint}</span>}
					</div>
					<div className="modal-stuck-actions">
						<button title="↑" onClick={() => sendKeystroke(sessionName, "Up")}>↑</button>
						<button title="↓" onClick={() => sendKeystroke(sessionName, "Down")}>↓</button>
						<button title="Enter" onClick={() => sendKeystroke(sessionName, "Enter")}>↵</button>
						<button title="y" onClick={() => sendKeystroke(sessionName, "y")}>y</button>
						<button title="n" onClick={() => sendKeystroke(sessionName, "n")}>n</button>
						<button title="ESC" onClick={handleEsc} className="modal-esc">ESC</button>
					</div>
				</div>
			)}
			{/* Custom input removed — user types directly in xterm (claude TUI input box). */}

			{showHelp && <HelpModal commands={commands} onClose={() => setShowHelp(false)} />}
			{showUsage && <UsageModal onClose={() => setShowUsage(false)} />}
			{showModelPicker && (
				<SelectModal
					title="MODELL WECHSELN"
					subtitle="Auswahl wird sofort angewendet"
					options={modelOptions(status.model)}
					onSelect={(v) => { sendCommandWithAutoConfirm(sessionName, "/model " + v); setShowModelPicker(false); }}
					onClose={() => setShowModelPicker(false)}
				/>
			)}
			{showEffortPicker && (
				<SelectModal
					title="THINKING-EFFORT"
					subtitle="Mehr Effort = mehr Reasoning, höhere Kosten"
					options={effortOptions(status.effort)}
					onSelect={(v) => { sendCommandWithAutoConfirm(sessionName, "/effort " + v); setShowEffortPicker(false); }}
					onClose={() => setShowEffortPicker(false)}
				/>
			)}
			{showPermissionPicker && (
				<SelectModal
					title="PERMISSION-MODUS"
					subtitle="Bestimmt wann claude vor tool-calls fragt"
					options={permissionOptions(tab.dangerous === true ? "bypass" : status.permissionMode)}
					onSelect={(v) => {
						setShowPermissionPicker(false);
						const wasBypass = tab.dangerous === true;
						const goingBypass = v === "bypass";
						if (goingBypass !== wasBypass) {
							// Respawn tab with new dangerous flag
							onTabPatch({ dangerous: goingBypass });
							killSession(sessionName);
							lastCaptureRef.current = "";
							setMessages([]);
							setIsThinking(false);
							setThinkingLabel(undefined);
							setSessionReady(false);
							setXtermResetKey((k) => k + 1);
							setTimeout(() => {
								spawnSession({
									sessionName,
									agentName: tab.type === "agent" ? tab.agentName : undefined,
									workspace: tab.workspace,
									dangerous: goingBypass,
								});
							}, 100);
						} else if (!goingBypass) {
							// Normal mode-cycle for non-bypass modes
							applyPermissionMode(sessionName, v, status.permissionMode);
						}
					}}
					onClose={() => setShowPermissionPicker(false)}
				/>
			)}
			{showContextModal && (
				<ContextModal status={status} onClose={() => setShowContextModal(false)} onCompact={() => { sendMessage(sessionName, "/compact"); setShowContextModal(false); }} />
			)}
			{showPluginModal && (
				<PluginMarketplaceModal
					onClose={() => setShowPluginModal(false)}
					onInstall={(cmd) => { sendMessage(sessionName, cmd); setShowPluginModal(false); }}
				/>
			)}
		</div>
	);
}

function modelOptions(active?: string): SelectOption[] {
	const isOpus = active !== undefined && /opus/i.test(active);
	const isSonnet = active !== undefined && /sonnet/i.test(active);
	const isHaiku = active !== undefined && /haiku/i.test(active);
	return [
		{ value: "opus", label: "Opus 4.7", description: "Höchste Qualität, langsamer, teurer. Beste Wahl für komplexe Tasks.", active: isOpus, color: "#c084fc" },
		{ value: "sonnet", label: "Sonnet 4.6", description: "Balanced. Fast jede Aufgabe, schneller als Opus.", active: isSonnet, color: "#60a5fa" },
		{ value: "haiku", label: "Haiku 4.5", description: "Schnell + günstig. Für simple oder rasche Tasks.", active: isHaiku, color: "#4ade80" },
	];
}

function effortOptions(active?: string): SelectOption[] {
	const opts: Array<{ value: string; label: string; description: string }> = [
		{ value: "none", label: "none", description: "Kein extended thinking. Schnellste Antworten." },
		{ value: "minimal", label: "minimal", description: "Sehr kurzes Reasoning." },
		{ value: "medium", label: "medium", description: "Solide Antworten ohne Übergewicht (Standard für meiste Tasks)." },
		{ value: "high", label: "high", description: "Tiefes Reasoning. Für anspruchsvolle Probleme." },
		{ value: "xhigh", label: "xhigh", description: "Opus 4.7 only. Zwischen high und max." },
		{ value: "max", label: "max", description: "Maximal extended thinking. Höchste Kosten, langsamste Antworten." },
	];
	return opts.map((o) => ({ ...o, active: active === o.value }));
}

function permissionOptions(active?: string): SelectOption[] {
	const opts: Array<{ value: string; label: string; description: string; color: string }> = [
		{ value: "default", label: "default", description: "Claude fragt vor jedem tool-call.", color: "#8aa" },
		{ value: "acceptEdits", label: "acceptEdits", description: "File-Edits + simple Filesystem auto-allowed. Bash und Tests fragen.", color: "#60a5fa" },
		{ value: "auto", label: "auto (Claude Max)", description: "Maximal automatisch. Premium-Feature, mehr autonomy.", color: "#4ade80" },
		{ value: "plan", label: "plan", description: "Read-only. Claude plant aber edited nicht.", color: "#fbbf24" },
		{ value: "bypass", label: "bypass (YOLO ⚠)", description: "DANGEROUSLY SKIP PERMISSIONS — kein einziges Fragen, alles auto. Tab wird neu gespawned mit --dangerously-skip-permissions. NUR für sandboxed dev.", color: "#f87171" },
	];
	return opts.map((o) => ({ ...o, active: active === o.value }));
}

function ContextModal({ status, onClose, onCompact }: { status: import("./ptySession").StatusInfo; onClose: () => void; onCompact: () => void }): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	const pct = status.contextPercent ?? 0;
	const color = pct >= 80 ? "#f87171" : pct >= 60 ? "#fbbf24" : "var(--accent)";
	return (
		<div className="agent-picker-overlay" onClick={onClose}>
			<div className="agent-picker select-modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480 }}>
				<div className="select-modal-header">
					<span className="mono small-caps" style={{ color: "var(--accent)", letterSpacing: ".2em", fontSize: 11 }}>
						CONTEXT-WINDOW
					</span>
				</div>
				<div style={{ padding: "20px 18px" }}>
					<div className="mono" style={{ fontSize: 36, color, fontWeight: 600 }}>{pct}%</div>
					<div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
						von Maximum-Context aufgebraucht
					</div>
					<div style={{ marginTop: 16, height: 8, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
						<div style={{ height: "100%", width: pct + "%", background: color, transition: "width .25s" }} />
					</div>
					<div className="mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 8, letterSpacing: ".08em" }}>
						Model: <span style={{ color: "var(--text)" }}>{status.model ?? "?"}</span>
					</div>
					{pct >= 60 && (
						<button
							onClick={onCompact}
							style={{
								marginTop: 18,
								padding: "8px 16px",
								background: "var(--accent)",
								color: "#1a0d05",
								border: "none",
								borderRadius: 4,
								fontFamily: "'JetBrains Mono', monospace",
								fontSize: 11,
								fontWeight: 600,
								letterSpacing: ".08em",
								cursor: "pointer",
							}}
						>
							/COMPACT JETZT (Conversation komprimieren)
						</button>
					)}
				</div>
				<div className="select-modal-footer">
					<span className="mono" style={{ color: "var(--dim)", fontSize: 9, letterSpacing: ".14em" }}>ESC ZUM SCHLIEẞEN</span>
				</div>
			</div>
		</div>
	);
}

function HelpModal({ commands, onClose }: { commands: SlashCommand[]; onClose: () => void }): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	const byCat = { builtin: [] as SlashCommand[], user: [] as SlashCommand[], plugin: [] as SlashCommand[] };
	for (const c of commands) byCat[c.source].push(c);
	return (
		<div className="agent-picker-overlay" onClick={onClose}>
			<div className="agent-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 540, maxWidth: 700, maxHeight: "70vh", overflowY: "auto" }}>
				<div className="mono small-caps" style={{ color: "var(--accent)", letterSpacing: ".2em", fontSize: 11, padding: "12px 14px", borderBottom: "1px solid var(--border-2)" }}>
					HELP — VERFÜGBARE COMMANDS · {commands.length} total · ESC zum schließen
				</div>
				{[
					{ key: "builtin", label: "BUILT-IN" },
					{ key: "user", label: "DEINE COMMANDS" },
					{ key: "plugin", label: "PLUGIN COMMANDS" },
				].map((cat) => (
					<div key={cat.key}>
						<div className="mono small-caps" style={{ padding: "10px 14px 4px", color: "var(--dim)", fontSize: 9.5, letterSpacing: ".18em" }}>
							{cat.label} ({byCat[cat.key as keyof typeof byCat].length})
						</div>
						{byCat[cat.key as keyof typeof byCat].map((c) => (
							<div key={c.name} style={{ padding: "5px 14px", display: "flex", gap: 10, alignItems: "baseline" }}>
								<span className="mono" style={{ color: "var(--accent)", fontSize: 11.5, minWidth: 180 }}>{c.name}</span>
								<span className="mono" style={{ color: "var(--muted)", fontSize: 10.5 }}>{c.description}</span>
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

function UsageModal({ onClose }: { onClose: () => void }): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	let tokens: any = null;
	try {
		const fs = require("fs") as typeof import("fs");
		const os = require("os") as typeof import("os");
		const path = require("path") as typeof import("path");
		const p = path.join(os.homedir(), ".claude-cockpit/tokens.json");
		if (fs.existsSync(p)) tokens = JSON.parse(fs.readFileSync(p, "utf-8"));
	} catch (_) { /* ignore */ }
	const block = tokens?.active;
	return (
		<div className="agent-picker-overlay" onClick={onClose}>
			<div className="agent-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 420 }}>
				<div className="mono small-caps" style={{ color: "var(--accent)", letterSpacing: ".2em", fontSize: 11, padding: "12px 14px", borderBottom: "1px solid var(--border-2)" }}>
					USAGE — 5H-WINDOW · ESC zum schließen
				</div>
				{block === null || block === undefined ? (
					<div style={{ padding: 18, color: "var(--dim)" }}>Keine Token-Daten — refresh-Button im Dashboard drücken</div>
				) : (
					<div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
						<div className="mono" style={{ fontSize: 28, color: "var(--accent)", fontWeight: 600 }}>${(block.costUSD ?? 0).toFixed(2)}</div>
						<div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Tokens: <span style={{ color: "var(--text)" }}>{(block.totalTokens ?? 0).toLocaleString()}</span></div>
						<div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Burn rate: <span style={{ color: "var(--text)" }}>{Math.round(block.burnRate?.tokensPerMinute ?? 0).toLocaleString()}/min</span></div>
						<div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Model: <span style={{ color: "var(--text)" }}>{(block.models ?? [])[0] ?? "?"}</span></div>
						{block.projection && (
							<div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
								Projection: <span style={{ color: "var(--accent)" }}>${block.projection.totalCost.toFixed(2)}</span> · {block.projection.remainingMinutes}m verbleibend
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

interface AgentPickerProps {
	agents: AgentDef[];
	projects: ProjectEntry[];
	onPick: (type: "claude" | "agent", agentName: string | undefined, workspace: "home" | "vault", cwd?: string, displayName?: string) => void;
	onCancel: () => void;
}

function AgentPicker({ agents, projects, onPick, onCancel }: AgentPickerProps): JSX.Element {
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onCancel]);

	return (
		<div className="agent-picker-overlay" onClick={onCancel}>
			<div className="agent-picker" onClick={(e) => e.stopPropagation()}>
				<div className="mono small-caps" style={{ color: "var(--accent)", letterSpacing: ".2em", fontSize: 11, padding: "12px 14px", borderBottom: "1px solid var(--border-2)" }}>
					NEUEN CHAT STARTEN
				</div>
				<button className="picker-row" onClick={() => onPick("claude", undefined, "home")}>
					<span className="dot" style={{ background: "var(--accent)" }} />
					<div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: 1 }}>
						<span className="mono" style={{ fontSize: 12.5, color: "#f5f5f5" }}>claude (neutral)</span>
						<span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>$HOME als cwd, kein workspace-bias, allgemeiner chat</span>
					</div>
				</button>
				<button className="picker-row" onClick={() => onPick("claude", undefined, "vault")}>
					<span className="dot" style={{ background: "#7aa2f7" }} />
					<div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: 1 }}>
						<span className="mono" style={{ fontSize: 12.5, color: "#f5f5f5" }}>claude (vault)</span>
						<span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>cwd auf deinen Obsidian-Vault — für Notizen-Arbeit</span>
					</div>
				</button>
				{agents.map((a) => (
					<button key={a.name} className="picker-row" onClick={() => onPick("agent", a.name, "vault")}>
						<span className="dot" style={{ background: a.color ?? "var(--accent)" }} />
						<div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: 1 }}>
							<span className="mono" style={{ fontSize: 12.5, color: "#f5f5f5" }}>{a.name}</span>
							<span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>{a.description.slice(0, 80)}</span>
						</div>
					</button>
				))}
				{projects.length > 0 && (
					<div className="mono small-caps" style={{ color: "var(--dim)", letterSpacing: ".2em", fontSize: 9, padding: "10px 14px 4px", borderTop: "1px solid var(--border-2)" }}>
						PROJEKTE — claude im Projekt-Ordner
					</div>
				)}
				{projects.map((p) => (
					<button key={p.path} className="picker-row" onClick={() => onPick("claude", undefined, "home", p.path, p.name)}>
						<span className="dot" style={{ background: "#4ade80" }} />
						<div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: 1 }}>
							<span className="mono" style={{ fontSize: 12.5, color: "#f5f5f5" }}>{p.name}</span>
							<span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>cwd: {p.path.replace(/^.*\/Projects\//, "Projects/")}</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

export function ChatDrawer(): JSX.Element {
	const [height, setHeight] = useState<number>(getInitialHeight);
	const [tabsState, setTabsState] = useState<TabsState>(() => loadTabs());
	const [isDragging, setIsDragging] = useState<boolean>(false);
	const [showPicker, setShowPicker] = useState<boolean>(false);
	const [agents, setAgents] = useState<AgentDef[]>([]);
	const [commands, setCommands] = useState<SlashCommand[]>([]);
	const [files, setFiles] = useState<FileEntry[]>([]);
	const [projects, setProjects] = useState<ProjectEntry[]>([]);
	const dragStartY = useRef<number>(0);
	const dragStartHeight = useRef<number>(0);

	// Load agents + commands + files once
	useEffect(() => {
		setAgents(loadAgents());
		setCommands(loadCommands());
		setFiles(loadFiles());
		setProjects(loadProjects());
	}, []);

	// Persist tabs state
	useEffect(() => {
		saveTabs(tabsState);
	}, [tabsState]);

	const patchActiveTab = useCallback((patch: Partial<ChatTab>): void => {
		setTabsState((prev) => {
			if (prev.activeId === null) return prev;
			return {
				...prev,
				tabs: prev.tabs.map((t) => (t.id === prev.activeId ? { ...t, ...patch } : t)),
			};
		});
	}, []);

	const updateActiveDraft = useCallback((draft: string): void => {
		setTabsState((prev) => {
			if (prev.activeId === null) return prev;
			return {
				...prev,
				tabs: prev.tabs.map((t) => (t.id === prev.activeId ? { ...t, draft } : t)),
			};
		});
	}, []);

	const onDragStart = (e: React.MouseEvent): void => {
		setIsDragging(true);
		dragStartY.current = e.clientY;
		dragStartHeight.current = height;
		e.preventDefault();
	};

	useEffect(() => {
		if (!isDragging) return;
		const onMove = (e: MouseEvent): void => {
			const delta = dragStartY.current - e.clientY;
			const next = Math.max(MIN_HEIGHT, Math.min(window.innerHeight * MAX_HEIGHT_RATIO, dragStartHeight.current + delta));
			setHeight(next);
		};
		const onUp = (): void => {
			setIsDragging(false);
			try { window.localStorage.setItem(DRAWER_HEIGHT_KEY, String(height)); } catch (_) { /* ignore */ }
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, [isDragging, height]);

	const addTab = (type: "claude" | "agent", agentName: string | undefined, workspace: "home" | "vault", cwd?: string, displayName?: string): void => {
		if (tabsState.tabs.length >= MAX_TABS) {
			alert(`Max ${MAX_TABS} Tabs erreicht.`);
			return;
		}
		const id = makeUUID();
		const name = displayName ?? (agentName !== undefined
			? agentName
			: workspace === "vault"
				? "claude (vault)"
				: "claude");
		const newTab: ChatTab = { id, name, type, agentName, workspace, cwd };
		setTabsState((prev) => ({
			tabs: [...prev.tabs, newTab],
			activeId: id,
		}));
		setShowPicker(false);
	};

	const activateTab = (id: string): void => {
		setTabsState((prev) => ({ ...prev, activeId: id }));
	};

	const closeTab = (id: string): void => {
		// Kill tmux session
		const tab = tabsState.tabs.find((t) => t.id === id);
		if (tab !== undefined) {
			killSession(tabSessionName(tab));
		}
		setTabsState((prev) => {
			const newTabs = prev.tabs.filter((t) => t.id !== id);
			let newActive = prev.activeId;
			if (prev.activeId === id) {
				newActive = newTabs.length > 0 ? (newTabs[0]?.id ?? null) : null;
			}
			return { tabs: newTabs, activeId: newActive };
		});
	};

	const renameTab = (id: string): void => {
		const tab = tabsState.tabs.find((t) => t.id === id);
		if (tab === undefined) return;
		const newName = window.prompt("Neuer Tab-Name:", tab.name);
		if (newName === null || newName.trim().length === 0) return;
		setTabsState((prev) => ({
			...prev,
			tabs: prev.tabs.map((t) => (t.id === id ? { ...t, name: newName.trim() } : t)),
		}));
	};

	// Öffnet diesen Tab als eigenen, beweglichen Obsidian-Pane (gleiche tmux-Session).
	// So sieht man mehrere Terminals nebeneinander statt zwischen Tabs zu switchen.
	const popOutTab = (tab: ChatTab): void => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const app = (window as any).app;
		if (app === undefined || app === null) return;
		const leaf = app.workspace.getLeaf("split", "vertical");
		void leaf.setViewState({ type: "claude-cockpit-terminal", active: true, state: { tab } });
		app.workspace.revealLeaf(leaf);
	};

	const activeTab = tabsState.tabs.find((t) => t.id === tabsState.activeId);

	// Collapse state — when true, drawer is hidden and only a small re-open button shows.
	const [collapsed, setCollapsed] = useState<boolean>(() => {
		try { return window.localStorage.getItem(DRAWER_COLLAPSED_KEY) === "1"; }
		catch (_) { return false; }
	});
	const toggleCollapsed = (v: boolean): void => {
		setCollapsed(v);
		try { window.localStorage.setItem(DRAWER_COLLAPSED_KEY, v ? "1" : "0"); } catch (_) { /* ignore */ }
	};

	if (collapsed) {
		return (
			<>
				<button
					className="chat-drawer-reopen"
					onClick={() => toggleCollapsed(false)}
					title="Chat öffnen"
				>
					<span className="mono">▲ chat</span>
					<span className="chat-drawer-reopen-count mono">
						{tabsState.tabs.length} {tabsState.tabs.length === 1 ? "tab" : "tabs"}
					</span>
				</button>
				{showPicker && (
					<AgentPicker agents={agents} projects={projects} onPick={addTab} onCancel={() => setShowPicker(false)} />
				)}
			</>
		);
	}

	return (
		<>
			<div className="chat-drawer" style={{ height: `${height}px` }}>
				{/* Drag handle */}
				<div className="chat-drawer-handle" onMouseDown={onDragStart}>
					<div className="chat-drawer-handle-bar" />
				</div>

				{/* Tab bar */}
				<div className="chat-drawer-tabs">
					{tabsState.tabs.map((tab) => (
						<button
							key={tab.id}
							className={"chat-tab " + (tab.id === tabsState.activeId ? "active" : "")}
							onClick={() => activateTab(tab.id)}
							onContextMenu={(e) => {
								e.preventDefault();
								const action = window.prompt(
									`Tab "${tab.name}":\n[1] Umbenennen\n[2] Schließen\nEingabe (1 oder 2):`,
								);
								if (action === "1") renameTab(tab.id);
								else if (action === "2") closeTab(tab.id);
							}}
							title="Rechtsklick: umbenennen / schließen"
						>
							<span className="mono" style={{ fontSize: 11, fontWeight: 500 }}>
								{tab.type === "agent" ? "◆" : "💬"} {tab.name}
							</span>
							<span
								className="chat-tab-popout"
								onClick={(e) => { e.stopPropagation(); popOutTab(tab); }}
								title="In eigenem Pane öffnen (nebeneinander statt switchen)"
								style={{ marginLeft: 4, opacity: 0.55, cursor: "pointer", fontSize: 12 }}
							>
								⇱
							</span>
							{tabsState.tabs.length > 1 && (
								<span
									className="chat-tab-close"
									onClick={(e) => {
										e.stopPropagation();
										closeTab(tab.id);
									}}
									title="Schließen"
								>
									×
								</span>
							)}
						</button>
					))}
					<button
						className="chat-tab-plus"
						onClick={() => setShowPicker(true)}
						title="Neuer Chat"
						disabled={tabsState.tabs.length >= MAX_TABS}
					>
						+
					</button>
					<div style={{ flex: 1 }} />
					<button
						className="chat-tab-minimize"
						onClick={() => toggleCollapsed(true)}
						title="Chat-Drawer schliessen (re-open via Button unten)"
					>
						▾
					</button>
				</div>

				{/* Active chat pane */}
				{activeTab !== undefined ? (
					<ChatPane key={activeTab.id} tab={activeTab} onDraftChange={updateActiveDraft} onTabPatch={patchActiveTab} commands={commands} files={files} />
				) : (
					<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}>
						<span className="mono small-caps" style={{ letterSpacing: ".18em" }}>kein chat aktiv · drück +</span>
					</div>
				)}
			</div>

			{showPicker && (
				<AgentPicker agents={agents} projects={projects} onPick={addTab} onCancel={() => setShowPicker(false)} />
			)}
		</>
	);
}

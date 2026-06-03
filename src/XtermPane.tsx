import * as React from "react";
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getPtySession, paste as ptyPaste, type PtyHandle } from "./ptySession";

const IS_MAC = process.platform === "darwin";

interface XtermPaneProps {
	sessionName: string;
	ready: boolean;  // true after pty session has been spawned
}

/**
 * Embeds the live claude TUI via xterm.js. Streamt ANSI-Bytes direkt aus der
 * node-pty-Session (push via subscribe/attach) in das Terminal. Kein tmux,
 * kein pipe-pane-Logfile, kein fs-Polling — der Renderer zeigt exakt was claude rendert.
 */
export function XtermPane({ sessionName, ready }: XtermPaneProps): JSX.Element {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const sessionRef = useRef<PtyHandle | null>(null);

	// Mount xterm once
	useEffect(() => {
		if (containerRef.current === null) return;
		const term = new Terminal({
			fontFamily: "JetBrainsMono, 'JetBrains Mono', ui-monospace, Menlo, monospace",
			fontSize: 12.5,
			lineHeight: 1.25,
			theme: {
				background: "#0a0a0a",
				foreground: "#e5e5e5",
				cursor: "#FF6B1A",
				cursorAccent: "#0a0a0a",
				selectionBackground: "#3a2515",
				black: "#0a0a0a",
				red: "#f87171",
				green: "#4ade80",
				yellow: "#fbbf24",
				blue: "#60a5fa",
				magenta: "#c084fc",
				cyan: "#22d3ee",
				white: "#e5e5e5",
				brightBlack: "#5a5a5a",
				brightRed: "#fca5a5",
				brightGreen: "#86efac",
				brightYellow: "#fde68a",
				brightBlue: "#93c5fd",
				brightMagenta: "#d8b4fe",
				brightCyan: "#67e8f9",
				brightWhite: "#f5f5f5",
			},
			cursorBlink: true,
			disableStdin: false,   // user types directly in xterm — sent to pty via onData below
			scrollback: 5000,
			convertEol: true,
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(containerRef.current);
		try { fit.fit(); } catch (_) { /* ignore */ }
		termRef.current = term;
		fitRef.current = fit;

		// Forward user keystrokes → pty. xterm.js emits raw bytes (incl. escape
		// sequences for arrows etc.) on onData; node-pty leitet sie 1:1 ans claude-TUI.
		const dataDisposable = term.onData((data) => {
			sessionRef.current?.write(data);
		});

		// Paste-Handling: Single source of truth + dedupe.
		// Multiple event-paths fire on Cmd+V (key handler + paste event + helper-textarea event).
		let lastPasteAt = 0;
		const sendPaste = (text: string, source: string): void => {
			if (text.length === 0) return;
			const now = Date.now();
			if (now - lastPasteAt < 200) return; // dedupe same paste firing multiple handlers
			lastPasteAt = now;
			// CRLF/CR → LF normalisieren (Windows-Clipboard), bracketed-paste macht ptyPaste selbst.
			const norm = text.replace(/\r\n?/g, "\n");
			console.log(`[agentic-os] paste ${norm.length} chars from ${source} → ${sessionName}`);
			ptyPaste(sessionName, norm);
		};

		const readElectronClipboard = (): string => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const electron = require("electron");
				return electron?.clipboard?.readText?.() ?? "";
			} catch (_) { return ""; }
		};

		const writeElectronClipboard = (text: string): void => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const electron = require("electron");
				electron?.clipboard?.writeText?.(text);
			} catch (_) { /* ignore */ }
		};

		// Helper: send raw bytes to the pty (for key mappings)
		const sendRaw = (bytes: string): void => { sessionRef.current?.write(bytes); };

		// PRIMARY HANDLER: xterm customKeyEventHandler. Platform-aware:
		// Mac uses Cmd (metaKey) for copy/paste + zsh line-editing mappings;
		// Windows/Linux use Ctrl (Ctrl+Shift+C/V), plain Ctrl+C stays SIGINT.
		// Returns false = xterm should NOT process further (we handled it).
		term.attachCustomKeyEventHandler((ev) => {
			if (ev.type !== "keydown") return true;
			const key = ev.key.toLowerCase();

			// ===== macOS: Cmd-based mappings =====
			if (IS_MAC) {
				if (ev.metaKey && !ev.altKey && !ev.shiftKey && !ev.ctrlKey) {
					if (key === "backspace") { sendRaw("\x15"); ev.preventDefault(); return false; } // Cmd+Backspace → Ctrl+U (delete to BOL)
					if (key === "arrowleft") { sendRaw("\x01"); ev.preventDefault(); return false; } // Cmd+Left → Ctrl+A (BOL)
					if (key === "arrowright") { sendRaw("\x05"); ev.preventDefault(); return false; } // Cmd+Right → Ctrl+E (EOL)
					if (key === "v") {
						const text = readElectronClipboard();
						if (text.length > 0) sendPaste(text, "key-cmd-v");
						ev.preventDefault(); return false;
					}
					if (key === "c" && term.hasSelection()) {
						writeElectronClipboard(term.getSelection());
						ev.preventDefault(); return false;
					}
					if (key === "a") { term.selectAll(); ev.preventDefault(); return false; }
				}
				// Option+Key (Alt-Mac) word-movement mappings
				if (ev.altKey && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
					if (key === "backspace") { sendRaw("\x17"); ev.preventDefault(); return false; } // Opt+Backspace → Ctrl+W (delete word)
					if (key === "arrowleft") { sendRaw("\x1bb"); ev.preventDefault(); return false; } // Opt+Left → backward word
					if (key === "arrowright") { sendRaw("\x1bf"); ev.preventDefault(); return false; } // Opt+Right → forward word
				}
				return true;
			}

			// ===== Windows / Linux: Ctrl-based =====
			if (ev.ctrlKey && !ev.altKey && !ev.metaKey) {
				// Ctrl+Shift+V or plain Ctrl+V → Paste (Terminal-Konvention; kollidiert nicht mit claude)
				if (key === "v") {
					const text = readElectronClipboard();
					if (text.length > 0) sendPaste(text, ev.shiftKey ? "key-ctrl-shift-v" : "key-ctrl-v");
					ev.preventDefault(); return false;
				}
				// Ctrl+Shift+C → Copy bei Selection. Plain Ctrl+C bleibt SIGINT (→ pty).
				if (key === "c" && ev.shiftKey && term.hasSelection()) {
					writeElectronClipboard(term.getSelection());
					ev.preventDefault(); return false;
				}
				// Plain Ctrl+C/U/W/A/E/R/L etc. → return true → onData → pty (claude bekommt es raw).
				return true;
			}
			return true;
		});

		// FALLBACK HANDLER: DOM paste event (right-click → Einfügen, IME paste).
		const onDomPaste = (ev: ClipboardEvent): void => {
			const text = ev.clipboardData?.getData("text/plain") ?? "";
			ev.preventDefault();
			if (text.length === 0) return;
			sendPaste(text, "dom-paste");
		};
		containerRef.current.addEventListener("paste", onDomPaste);

		// COPY HANDLER: selection + Cmd/Ctrl+C → clipboard.
		const onDomCopy = (ev: ClipboardEvent): void => {
			const sel = term.getSelection();
			if (sel.length === 0) return;
			ev.preventDefault();
			ev.clipboardData?.setData("text/plain", sel);
		};
		containerRef.current.addEventListener("copy", onDomCopy);

		// DRAG-DROP: drop file(s) from Finder/Explorer/Obsidian → send "@<path>" mention.
		// Document-level capture-phase runs BEFORE Obsidian's workspace bubble handler.
		const getElectronWebUtils = (): { getPathForFile: (f: File) => string } | null => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const electron = require("electron");
				const wu = electron?.webUtils;
				if (wu !== undefined && typeof wu.getPathForFile === "function") return wu;
			} catch (_) { /* ignore */ }
			return null;
		};
		const webUtilsCached = getElectronWebUtils();
		const isInsideOurPane = (target: EventTarget | null): boolean => {
			if (containerRef.current === null) return false;
			if (!(target instanceof Node)) return false;
			return containerRef.current.contains(target);
		};
		const extractPaths = (dt: DataTransfer): string[] => {
			const paths: string[] = [];
			// Method 1: webUtils.getPathForFile (Electron 32+ — current Obsidian = Electron 39)
			if (dt.files !== undefined && dt.files.length > 0) {
				for (let i = 0; i < dt.files.length; i++) {
					const f = dt.files[i];
					if (f === undefined) continue;
					const legacyPath = (f as File & { path?: string }).path;
					if (typeof legacyPath === "string" && legacyPath.length > 0) { paths.push(legacyPath); continue; }
					if (webUtilsCached !== null) {
						try {
							const p = webUtilsCached.getPathForFile(f);
							if (typeof p === "string" && p.length > 0) { paths.push(p); continue; }
						} catch (e) { console.warn("[agentic-os] webUtils.getPathForFile failed for", f.name, e); }
					}
				}
			}
			// Method 2: text/uri-list (file:// URIs) — Windows-aware
			if (paths.length === 0) {
				const uris = dt.getData("text/uri-list");
				if (uris.length > 0) {
					uris.split(/\r?\n/).forEach((u) => {
						const trimmed = u.trim();
						if (trimmed.length === 0 || trimmed.startsWith("#")) return;
						if (trimmed.startsWith("file://")) {
							try {
								let p = decodeURIComponent(trimmed.replace(/^file:\/\//, ""));
								// file:///C:/foo → "/C:/foo" → strip Leading-Slash vor Drive-Letter
								if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
								paths.push(p);
							} catch (_) { /* ignore */ }
						}
					});
				}
			}
			// Method 3: text/plain — unix /…, Windows C:\… or C:/…, UNC \\server\share
			if (paths.length === 0) {
				const plain = dt.getData("text/plain");
				const isUnix = plain.startsWith("/");
				const isWinDrive = /^[A-Za-z]:[\\/]/.test(plain);
				const isUnc = plain.startsWith("\\\\");
				if (plain.length > 0 && !plain.includes("\n") && (isUnix || isWinDrive || isUnc)) {
					paths.push(plain);
				}
			}
			return paths;
		};
		const onDocDragEnter = (ev: DragEvent): void => {
			if (!isInsideOurPane(ev.target)) return;
			ev.preventDefault(); ev.stopPropagation();
		};
		const onDocDragOver = (ev: DragEvent): void => {
			if (!isInsideOurPane(ev.target)) return;
			ev.preventDefault(); ev.stopPropagation();
			if (ev.dataTransfer !== null) ev.dataTransfer.dropEffect = "copy";
		};
		const onDocDrop = (ev: DragEvent): void => {
			if (!isInsideOurPane(ev.target)) return;
			ev.preventDefault(); ev.stopPropagation();
			const dt = ev.dataTransfer;
			if (dt === null) { console.warn("[agentic-os] drop with null dataTransfer"); return; }
			const paths = extractPaths(dt);
			if (paths.length === 0) {
				console.warn("[agentic-os] drop received but no paths extracted. dt.types =", Array.from(dt.types), "files =", dt.files?.length);
				return;
			}
			// Quote when path has space OR backslash (Windows). claude reads quoted path literally.
			const mentions = paths.map((p) => {
				const needsQuote = p.includes(" ") || p.includes("\\");
				return needsQuote ? `@"${p}"` : `@${p}`;
			}).join(" ") + " ";
			console.log(`[agentic-os] dropped ${paths.length} file(s) → ${sessionName}:`, paths);
			sendPaste(mentions, "drag-drop");
		};
		document.addEventListener("dragenter", onDocDragEnter, true);
		document.addEventListener("dragover", onDocDragOver, true);
		document.addEventListener("drop", onDocDrop, true);

		// Auto-focus xterm on mount so user can type immediately
		setTimeout(() => { try { term.focus(); } catch (_) { /* ignore */ } }, 100);

		const syncPtySize = (): void => {
			const t = termRef.current;
			const s = sessionRef.current;
			if (t === null || s === null) return;
			// Guard cols/rows>0: inaktive Tabs (display:none) liefern 0 → resize(0,0) wuerde TUI zerschiessen.
			if (t.cols > 0 && t.rows > 0) s.resize(t.cols, t.rows);
		};
		const resizeObs = new ResizeObserver(() => {
			try { fit.fit(); } catch (_) { /* ignore */ }
			syncPtySize();
		});
		resizeObs.observe(containerRef.current);
		window.setTimeout(syncPtySize, 200);

		return () => {
			resizeObs.disconnect();
			dataDisposable.dispose();
			document.removeEventListener("dragenter", onDocDragEnter, true);
			document.removeEventListener("dragover", onDocDragOver, true);
			document.removeEventListener("drop", onDocDrop, true);
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, []);

	// Attach to the pty session once it's ready: replay ring + live stream + exit.
	useEffect(() => {
		if (!ready) return;
		const term = termRef.current;
		if (term === null) return;

		const session = getPtySession(sessionName);
		if (session === null) {
			console.error("[agentic-os] no pty session for", sessionName);
			return;
		}
		sessionRef.current = session;

		// Atomar: schreibt synchron den Ring (Replay) UND registriert den Live-Listener
		// in EINEM Call → kein Doppel-Chunk-Race zwischen Replay und Subscribe.
		const detach = session.attach((chunk) => {
			if (termRef.current !== null) termRef.current.write(chunk);
		});

		// Exit: claude beendet (/exit, crash) → Hinweiszeile rendern.
		const unsubExit = session.onExit((exitCode) => {
			if (termRef.current !== null) {
				termRef.current.write(`\r\n\x1b[2m[session ended, exit ${exitCode}]\x1b[0m\r\n`);
			}
		});

		// Groesse einmal syncen, nachdem Replay das Layout gefuellt hat.
		const t = window.setTimeout(() => {
			const tt = termRef.current;
			if (tt !== null && tt.cols > 0 && tt.rows > 0) session.resize(tt.cols, tt.rows);
		}, 50);

		return () => {
			window.clearTimeout(t);
			detach();
			unsubExit();
			sessionRef.current = null;
		};
	}, [ready, sessionName]);

	return (
		<div className="xterm-pane-wrap">
			<div ref={containerRef} className="xterm-pane" />
		</div>
	);
}

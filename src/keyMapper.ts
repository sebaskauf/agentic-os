import type { App, Plugin } from "obsidian";

/**
 * Mappt macOS-typische Cmd-Shortcuts auf zsh-Equivalente im Terminal-Plugin:
 * - Cmd+Backspace → Ctrl+U (löscht Zeile bis Cursor-Anfang)
 * - Cmd+ArrowLeft → Ctrl+A (Zeile-Anfang)
 * - Cmd+ArrowRight → Ctrl+E (Zeile-Ende)
 *
 * Funktioniert via document keydown-Listener im Capture-Phase.
 * Wenn der Event im Terminal-Plugin-Pane stattfindet, wird er abgefangen
 * und das Equivalent als synthetic KeyboardEvent an die xterm.js Textarea geschickt.
 */
export function registerTerminalKeyMapper(plugin: Plugin, app: App): void {
	// Nur macOS: der globale Cmd-Mapper biegt Cmd-Shortcuts auf zsh-Ctrl-Equivalente.
	// Auf Windows uebernimmt XtermPanes customKeyEventHandler die Ctrl-Logik direkt —
	// dieser globale Mapper wuerde sonst doppelt feuern.
	if (process.platform !== "darwin") return;
	const handler = (e: KeyboardEvent): void => {
		if (!e.metaKey) return;

		// Check ob das event innerhalb eines Terminal-Panes ist
		const target = e.target as HTMLElement | null;
		if (target === null) return;
		const terminalLeaf = target.closest('.workspace-leaf-content[data-type^="terminal"]');
		if (terminalLeaf === null) return;

		// Finde die xterm-helper-textarea (das ist wo xterm Input liest)
		const textarea = terminalLeaf.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
		if (textarea === null) return;

		let synthetic: KeyboardEvent | null = null;

		if (e.key === "Backspace") {
			// Cmd+Backspace → Ctrl+U (kill-whole-line / backward-kill-line in zsh)
			synthetic = new KeyboardEvent("keydown", {
				key: "u",
				code: "KeyU",
				keyCode: 85,
				which: 85,
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
		} else if (e.key === "ArrowLeft") {
			// Cmd+Left → Ctrl+A (beginning-of-line)
			synthetic = new KeyboardEvent("keydown", {
				key: "a",
				code: "KeyA",
				keyCode: 65,
				which: 65,
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
		} else if (e.key === "ArrowRight") {
			// Cmd+Right → Ctrl+E (end-of-line)
			synthetic = new KeyboardEvent("keydown", {
				key: "e",
				code: "KeyE",
				keyCode: 69,
				which: 69,
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
		}

		if (synthetic !== null) {
			e.preventDefault();
			e.stopPropagation();
			textarea.dispatchEvent(synthetic);
		}
	};

	document.addEventListener("keydown", handler, true);

	plugin.register(() => {
		document.removeEventListener("keydown", handler, true);
	});
}

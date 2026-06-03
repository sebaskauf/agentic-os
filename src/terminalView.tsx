import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatPane } from "./ChatDrawer";
import { loadCommands } from "./loadCommands";
import { loadFiles } from "./loadFiles";
import { type ChatTab, loadTabs, saveTabs } from "./loadChatTabs";

export const VIEW_TYPE_TERMINAL = "claude-cockpit-terminal";

interface TerminalViewState {
	tab?: ChatTab;
}

/**
 * Rendert genau EIN Claude/Agent-Terminal (ChatPane) als eigenständigen
 * Obsidian-Pane/Leaf. Dadurch greift Obsidians natives Pane-System:
 * splitten, per Drag anordnen, "Open in new window" auf zweiten Bildschirm.
 *
 * Additiv: der bestehende ChatDrawer bleibt unberührt. Dies ist Schritt 2
 * des REBUILD-PLAN (Terminal-Leaf-Architektur).
 */
export class TerminalView extends ItemView {
	private root: Root | null = null;
	private tab: ChatTab | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TERMINAL;
	}

	getDisplayText(): string {
		return this.tab !== null ? `▸ ${this.tab.name}` : "Terminal";
	}

	getIcon(): string {
		return "square-terminal";
	}

	// Obsidian persistiert diesen State (Tab-Position, Window, Restart).
	getState(): Record<string, unknown> {
		return { tab: this.tab ?? undefined };
	}

	async setState(state: unknown, result: { history: boolean }): Promise<void> {
		const s = state as TerminalViewState | undefined;
		if (s?.tab !== undefined) {
			this.tab = s.tab;
			this.renderView();
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("claude-cockpit-root");
		this.contentEl.addClass("claude-cockpit-terminal-leaf");
		if (this.tab !== null) this.renderView();
	}

	private renderView(): void {
		if (this.tab === null) return;
		const container = this.contentEl;
		if (this.root !== null) {
			this.root.unmount();
			this.root = null;
		}
		container.empty();
		this.root = createRoot(container);
		const tab = this.tab;
		// Draft zurück nach chat-tabs.json (gleicher Store wie der ChatDrawer).
		const persistDraft = (draft: string): void => {
			const st = loadTabs();
			const idx = st.tabs.findIndex((t) => t.id === tab.id);
			if (idx >= 0) {
				st.tabs[idx] = { ...st.tabs[idx], draft } as ChatTab;
				saveTabs(st);
			}
		};
		this.root.render(
			<ChatPane
				tab={tab}
				commands={loadCommands()}
				files={loadFiles()}
				onDraftChange={persistDraft}
				onTabPatch={() => { /* Status-Patches im Leaf-PoC nicht persistiert */ }}
			/>,
		);
	}

	async onClose(): Promise<void> {
		if (this.root !== null) {
			this.root.unmount();
			this.root = null;
		}
		// Bewusst KEIN killSession: die node-pty-Session lebt im Modul-Singleton weiter,
		// der Pane kann später re-attachen (Ring-Buffer-Replay via getPtySession().attach()).
		// Mehrere Panes derselben Session sind erlaubt (Multi-Subscriber-Fan-out).
	}
}

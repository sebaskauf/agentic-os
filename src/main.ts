import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { CockpitView, VIEW_TYPE_COCKPIT } from "./view";
import { TerminalView, VIEW_TYPE_TERMINAL } from "./terminalView";
import { makeUUID, type ChatTab } from "./loadChatTabs";
import { registerTerminalKeyMapper } from "./keyMapper";
import { killAllSessions } from "./ptySession";

export default class ClaudeCockpitPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(
			VIEW_TYPE_COCKPIT,
			(leaf: WorkspaceLeaf) => new CockpitView(leaf),
		);

		// Terminal als eigener, frei platzierbarer Obsidian-Pane (Pop-out).
		this.registerView(
			VIEW_TYPE_TERMINAL,
			(leaf: WorkspaceLeaf) => new TerminalView(leaf),
		);

		this.addRibbonIcon("square-terminal", "Open Claude Cockpit", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-claude-cockpit",
			name: "Open Claude Cockpit",
			callback: () => { void this.activateView(); },
		});

		this.addCommand({
			id: "open-terminal-pane",
			name: "Neues Terminal als Pane öffnen",
			callback: () => { void this.openTerminalPane(); },
		});

		// macOS: Cmd-Shortcuts → zsh-Ctrl-Equivalente im Terminal.
		registerTerminalKeyMapper(this, this.app);

		new Notice("Claude Cockpit geladen.");
	}

	async onunload(): Promise<void> {
		// node-pty-Kinder leben im Renderer und MUESSEN beim Unload sterben,
		// sonst bleiben Zombie-claude-Prozesse zurueck.
		killAllSessions();
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_COCKPIT);
		const firstExisting = existing[0];
		if (firstExisting !== undefined) {
			workspace.revealLeaf(firstExisting);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_COCKPIT, active: true });
		workspace.revealLeaf(leaf);
	}

	private async openTerminalPane(tab?: ChatTab): Promise<void> {
		const theTab: ChatTab = tab ?? {
			id: makeUUID(),
			name: "claude",
			type: "claude",
			workspace: "home",
		};
		const leaf = this.app.workspace.getLeaf("split", "vertical");
		await leaf.setViewState({
			type: VIEW_TYPE_TERMINAL,
			active: true,
			state: { tab: theTab },
		});
		this.app.workspace.revealLeaf(leaf);
	}
}

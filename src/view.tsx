import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";

export const VIEW_TYPE_COCKPIT = "claude-cockpit-view";

export class CockpitView extends ItemView {
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_COCKPIT;
	}

	getDisplayText(): string {
		return "Claude Cockpit";
	}

	getIcon(): string {
		return "square-terminal";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("claude-cockpit-root");

		this.root = createRoot(container);
		this.root.render(<App />);
	}

	async onClose(): Promise<void> {
		if (this.root !== null) {
			this.root.unmount();
			this.root = null;
		}
	}
}

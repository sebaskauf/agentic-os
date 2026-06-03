import * as React from "react";
import type { StatusInfo } from "./ptySession";

interface StatusBarProps {
	status: StatusInfo;
	sessionName: string;
	onSlashCommand: (cmd: string) => void;
	workspace?: "home" | "vault";
	agentName?: string;
	onOpenPlugins?: () => void;
	onOpenModel?: () => void;
	onOpenEffort?: () => void;
	onOpenPermissions?: () => void;
	onOpenContext?: () => void;
	onOpenHelp?: () => void;
}

function shortModel(model?: string): string {
	if (model === undefined) return "?";
	if (/opus/i.test(model)) return "Opus";
	if (/sonnet/i.test(model)) return "Sonnet";
	if (/haiku/i.test(model)) return "Haiku";
	return model.slice(0, 8);
}

function modeColor(mode?: string): string {
	if (mode === "auto") return "#4ade80";
	if (mode === "plan") return "#fbbf24";
	if (mode === "bypass" || mode === "yolo") return "#f87171";
	return "#8aa";
}

function contextColor(pct?: number): string {
	if (pct === undefined) return "var(--dim)";
	if (pct >= 80) return "#f87171";
	if (pct >= 60) return "#fbbf24";
	return "var(--accent)";
}

export function StatusBar({
	status, onSlashCommand, workspace, agentName,
	onOpenPlugins, onOpenModel, onOpenEffort, onOpenPermissions, onOpenContext, onOpenHelp,
}: StatusBarProps): JSX.Element {
	const ctxPct = status.contextPercent;
	const ctxStr = ctxPct !== undefined ? `${ctxPct}%` : "—";
	return (
		<div className="status-bar">
			<button
				className="status-pill model"
				onClick={() => (onOpenModel ?? (() => onSlashCommand("/model")))()}
				title="Modell wechseln"
			>
				<span className="status-pill-label">MODEL</span>
				<span className="status-pill-value">{shortModel(status.model)}</span>
			</button>
			<button
				className="status-pill mode"
				onClick={() => (onOpenPermissions ?? (() => onSlashCommand("/permissions")))()}
				title="Permission-Modus wechseln"
				style={{ ["--mode-color" as string]: modeColor(status.permissionMode) }}
			>
				<span className="status-pill-label">MODE</span>
				<span className="status-pill-value">{status.permissionMode ?? "?"}</span>
			</button>
			<button
				className="status-pill effort"
				onClick={() => (onOpenEffort ?? (() => onSlashCommand("/effort")))()}
				title="Thinking-Effort umstellen"
			>
				<span className="status-pill-label">EFFORT</span>
				<span className="status-pill-value">{status.effort ?? "?"}</span>
			</button>
			<button
				className="status-pill context"
				onClick={() => (onOpenContext ?? (() => onSlashCommand("/context")))()}
				title="Context-Window-Breakdown"
				style={{ ["--ctx-color" as string]: contextColor(ctxPct) }}
			>
				<span className="status-pill-label">CTX</span>
				<span className="status-pill-value">{ctxStr}</span>
				<span className="status-ctx-bar">
					<span className="status-ctx-fill" style={{ width: ctxPct !== undefined ? `${Math.min(ctxPct, 100)}%` : "0%" }} />
				</span>
			</button>
			<div className="status-pill workspace" title={agentName !== undefined ? `Agent: ${agentName}` : workspace === "vault" ? "Workspace: Vault" : "Workspace: HOME (neutral)"}>
				<span className="status-pill-label">{agentName !== undefined ? "AGENT" : "WORKSPACE"}</span>
				<span className="status-pill-value">{agentName !== undefined ? agentName : workspace === "vault" ? "vault" : "home"}</span>
			</div>
			<div style={{ flex: 1 }} />
			{onOpenPlugins !== undefined && (
				<button
					className="status-pill action"
					onClick={onOpenPlugins}
					title="Plugin- & Skill-Marketplace öffnen"
				>
					<span className="status-pill-label">PLUGINS</span>
					<span className="status-pill-value">↗</span>
				</button>
			)}
			<button
				className="status-pill action"
				onClick={() => (onOpenHelp ?? (() => onSlashCommand("/help")))()}
				title="Alle Commands listen"
			>
				<span className="status-pill-label">HELP</span>
				<span className="status-pill-value">?</span>
			</button>
		</div>
	);
}

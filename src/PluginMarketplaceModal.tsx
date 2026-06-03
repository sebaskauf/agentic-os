import * as React from "react";
import { useEffect, useState, useMemo } from "react";
import { loadPlugins, loadSkills, type PluginInfo, type SkillInfo } from "./loadPlugins";

interface PluginMarketplaceModalProps {
	onClose: () => void;
	onInstall: (cmd: string) => void;
}

type Tab = "plugins" | "skills" | "available";

/**
 * Modal showing installed plugins + skills, plus install actions.
 * Install actions send /plugin commands to claude (which handles the actual install).
 */
export function PluginMarketplaceModal({ onClose, onInstall }: PluginMarketplaceModalProps): JSX.Element {
	const [tab, setTab] = useState<Tab>("plugins");
	const [query, setQuery] = useState<string>("");
	const plugins = useMemo(() => loadPlugins(), []);
	const skills = useMemo(() => loadSkills(), []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const filteredPlugins = useMemo(() => plugins.filter((p) => {
		if (query.length === 0) return true;
		const q = query.toLowerCase();
		return p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false) || p.marketplace.toLowerCase().includes(q);
	}), [plugins, query]);

	const filteredSkills = useMemo(() => skills.filter((s) => {
		if (query.length === 0) return true;
		const q = query.toLowerCase();
		return s.name.toLowerCase().includes(q) || (s.description?.toLowerCase().includes(q) ?? false);
	}), [skills, query]);

	return (
		<div className="agent-picker-overlay" onClick={onClose}>
			<div className="agent-picker plugin-marketplace" onClick={(e) => e.stopPropagation()}>
				<div className="select-modal-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
					<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
						<span className="mono small-caps" style={{ color: "var(--accent)", letterSpacing: ".2em", fontSize: 11 }}>
							PLUGIN + SKILL MARKETPLACE
						</span>
						<span className="mono" style={{ color: "var(--dim)", fontSize: 10 }}>
							{plugins.length} Plugins · {skills.length} Skills
						</span>
					</div>
					<div style={{ display: "flex", gap: 4 }}>
						<TabButton current={tab} value="plugins" onSelect={setTab} label={`Plugins (${plugins.length})`} />
						<TabButton current={tab} value="skills" onSelect={setTab} label={`Skills (${skills.length})`} />
						<TabButton current={tab} value="available" onSelect={setTab} label="Marketplace" />
					</div>
					{tab !== "available" && (
						<input
							className="plugin-search"
							placeholder="Suchen..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							autoFocus
						/>
					)}
				</div>
				<div className="plugin-list">
					{tab === "plugins" && (
						filteredPlugins.length === 0
							? <div className="plugin-empty">Keine Plugins installiert.</div>
							: filteredPlugins.map((p) => <PluginRow key={p.id} p={p} />)
					)}
					{tab === "skills" && (
						filteredSkills.length === 0
							? <div className="plugin-empty">Keine Skills installiert.</div>
							: filteredSkills.map((s) => <SkillRow key={s.id} s={s} />)
					)}
					{tab === "available" && (
						<AvailableMarketplaces onInstall={onInstall} />
					)}
				</div>
				<div className="select-modal-footer">
					<span className="mono" style={{ color: "var(--dim)", fontSize: 9, letterSpacing: ".14em" }}>ESC ZUM SCHLIEẞEN</span>
				</div>
			</div>
		</div>
	);
}

function TabButton({ current, value, onSelect, label }: { current: Tab; value: Tab; onSelect: (t: Tab) => void; label: string }): JSX.Element {
	return (
		<button
			className={"plugin-tab" + (current === value ? " active" : "")}
			onClick={() => onSelect(value)}
		>
			{label}
		</button>
	);
}

function PluginRow({ p }: { p: PluginInfo }): JSX.Element {
	return (
		<div className="plugin-row">
			<div className="plugin-row-header">
				<span className="plugin-row-name mono">{p.name}</span>
				{p.version !== undefined && <span className="plugin-row-version mono">v{p.version}</span>}
				<span className="plugin-row-source mono">{p.marketplace}</span>
			</div>
			{p.description !== undefined && (
				<div className="plugin-row-desc">{p.description}</div>
			)}
			<div className="plugin-row-stats">
				{p.commands > 0 && <span className="plugin-stat">⌘ {p.commands} Commands</span>}
				{p.skills > 0 && <span className="plugin-stat">⚡ {p.skills} Skills</span>}
				{p.agents > 0 && <span className="plugin-stat">◆ {p.agents} Agents</span>}
			</div>
		</div>
	);
}

function SkillRow({ s }: { s: SkillInfo }): JSX.Element {
	return (
		<div className="plugin-row">
			<div className="plugin-row-header">
				<span className="plugin-row-name mono">{s.name}</span>
				<span className="plugin-row-source mono">{s.source === "user" ? "USER" : `PLUGIN: ${s.plugin}`}</span>
			</div>
			{s.description !== undefined && (
				<div className="plugin-row-desc">{s.description.slice(0, 200)}{s.description.length > 200 ? "..." : ""}</div>
			)}
		</div>
	);
}

const RECOMMENDED_MARKETPLACES = [
	{
		id: "anthropics/claude-plugins-official",
		name: "Official Marketplace (Anthropic)",
		description: "Anthropic-curated plugins. Geprüft und vertrauenswürdig.",
		cmd: "/plugin marketplace add anthropics/claude-plugins-official",
	},
	{
		id: "anthropics/claude-plugins-community",
		name: "Community Marketplace (Anthropic)",
		description: "Community plugins, automatisch sicherheitsgescreened.",
		cmd: "/plugin marketplace add anthropics/claude-plugins-community",
	},
	{
		id: "obra/superpowers",
		name: "Superpowers",
		description: "TDD, debugging, brainstorming + 40+ workflow skills von obra.",
		cmd: "/plugin marketplace add obra/superpowers",
	},
];

function AvailableMarketplaces({ onInstall }: { onInstall: (cmd: string) => void }): JSX.Element {
	return (
		<div>
			<div style={{ padding: "12px 14px", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
				Marketplaces sind Sammlungen von Plugins. Erst Marketplace adden, dann einzelne Plugins installieren via <span className="mono" style={{ color: "var(--accent)" }}>/plugin install &lt;name&gt;</span>.
			</div>
			{RECOMMENDED_MARKETPLACES.map((m) => (
				<div key={m.id} className="plugin-row">
					<div className="plugin-row-header">
						<span className="plugin-row-name mono">{m.name}</span>
					</div>
					<div className="plugin-row-desc">{m.description}</div>
					<div className="plugin-row-cmd">
						<code className="mono">{m.cmd}</code>
						<button
							className="plugin-install-btn"
							onClick={() => onInstall(m.cmd)}
						>
							Add
						</button>
					</div>
				</div>
			))}
		</div>
	);
}

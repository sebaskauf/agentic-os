import * as React from "react";
import { useState, useEffect } from "react";
import { Notice } from "obsidian";
import { Icons } from "./icons";
import { sendMessage } from "./ptySession";
import { loadTabs, tabSessionName } from "./loadChatTabs";
import { loadAgents, type AgentDef } from "./loadAgents";
import { loadCommands, type SlashCommand } from "./loadCommands";
import { ChatDrawer } from "./ChatDrawer";

/* ---------- Active-session resolver ----------
 * Quick-Launch-Buttons gehen an das AKTUELL aktive Terminal (im Drawer).
 * activeId lebt in chat-tabs.json — der ChatDrawer persistiert ihn bei jedem
 * Tab-Wechsel. Live beim Klick gelesen, daher immer aktuell. */
function resolveActiveSession(): { session: string; label: string } | null {
	try {
		const st = loadTabs();
		const active = st.tabs.find((t) => t.id === st.activeId);
		if (active !== undefined) return { session: tabSessionName(active), label: active.name };
	} catch (_) { /* ignore */ }
	return null;
}

function runCommand(command: string): void {
	const target = resolveActiveSession();
	if (target === null) {
		new Notice("Kein aktives Terminal — öffne unten einen Chat (+).", 4000);
		return;
	}
	const r = sendMessage(target.session, command);
	if (r.ok) new Notice(`→ ${target.label}: ${command.slice(0, 60)}`, 3000);
	else new Notice(`Senden fehlgeschlagen: ${r.error ?? "Terminal läuft nicht"}`, 6000);
}

function useTick(ms = 1000): void {
	const [, set] = useState<number>(0);
	useEffect(() => {
		const id = window.setInterval(() => set((x) => x + 1), ms);
		return () => window.clearInterval(id);
	}, [ms]);
}

/* ---------- Header ---------- */
function Header(): JSX.Element {
	return (
		<div style={{ padding: "14px 18px 12px" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
						<Icons.chevron />
						<span className="mono small-caps" style={{ color: "#f5f5f5", fontWeight: 600, letterSpacing: ".22em", fontSize: 13 }}>
							CLAUDE&nbsp;COCKPIT
						</span>
						<span className="cursor" />
					</div>
					<span style={{ color: "var(--dim)" }}>·</span>
					<span className="mono small-caps" style={{ color: "var(--muted)" }}>claude code im terminal</span>
				</div>
				<div
					className="mono"
					style={{
						display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px",
						border: "1px solid #2a1d12", borderRadius: 4, background: "#120c08",
						color: "var(--accent)", fontSize: 10, letterSpacing: ".16em",
					}}
				>
					<span className="live-dot" /> LIVE
				</div>
			</div>
		</div>
	);
}

/* ---------- Quick Launch: eigene Slash-Commands + Agents des Users ---------- */
function QuickLaunch(): JSX.Element {
	const [commands, setCommands] = useState<SlashCommand[]>([]);
	const [agents, setAgents] = useState<AgentDef[]>([]);

	useEffect(() => {
		setCommands(loadCommands().filter((c) => c.source !== "builtin"));
		setAgents(loadAgents());
	}, []);

	const hasContent = commands.length > 0 || agents.length > 0;

	return (
		<div style={{ margin: "8px 18px 0" }}>
			<div className="secdiv"><span>§ quick-launch</span></div>
			{!hasContent ? (
				<div className="mono" style={{ color: "var(--dim)", fontSize: 11.5, padding: "10px 2px", lineHeight: 1.6 }}>
					Noch keine eigenen Commands/Agents gefunden.<br />
					Lege welche in <span style={{ color: "var(--text)" }}>~/.claude/commands</span> oder{" "}
					<span style={{ color: "var(--text)" }}>~/.claude/agents</span> an — sie erscheinen hier automatisch.
					Unten im Terminal startest du mit <span style={{ color: "var(--accent)" }}>+</span> einen Chat.
				</div>
			) : (
				<>
					{commands.length > 0 && (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: agents.length > 0 ? 12 : 0 }}>
							{commands.slice(0, 12).map((c) => (
								<button key={c.name} className="skbtn" onClick={() => runCommand(c.name)} title={c.description}>
									<span className="dot" />
									<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
									<span className="kbd mono" style={{ textTransform: "lowercase" }}>{c.source}</span>
								</button>
							))}
						</div>
					)}
					{agents.length > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
							<span className="mono small-caps" style={{ color: "var(--dim)", fontSize: 9.5, letterSpacing: ".16em", alignSelf: "center", marginRight: 4 }}>
								AGENTS:
							</span>
							{agents.map((a) => (
								<span
									key={a.name}
									className="chip"
									title={a.description}
									style={{ borderColor: "#2a2a2a", color: a.color ?? "var(--muted)" }}
								>
									<span className="dot" style={{ background: a.color ?? "var(--accent)" }} />
									<span className="lbl" style={{ textTransform: "none" }}>{a.name}</span>
								</span>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}

/* ---------- Bottom Status Bar (generic clock) ---------- */
function StatusBar(): JSX.Element {
	useTick(1000);
	const t = new Date();
	const hh = String(t.getHours()).padStart(2, "0");
	const mm = String(t.getMinutes()).padStart(2, "0");
	const ss = String(t.getSeconds()).padStart(2, "0");
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px", borderTop: "1px solid var(--border-2)", background: "#070707", color: "var(--dim)", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
			<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
				<span><span className="live-dot green" /> &nbsp;claude code <span style={{ color: "var(--text)" }}>bereit</span></span>
				<span>terminal: <span style={{ color: "var(--text)" }}>node-pty</span></span>
			</div>
			<div style={{ display: "flex", gap: 14, alignItems: "center" }}>
				<span className="tnum">{hh}:{mm}:<span style={{ color: "var(--accent)" }}>{ss}</span></span>
			</div>
		</div>
	);
}

/* ---------- App Root ---------- */
export function App(): JSX.Element {
	return (
		<div className="pane">
			<Header />
			<div className="dashboard-scroll">
				<QuickLaunch />
			</div>
			<ChatDrawer />
			<StatusBar />
		</div>
	);
}

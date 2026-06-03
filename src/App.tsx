import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { Notice } from "obsidian";
import { Icons } from "./icons";
import { sendMessage } from "./ptySession";
import { loadTabs, tabSessionName } from "./loadChatTabs";
import { loadAgents, type AgentDef } from "./loadAgents";
import { loadCommands, type SlashCommand } from "./loadCommands";
import { loadSkills, type SkillDef } from "./loadSkills";
import { fetchTokenStats, type TokenStats } from "./ccusageLoader";
import { loadResearch, loadResearchCache, type ResearchData, type GHRepo } from "./researchLoader";
import { loadTasks, toggleTask, type TaskItem } from "./tasksLoader";
import { appendActivity, loadActivity, type ActivityEntry } from "./activityLog";
import { ChatDrawer } from "./ChatDrawer";

/* ---------- Helpers ---------- */
const fmtCompact = (n: number): string => {
	if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
	if (n >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "k";
	return String(n);
};
function fmtDuration(min: number): string {
	if (min < 1) return "< 1m";
	if (min < 60) return `${Math.round(min)}m`;
	const h = Math.floor(min / 60);
	const m = Math.round(min % 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function fmtAge(iso: string): string {
	if (iso.length === 0) return "—";
	const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
	if (!isFinite(diffMin)) return "—";
	if (diffMin < 1) return "gerade eben";
	if (diffMin < 60) return `vor ${diffMin}m`;
	const h = Math.floor(diffMin / 60);
	if (h < 24) return `vor ${h}h`;
	return `vor ${Math.floor(h / 24)}d`;
}

/* ---------- Active-session resolver + send ---------- */
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
	if (r.ok) {
		appendActivity(command, target.label, new Date().toISOString());
		new Notice(`→ ${target.label}: ${command.slice(0, 60)}`, 3000);
	} else {
		new Notice(`Senden fehlgeschlagen: ${r.error ?? "Terminal läuft nicht"}`, 6000);
	}
}

function useTick(ms = 1000): void {
	const [, set] = useState<number>(0);
	useEffect(() => {
		const id = window.setInterval(() => set((x) => x + 1), ms);
		return () => window.clearInterval(id);
	}, [ms]);
}

/* ---------- Header ---------- */
function Header({ onRefresh, fetchedAt }: { onRefresh: () => void; fetchedAt: string }): JSX.Element {
	return (
		<div style={{ padding: "14px 18px 12px" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
						<Icons.chevron />
						<span className="mono small-caps" style={{ color: "#f5f5f5", fontWeight: 600, letterSpacing: ".22em", fontSize: 13 }}>
							AGENTIC&nbsp;OS
						</span>
						<span className="cursor" />
					</div>
					<span style={{ color: "var(--dim)" }}>·</span>
					<span className="mono small-caps" style={{ color: "var(--muted)" }}>claude code kommandozentrale</span>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span className="mono" style={{ color: "var(--dim)", fontSize: 10, letterSpacing: ".08em" }}>
						sync <span style={{ color: "var(--text)" }}>{fmtAge(fetchedAt)}</span>
					</span>
					<div className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", border: "1px solid #2a1d12", borderRadius: 4, background: "#120c08", color: "var(--accent)", fontSize: 10, letterSpacing: ".16em" }}>
						<span className="live-dot" /> LIVE
					</div>
					<button className="iconbtn tooltip" title="Aktualisieren" onClick={onRefresh}>
						<Icons.refresh />
						<span className="tt">REFRESH</span>
					</button>
				</div>
			</div>
		</div>
	);
}

/* ---------- Token Burn (ECHT via ccusage) ---------- */
function TokenBurn({ tokens }: { tokens: TokenStats | null }): JSX.Element {
	useTick(1000);
	const block = tokens?.active ?? null;

	if (block === null) {
		return (
			<div style={{ margin: "4px 18px 0" }}>
				<div className="featured" style={{ padding: "18px 22px", position: "relative" }}>
					<span className="bracket tl" /><span className="bracket tr" /><span className="bracket bl" /><span className="bracket br" />
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<span className="ctitle"><Icons.flame style={{ color: "var(--accent)" }} /> 5-stunden token-verbrauch</span>
						<span className="mono" style={{ color: "var(--dim)", fontSize: 10, letterSpacing: ".1em" }}>
							{tokens?.error !== undefined ? `ccusage: ${tokens.error}` : "lädt ccusage… (erster Aufruf dauert)"}
						</span>
					</div>
				</div>
			</div>
		);
	}

	const cost = block.costUSD;
	const used = block.totalTokens;
	const proj = block.projection;
	const burn = block.burnRate;
	const start = new Date(block.startTime).getTime();
	const end = new Date(block.endTime).getTime();
	const now = Date.now();
	const totalWindowMs = end - start;
	const elapsedMs = Math.max(0, Math.min(now - start, totalWindowMs));
	const elapsedPct = totalWindowMs > 0 ? (elapsedMs / totalWindowMs) * 100 : 0;
	const remainingMin = Math.max(0, (end - now) / 60000);
	const projTokens = proj?.totalTokens ?? used;
	const tokenProgressPct = projTokens > 0 ? Math.min(100, (used / projTokens) * 100) : 0;
	const modelLabel = block.models.length > 0 ? (block.models[0] ?? "?") : "?";

	return (
		<div style={{ margin: "4px 18px 0", position: "relative" }}>
			<div className="featured" style={{ padding: "14px 18px 16px", position: "relative" }}>
				<span className="bracket tl" /><span className="bracket tr" /><span className="bracket bl" /><span className="bracket br" />
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<span className="ctitle"><Icons.flame style={{ color: "var(--accent)" }} /> 5-stunden token-verbrauch</span>
						<span className="mono" style={{ color: "var(--dim)", fontSize: 10, letterSpacing: ".1em" }}>{modelLabel.replace("claude-", "").toUpperCase()}</span>
						<span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 10 }}>
							<span className="live-dot green" /> ccusage
						</span>
					</div>
					<div className="mono" style={{ color: "var(--dim)", fontSize: 10, letterSpacing: ".08em" }}>
						reset in <span style={{ color: "var(--text)" }}>{fmtDuration(remainingMin)}</span>
						<span style={{ marginLeft: 10 }}>entries <span style={{ color: "var(--text)" }}>{block.entries}</span></span>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
					<div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
						<div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
							<span className="mono" style={{ fontSize: 18, color: "var(--accent)", opacity: 0.8 }}>$</span>
							<span className="mono tnum" style={{ fontSize: 40, lineHeight: 1, color: "var(--accent)", fontWeight: 600, textShadow: "0 0 22px rgba(255,107,26,.35)" }}>{cost.toFixed(2)}</span>
						</div>
						<span className="mono small-caps" style={{ fontSize: 9, color: "var(--dim)", letterSpacing: ".16em", marginTop: 4 }}>KOSTEN BISHER (5H)</span>
					</div>
					<div style={{ flex: 1 }}>
						<div className="hatch" style={{ position: "relative", height: 48, borderRadius: 4, border: "1px solid #232323", overflow: "hidden" }}>
							<div className="burn-fill" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: tokenProgressPct + "%", borderRadius: "3px 0 0 3px" }} />
							<div className="hatch-dim" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: elapsedPct + "%", borderRight: "1px dashed rgba(255,107,26,.45)", pointerEvents: "none" }} />
							<div className="mono" style={{ position: "absolute", left: `calc(${Math.min(elapsedPct, 88)}% + 4px)`, top: 2, fontSize: 8.5, color: "rgba(255,107,26,.78)", letterSpacing: ".08em" }}>↓ JETZT ({Math.round(elapsedPct)}%)</div>
							<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", pointerEvents: "none", padding: "0 6px 2px" }}>
								{[0, 25, 50, 75, 100].map((p) => (<span key={p} className="mono" style={{ fontSize: 8.5, color: "#5a5a5a" }}>{p}%</span>))}
							</div>
						</div>
						{burn !== null && (
							<div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
								<span className="mono" style={{ fontSize: 9.5, color: "var(--dim)", letterSpacing: ".06em" }}>
									BURN <span style={{ color: "var(--text)" }}>{fmtCompact(Math.round(burn.tokensPerMinute))}</span>/min
									<span style={{ marginLeft: 10 }}>${burn.costPerHour.toFixed(2)}/h</span>
								</span>
								{proj !== null && (
									<span className="mono" style={{ fontSize: 9.5, color: "var(--accent)", letterSpacing: ".06em" }}>
										PROJ ${proj.totalCost.toFixed(2)} · {fmtCompact(proj.totalTokens)} tok
									</span>
								)}
							</div>
						)}
					</div>
					<div style={{ textAlign: "right", minWidth: 140 }}>
						<div className="mono tnum" style={{ fontSize: 24, color: "var(--text)", lineHeight: 1, fontWeight: 500 }}>{fmtCompact(used)}</div>
						<div className="mono small-caps" style={{ fontSize: 9, color: "var(--dim)", letterSpacing: ".16em", marginTop: 4 }}>TOKENS GESAMT</div>
						<div className="mono" style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>
							<div>In <span className="tnum" style={{ color: "var(--text)" }}>{fmtCompact(block.tokenCounts.inputTokens)}</span> · Out <span className="tnum" style={{ color: "var(--text)" }}>{fmtCompact(block.tokenCounts.outputTokens)}</span></div>
							<div>Cache <span className="tnum" style={{ color: "var(--text)" }}>{fmtCompact(block.tokenCounts.cacheReadInputTokens)}</span></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- Stats row: echte Counts + ehrliche ROI ---------- */
// ROI-Annahme (vom User anpassbar im Setup). Default bewusst konservativ + klar gelabelt.
const ROI_MULTIPLIER = 20;

function StatCard({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent?: boolean }): JSX.Element {
	return (
		<div className="featured" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
			<div className="mono tnum" style={{ fontSize: 24, fontWeight: 600, color: accent === true ? "var(--accent)" : "#f5f5f5", lineHeight: 1 }}>{value}</div>
			<div className="mono small-caps" style={{ color: "var(--dim)", fontSize: 9.5, letterSpacing: ".16em" }}>{label}</div>
			{sub !== undefined && <div className="mono" style={{ color: "var(--muted)", fontSize: 9.5 }}>{sub}</div>}
		</div>
	);
}

function StatsRow({ counts, tokens }: { counts: { skills: number; agents: number; commands: number }; tokens: TokenStats | null }): JSX.Element {
	const cost = tokens?.active?.costUSD ?? 0;
	const value = cost * ROI_MULTIPLIER;
	return (
		<div style={{ margin: "12px 18px 0", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
			<StatCard value={String(counts.skills)} label="Skills" sub="~/.claude/skills" accent />
			<StatCard value={String(counts.agents)} label="Agents" sub="~/.claude/agents" />
			<StatCard value={String(counts.commands)} label="Commands" sub="eigene slash-cmds" />
			<StatCard value={`$${value.toFixed(0)}`} label="Geschätzter Wert" sub={`Annahme ${ROI_MULTIPLIER}× · anpassbar`} accent />
		</div>
	);
}

/* ---------- Skill Grid (ECHT, kategorisiert) ---------- */
function SkillGrid({ skills }: { skills: SkillDef[] }): JSX.Element {
	const byCat: Record<string, SkillDef[]> = {};
	for (const s of skills) (byCat[s.category] ??= []).push(s);
	const cats = Object.keys(byCat).sort();

	return (
		<div style={{ margin: "14px 18px 0" }}>
			<div className="secdiv"><span>§ skill-matrix · {skills.length} skills · klick → aktives terminal</span></div>
			{skills.length === 0 ? (
				<div className="mono" style={{ color: "var(--dim)", fontSize: 11.5, padding: "8px 2px", lineHeight: 1.6 }}>
					Keine Skills in <span style={{ color: "var(--text)" }}>~/.claude/skills</span> gefunden.
					Sag deinem Claude Code, welche Skills du willst — sie erscheinen hier automatisch.
				</div>
			) : (
				cats.map((cat) => (
					<div key={cat} style={{ marginTop: 8 }}>
						<div className="mono small-caps" style={{ color: "var(--dim)", fontSize: 9, letterSpacing: ".18em", marginBottom: 5 }}>{cat}</div>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 7 }}>
							{(byCat[cat] ?? []).map((s) => (
								<button key={s.name} className="skbtn" onClick={() => runCommand(`/${s.name}`)} title={`Skill "${s.name}" ans aktive Terminal senden`}>
									<span className="dot" />
									<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
								</button>
							))}
						</div>
					</div>
				))
			)}
		</div>
	);
}

/* ---------- Research Feed (ECHT via GitHub) ---------- */
function repoAge(iso: string): string {
	const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
	if (!isFinite(d)) return "";
	if (d <= 0) return "heute";
	if (d === 1) return "1d";
	if (d < 30) return `${d}d`;
	return `${Math.floor(d / 30)}mo`;
}
function RepoCard({ r }: { r: GHRepo }): JSX.Element {
	const open = (): void => { try { window.open(r.url, "_blank"); } catch (_) { /* */ } };
	return (
		<button className="featured" onClick={open} style={{ padding: "10px 12px", textAlign: "left", display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", border: "1px solid var(--border-2)" }} title={r.url}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
				<span className="mono" style={{ fontSize: 12, color: "#f5f5f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
				<span className="mono tnum" style={{ fontSize: 10, color: "var(--accent)", flexShrink: 0 }}>★ {fmtCompact(r.stars)}</span>
			</div>
			<span className="mono" style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{r.description.length > 0 ? r.description : "—"}</span>
			<div style={{ display: "flex", gap: 10 }}>
				<span className="mono" style={{ fontSize: 9, color: "var(--dim)" }}>{r.owner}</span>
				{r.language.length > 0 && <span className="mono" style={{ fontSize: 9, color: "var(--dim)" }}>{r.language}</span>}
				<span className="mono" style={{ fontSize: 9, color: "var(--dim)" }}>↑ {repoAge(r.pushed_at)}</span>
			</div>
		</button>
	);
}
function ResearchFeed({ research }: { research: ResearchData | null }): JSX.Element {
	const sections = research?.sections.filter((s) => s.items.length > 0) ?? [];
	return (
		<div className="featured" style={{ padding: "12px 14px" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
				<span className="ctitle"><Icons.search style={{ color: "var(--accent)" }} /> research · claude-ökosystem</span>
				<span className="mono" style={{ color: "var(--dim)", fontSize: 9, letterSpacing: ".08em" }}>github · live</span>
			</div>
			{sections.length === 0 ? (
				<div className="mono" style={{ color: "var(--dim)", fontSize: 11, padding: "6px 0" }}>
					{research?.error ?? "lädt frische Repos…"}
				</div>
			) : (
				sections.slice(0, 1).map((sec) => (
					<div key={sec.id}>
						<div className="mono small-caps" style={{ color: "var(--dim)", fontSize: 9, letterSpacing: ".16em", marginBottom: 6 }}>{sec.title}</div>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
							{sec.items.slice(0, 6).map((r) => (<RepoCard key={r.url} r={r} />))}
						</div>
					</div>
				))
			)}
		</div>
	);
}

/* ---------- Daily Tasks (ECHT via Vault-MD) ---------- */
function TasksWidget({ tasks, onToggle }: { tasks: TaskItem[]; onToggle: (line: number) => void }): JSX.Element {
	const done = tasks.filter((t) => t.done).length;
	const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
	return (
		<div className="featured" style={{ padding: "12px 14px" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
				<span className="ctitle"><Icons.checkBox style={{ color: "var(--accent)" }} /> tagesaufgaben</span>
				<span className="mono tnum" style={{ color: "var(--muted)", fontSize: 10 }}><span style={{ color: "var(--accent)" }}>{done}</span>/{tasks.length} · {pct}%</span>
			</div>
			<div style={{ height: 3, background: "#161616", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
				<div style={{ width: pct + "%", height: "100%", background: "var(--accent)", boxShadow: "0 0 8px var(--accent)", transition: "width .25s" }} />
			</div>
			{tasks.length === 0 ? (
				<div className="mono" style={{ color: "var(--dim)", fontSize: 10.5 }}>Öffne den Vault → „Agentic OS Tasks.md" wird beim ersten Mal angelegt.</div>
			) : (
				tasks.map((t) => (
					<div key={t.line} onClick={() => onToggle(t.line)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px dashed #1c1c1c", cursor: "pointer" }}>
						<span className={"chk " + (t.done ? "on" : "")}><Icons.check /></span>
						<span style={{ fontSize: 12.5, color: t.done ? "var(--dim)" : "var(--text)", textDecoration: t.done ? "line-through" : "none", flex: 1 }}>{t.text}</span>
					</div>
				))
			)}
			<div className="mono" style={{ fontSize: 9, color: "var(--dim)", marginTop: 8, letterSpacing: ".06em" }}>echte Vault-Notiz · editier sie direkt in Obsidian</div>
		</div>
	);
}

/* ---------- Recent Runs (ECHT, lokales Log) ---------- */
function RecentRuns({ activity }: { activity: ActivityEntry[] }): JSX.Element {
	return (
		<div className="featured" style={{ padding: "12px 14px" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
				<span className="ctitle"><Icons.bolt style={{ color: "var(--accent)" }} /> letzte runs</span>
				<span className="mono" style={{ color: "var(--dim)", fontSize: 9 }}>{activity.length}</span>
			</div>
			{activity.length === 0 ? (
				<div className="mono" style={{ color: "var(--dim)", fontSize: 10.5, lineHeight: 1.6 }}>Noch nichts gesendet. Klick oben einen Skill — er erscheint hier.</div>
			) : (
				activity.slice(0, 8).map((a, i) => (
					<div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "4px 0", borderBottom: "1px dashed #1c1c1c" }}>
						<span className="mono" style={{ fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
						<span className="mono" style={{ fontSize: 9, color: "var(--dim)", flexShrink: 0 }}>{a.target} · {fmtAge(a.at)}</span>
					</div>
				))
			)}
		</div>
	);
}

/* ---------- Bottom status bar ---------- */
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
	const [tokens, setTokens] = useState<TokenStats | null>(null);
	const [research, setResearch] = useState<ResearchData | null>(() => loadResearchCache());
	const [skills, setSkills] = useState<SkillDef[]>([]);
	const [agents, setAgents] = useState<AgentDef[]>([]);
	const [commands, setCommands] = useState<SlashCommand[]>([]);
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [activity, setActivity] = useState<ActivityEntry[]>([]);

	const refreshTokens = useCallback((): void => {
		void fetchTokenStats(new Date().toISOString()).then(setTokens);
	}, []);
	const refreshResearch = useCallback((force = false): void => {
		const now = new Date();
		void loadResearch(now.toISOString(), now.getTime(), force).then(setResearch);
	}, []);

	useEffect(() => {
		setSkills(loadSkills());
		setAgents(loadAgents());
		setCommands(loadCommands());
		setTasks(loadTasks());
		setActivity(loadActivity());
		refreshTokens();
		refreshResearch(false);
		const tokenId = window.setInterval(refreshTokens, 60_000);
		const localId = window.setInterval(() => { setTasks(loadTasks()); setActivity(loadActivity()); }, 4000);
		return () => { window.clearInterval(tokenId); window.clearInterval(localId); };
	}, [refreshTokens, refreshResearch]);

	const onToggleTask = useCallback((line: number): void => {
		toggleTask(line);
		setTasks(loadTasks());
	}, []);

	const onRefresh = useCallback((): void => {
		refreshTokens();
		refreshResearch(true);
		setSkills(loadSkills());
		setTasks(loadTasks());
		setActivity(loadActivity());
	}, [refreshTokens, refreshResearch]);

	const counts = { skills: skills.length, agents: agents.length, commands: commands.filter((c) => c.source !== "builtin").length };

	return (
		<div className="pane">
			<Header onRefresh={onRefresh} fetchedAt={tokens?.fetched_at ?? ""} />
			<div className="dashboard-scroll">
				<TokenBurn tokens={tokens} />
				<StatsRow counts={counts} tokens={tokens} />
				<SkillGrid skills={skills} />
				<div style={{ margin: "14px 18px 18px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
					<ResearchFeed research={research} />
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						<TasksWidget tasks={tasks} onToggle={onToggleTask} />
						<RecentRuns activity={activity} />
					</div>
				</div>
			</div>
			<ChatDrawer />
			<StatusBar />
		</div>
	);
}

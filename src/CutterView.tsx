import * as React from "react";
import { useEffect, useState } from "react";
import {
	COCKPIT_URL,
	IS_SUPPORTED,
	cockpitStatus,
	cutterDir,
	listWorkdirs,
	readManifest,
	startCockpit,
	stopCockpit,
	waitForCockpit,
	writeManifest,
	type WorkdirEntry,
} from "./loadCutter";

type Phase =
	| { kind: "checking" }
	| { kind: "nodir" }
	| { kind: "launcher"; error?: string }
	| { kind: "starting"; name: string }
	| { kind: "running"; workdir?: string };

/**
 * CUTTER-Tab: bettet das Cut-Cockpit des claude-video-cutter-Setups
 * (github.com/sebaskauf/claude-video-cutter, localhost:8766) als iframe ein.
 * Läuft kein Server, zeigt der Launcher die cockpit-fähigen Workdirs und
 * startet den Server per Klick (src-Video-Pfad kommt aus cockpit.json).
 */
export function CutterView(): JSX.Element {
	const [phase, setPhase] = useState<Phase>({ kind: "checking" });
	const [workdirs, setWorkdirs] = useState<WorkdirEntry[]>([]);
	const [dir, setDir] = useState<string | null>(null);
	// Workdir ohne Manifest angeklickt → src-Video-Pfad einmalig abfragen.
	const [pendingSrc, setPendingSrc] = useState<{ wd: WorkdirEntry; value: string } | null>(null);
	const [confirmSwitch, setConfirmSwitch] = useState<boolean>(false);

	const check = async (): Promise<void> => {
		const d = cutterDir();
		setDir(d);
		const s = await cockpitStatus();
		if (s.running) {
			setPhase({ kind: "running", workdir: s.workdir });
			return;
		}
		if (d === null) {
			setPhase({ kind: "nodir" });
			return;
		}
		setWorkdirs(listWorkdirs(d));
		setPhase({ kind: "launcher" });
	};
	useEffect(() => {
		void check();
	}, []);

	const launch = async (wd: WorkdirEntry, srcVideo: string): Promise<void> => {
		if (dir === null) return;
		writeManifest(wd.path, { ...(readManifest(wd.path) ?? { src_video: "" }), src_video: srcVideo });
		setPhase({ kind: "starting", name: wd.name });
		const r = startCockpit(dir, wd.path, srcVideo);
		if (!r.ok) {
			setWorkdirs(listWorkdirs(dir));
			setPhase({ kind: "launcher", error: r.error });
			return;
		}
		const up = await waitForCockpit();
		if (up) {
			setPhase({ kind: "running", workdir: wd.path });
		} else {
			setWorkdirs(listWorkdirs(dir));
			setPhase({ kind: "launcher", error: "Server antwortet nicht — cockpit.log im Workdir prüfen" });
		}
	};

	const onPick = (wd: WorkdirEntry): void => {
		const src = readManifest(wd.path)?.src_video ?? "";
		if (src !== "") void launch(wd, src);
		else setPendingSrc({ wd, value: "" });
	};

	const doSwitch = (): void => {
		setConfirmSwitch(false);
		stopCockpit();
		window.setTimeout(() => {
			if (dir !== null) setWorkdirs(listWorkdirs(dir));
			setPhase(dir === null ? { kind: "nodir" } : { kind: "launcher" });
		}, 800);
	};

	const wdLabel =
		phase.kind === "running" && phase.workdir !== undefined ? phase.workdir.split("/").pop() : undefined;

	return (
		<div className="cutter-view">
			<div className="cutter-main">
				{phase.kind === "checking" && <div className="cutter-msg mono">prüfe cockpit…</div>}

				{phase.kind === "nodir" && (
					<div className="cutter-msg mono">
						claude-video-cutter nicht gefunden.
						<br />
						<br />
						Setup: github.com/sebaskauf/claude-video-cutter klonen und die INSTALL.md von deinem Claude
						Code ausführen lassen — für diesen Tab zusätzlich die INSTALL-AGENTIC-OS.md (sie hinterlegt
						den Pfad in ~/.claude-video-cutter-path).
						{!IS_SUPPORTED && (
							<>
								<br />
								<br />
								Hinweis: Der CUTTER-Tab läuft auf macOS und Windows — auf anderen Systemen nutzt du das
								Cockpit im Browser (127.0.0.1:8766).
							</>
						)}
					</div>
				)}

				{phase.kind === "starting" && <div className="cutter-msg mono">starte cockpit · {phase.name}…</div>}

				{phase.kind === "launcher" && (
					<div className="cutter-launcher">
						<div className="cutter-launcher-head mono">KEIN COCKPIT AKTIV — PROJEKT WÄHLEN</div>
						{phase.error !== undefined && <div className="cutter-error mono">{phase.error}</div>}
						{pendingSrc !== null ? (
							<div className="cutter-src-ask">
								<div className="mono">
									Quell-Video für <b>{pendingSrc.wd.name}</b> (voller Pfad zum Original):
								</div>
								<input
									className="cutter-src-input mono"
									value={pendingSrc.value}
									placeholder="/Users/…/Original.mov"
									onChange={(e) => setPendingSrc({ ...pendingSrc, value: e.target.value })}
								/>
								<div className="cutter-src-btns">
									<button
										className="cutter-btn"
										onClick={() => {
											const p = pendingSrc;
											setPendingSrc(null);
											void launch(p.wd, p.value.trim());
										}}
									>
										STARTEN
									</button>
									<button className="cutter-btn" onClick={() => setPendingSrc(null)}>
										ABBRECHEN
									</button>
								</div>
							</div>
						) : (
							<div className="cutter-wd-list">
								{workdirs
									.filter((w) => w.ready)
									.map((w) => (
										<button key={w.path} className="cutter-wd-row" onClick={() => onPick(w)}>
											<span className="mono">{w.name}</span>
											<span className="mono cutter-wd-meta">
												{w.srcVideo !== undefined ? "manifest ✓" : "src-video fehlt"}
											</span>
										</button>
									))}
								{workdirs.filter((w) => w.ready).length === 0 && (
									<div className="cutter-msg mono">
										Noch keine geschnittenen Projekte in work/ — sag deinem Claude Code:
										„schneide das Video /Pfad/zum/video.mov“. Danach taucht das Projekt hier auf.
									</div>
								)}
							</div>
						)}
					</div>
				)}

				{phase.kind === "running" && (
					<>
						<div className="cutter-bar">
							<span className="mono cutter-bar-label">COCKPIT · {wdLabel ?? "läuft"} · 127.0.0.1:8766</span>
							{confirmSwitch ? (
								<span className="cutter-bar-confirm mono">
									Server beenden? Ungespeicherte Änderungen im Cockpit gehen verloren.
									<button className="cutter-btn" onClick={doSwitch}>
										JA, WECHSELN
									</button>
									<button className="cutter-btn" onClick={() => setConfirmSwitch(false)}>
										ABBRECHEN
									</button>
								</span>
							) : (
								<button className="cutter-btn" onClick={() => setConfirmSwitch(true)}>
									PROJEKT WECHSELN
								</button>
							)}
						</div>
						<iframe className="cutter-frame" src={COCKPIT_URL} title="Cut-Cockpit" />
					</>
				)}
			</div>
		</div>
	);
}

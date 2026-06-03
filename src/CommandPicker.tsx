import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { type SlashCommand, filterCommands } from "./loadCommands";

interface CommandPickerProps {
	commands: SlashCommand[];
	query: string;          // current input value (starts with /)
	onSelect: (cmd: SlashCommand) => void;
	onSendRaw: () => void;  // user wants to send the unknown /command to claude as-is
	onClose: () => void;
}

export function CommandPicker({ commands, query, onSelect, onSendRaw, onClose }: CommandPickerProps): JSX.Element | null {
	const filtered = filterCommands(commands, query);
	const [hoveredIdx, setHoveredIdx] = useState<number>(0);
	const listRef = useRef<HTMLDivElement | null>(null);

	// Reset hover when filter changes
	useEffect(() => {
		setHoveredIdx(0);
	}, [query]);

	// Keyboard navigation (arrow up/down + enter + esc)
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (filtered.length === 0) {
				// 0 matches: Enter sends raw text to claude (user might know an unlisted slash-command)
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					e.stopPropagation();
					onSendRaw();
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					onClose();
				}
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				setHoveredIdx((i) => Math.min(i + 1, filtered.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				setHoveredIdx((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter" && !e.shiftKey) {
				const cmd = filtered[hoveredIdx];
				if (cmd !== undefined) {
					e.preventDefault();
					e.stopPropagation();
					onSelect(cmd);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			} else if (e.key === "Tab") {
				const cmd = filtered[hoveredIdx];
				if (cmd !== undefined) {
					e.preventDefault();
					e.stopPropagation();
					onSelect(cmd);
				}
			}
		};
		// Capture phase so we win over textarea
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [filtered, hoveredIdx, onSelect, onSendRaw, onClose]);

	// Scroll hovered into view
	useEffect(() => {
		if (listRef.current === null) return;
		const item = listRef.current.querySelector<HTMLDivElement>(`[data-idx="${hoveredIdx}"]`);
		if (item !== null) {
			item.scrollIntoView({ block: "nearest", behavior: "auto" });
		}
	}, [hoveredIdx]);

	if (filtered.length === 0) {
		return (
			<div className="command-picker">
				<div className="command-picker-empty">
					<div style={{ marginBottom: 8 }}>Kein bekannter Command — möglicherweise ein Plugin- oder Custom-Command.</div>
					<button
						className="command-picker-sendraw"
						onClick={onSendRaw}
					>
						Trotzdem an claude senden (Enter)
					</button>
					<div style={{ marginTop: 8, fontSize: 10, color: "var(--dim)" }}>oder Esc zum schließen</div>
				</div>
			</div>
		);
	}

	return (
		<div className="command-picker" ref={listRef}>
			<div className="command-picker-header">
				<span className="mono small-caps" style={{ color: "var(--dim)", letterSpacing: ".16em", fontSize: 9.5 }}>
					{filtered.length} commands · ↑↓ navigieren · enter/tab wählen · esc schließen
				</span>
			</div>
			{filtered.map((cmd, i) => {
				const sourceLabel = cmd.source === "builtin" ? "BUILT-IN" : cmd.source === "user" ? "USER" : `PLUGIN: ${cmd.pluginName ?? "?"}`;
				return (
					<div
						key={cmd.name}
						data-idx={i}
						className={"command-picker-row " + (i === hoveredIdx ? "active" : "")}
						onMouseEnter={() => setHoveredIdx(i)}
						onClick={() => onSelect(cmd)}
					>
						<span className="cmd-name mono">{cmd.name}</span>
						{cmd.description.length > 0 && (
							<span className="cmd-desc">{cmd.description}</span>
						)}
						<span className="cmd-source mono">{sourceLabel}</span>
					</div>
				);
			})}
		</div>
	);
}

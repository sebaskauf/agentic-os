import * as React from "react";
import { useEffect, useState, useRef } from "react";
import { type FileEntry, filterFiles } from "./loadFiles";

interface FilePickerProps {
	files: FileEntry[];
	query: string;
	onSelect: (file: FileEntry) => void;
	onClose: () => void;
}

export function FilePicker({ files, query, onSelect, onClose }: FilePickerProps): JSX.Element {
	const filtered = filterFiles(files, query);
	const [hoveredIdx, setHoveredIdx] = useState<number>(0);
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => { setHoveredIdx(0); }, [query]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (filtered.length === 0) {
				if (e.key === "Escape") {
					e.stopPropagation();
					onClose();
				}
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault(); e.stopPropagation();
				setHoveredIdx((i) => Math.min(i + 1, filtered.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault(); e.stopPropagation();
				setHoveredIdx((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter" && !e.shiftKey) {
				const f = filtered[hoveredIdx];
				if (f !== undefined) {
					e.preventDefault(); e.stopPropagation();
					onSelect(f);
				}
			} else if (e.key === "Tab") {
				const f = filtered[hoveredIdx];
				if (f !== undefined) {
					e.preventDefault(); e.stopPropagation();
					onSelect(f);
				}
			} else if (e.key === "Escape") {
				e.preventDefault(); e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [filtered, hoveredIdx, onSelect, onClose]);

	useEffect(() => {
		if (listRef.current === null) return;
		const item = listRef.current.querySelector<HTMLDivElement>(`[data-idx="${hoveredIdx}"]`);
		if (item !== null) item.scrollIntoView({ block: "nearest" });
	}, [hoveredIdx]);

	if (filtered.length === 0) {
		return (
			<div className="command-picker">
				<div className="command-picker-empty">Keine Files matched. Esc zum schließen.</div>
			</div>
		);
	}

	return (
		<div className="command-picker" ref={listRef}>
			<div className="command-picker-header">
				<span className="mono small-caps" style={{ color: "var(--dim)", letterSpacing: ".16em", fontSize: 9.5 }}>
					{filtered.length} files · ↑↓ · enter/tab · esc
				</span>
			</div>
			{filtered.map((f, i) => (
				<div
					key={f.path}
					data-idx={i}
					className={"command-picker-row " + (i === hoveredIdx ? "active" : "")}
					onMouseEnter={() => setHoveredIdx(i)}
					onClick={() => onSelect(f)}
				>
					<span className="cmd-name mono">{f.name}</span>
					<span className="cmd-desc">{f.relPath.length > 60 ? "…" + f.relPath.slice(-58) : f.relPath}</span>
				</div>
			))}
		</div>
	);
}

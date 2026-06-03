import * as React from "react";
import { useEffect, useState } from "react";

export interface SelectOption {
	value: string;
	label: string;
	description?: string;
	hint?: string;
	color?: string;
	active?: boolean;
}

interface SelectModalProps {
	title: string;
	subtitle?: string;
	options: SelectOption[];
	onSelect: (value: string) => void;
	onClose: () => void;
}

/**
 * Generic single-select modal. Used by ModelPicker, EffortPicker, PermissionPicker.
 * Renders centered overlay with title + list of cards.
 */
export function SelectModal({ title, subtitle, options, onSelect, onClose }: SelectModalProps): JSX.Element {
	// Start with the active option highlighted, or first
	const initialIdx = Math.max(0, options.findIndex((o) => o.active === true));
	const [hoveredIdx, setHoveredIdx] = useState<number>(initialIdx);

	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				setHoveredIdx((i) => Math.min(i + 1, options.length - 1));
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				setHoveredIdx((i) => Math.max(i - 1, 0));
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				const opt = options[hoveredIdx];
				if (opt !== undefined) onSelect(opt.value);
				return;
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [onClose, onSelect, options, hoveredIdx]);

	return (
		<div className="agent-picker-overlay" onClick={onClose}>
			<div className="agent-picker select-modal" onClick={(e) => e.stopPropagation()}>
				<div className="select-modal-header">
					<span className="mono small-caps" style={{ color: "var(--accent)", letterSpacing: ".2em", fontSize: 11 }}>
						{title}
					</span>
					{subtitle !== undefined && (
						<span className="mono" style={{ color: "var(--dim)", fontSize: 10, marginLeft: 12 }}>
							{subtitle}
						</span>
					)}
				</div>
				<div className="select-modal-list">
					{options.map((opt, i) => (
						<button
							key={opt.value}
							className={"picker-row select-option" + (opt.active === true ? " active" : "") + (i === hoveredIdx ? " hovered" : "")}
							onClick={() => onSelect(opt.value)}
							onMouseEnter={() => setHoveredIdx(i)}
						>
							<span className="dot" style={{ background: opt.color ?? (opt.active === true ? "var(--accent)" : "var(--dim)") }} />
							<div style={{ display: "flex", flexDirection: "column", textAlign: "left", flex: 1 }}>
								<span className="mono select-option-label">{opt.label}</span>
								{opt.description !== undefined && (
									<span className="mono select-option-desc">{opt.description}</span>
								)}
							</div>
							{opt.hint !== undefined && (
								<span className="mono select-option-hint">{opt.hint}</span>
							)}
						</button>
					))}
				</div>
				<div className="select-modal-footer">
					<span className="mono" style={{ color: "var(--dim)", fontSize: 9, letterSpacing: ".14em" }}>
						ESC ZUM SCHLIEẞEN
					</span>
				</div>
			</div>
		</div>
	);
}

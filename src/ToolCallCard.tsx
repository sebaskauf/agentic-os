import * as React from "react";

interface ToolCallCardProps {
	tool: string;
	summary: string;
	expandHint?: string;
	onExpand?: () => void;
}

/**
 * Flat terminal-style tool-call rendering. Looks like claude TUI:
 *   ● ToolName(args)
 *   ⎿ result (ctrl+o to expand)
 * No card-background, no emoji icons, no colored borders. Just mono text.
 */
export function ToolCallCard({ tool, summary, expandHint, onExpand }: ToolCallCardProps): JSX.Element {
	const displayName = toolDisplayName(tool);
	return (
		<div className="tool-line">
			<span className="tool-line-marker">●</span>
			<span className="tool-line-name">{displayName}</span>
			<span className="tool-line-args">({summary || "…"})</span>
			{expandHint !== undefined && onExpand !== undefined && (
				<button className="tool-line-expand" onClick={onExpand} title="Details (ctrl+o)">
					expand
				</button>
			)}
		</div>
	);
}

function toolDisplayName(tool: string): string {
	if (tool.startsWith("mcp__")) {
		const parts = tool.split("__");
		return `mcp:${parts[1] ?? "?"}:${parts.slice(2).join("/") || "?"}`;
	}
	return tool;
}

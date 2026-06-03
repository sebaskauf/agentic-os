import { spawn } from "child_process";
import { resolveBinary, spawnEnv, isWin } from "./platform";

/**
 * Echte Token-/Kosten-Daten generisch via ccusage — spawnt `npx ccusage@latest blocks
 * --active --json` direkt (ersetzt Sebastians ~/.skaile-Pipeline). Liest die lokale
 * Claude-Code-Nutzung aus ~/.claude. Null Sebastian-Spezifik.
 */

export interface TokenBlock {
	startTime: string;
	endTime: string;
	costUSD: number;
	totalTokens: number;
	entries: number;
	isActive: boolean;
	models: string[];
	tokenCounts: {
		inputTokens: number;
		outputTokens: number;
		cacheCreationInputTokens: number;
		cacheReadInputTokens: number;
	};
	burnRate: {
		costPerHour: number;
		tokensPerMinute: number;
	} | null;
	projection: {
		totalCost: number;
		totalTokens: number;
		remainingMinutes: number;
	} | null;
}

export interface TokenStats {
	fetched_at: string;
	active: TokenBlock | null;
	error?: string;
}

interface RawBlock {
	startTime?: string;
	endTime?: string;
	costUSD?: number;
	totalTokens?: number;
	entries?: number;
	isActive?: boolean;
	models?: string[];
	tokenCounts?: Partial<TokenBlock["tokenCounts"]>;
	burnRate?: { costPerHour?: number; tokensPerMinute?: number } | null;
	projection?: { totalCost?: number; totalTokens?: number; remainingMinutes?: number } | null;
}

function num(v: unknown): number {
	return typeof v === "number" && isFinite(v) ? v : 0;
}

function mapBlock(b: RawBlock): TokenBlock {
	const tc = b.tokenCounts ?? {};
	return {
		startTime: b.startTime ?? "",
		endTime: b.endTime ?? "",
		costUSD: num(b.costUSD),
		totalTokens: num(b.totalTokens),
		entries: num(b.entries),
		isActive: b.isActive === true,
		models: Array.isArray(b.models) ? b.models : [],
		tokenCounts: {
			inputTokens: num(tc.inputTokens),
			outputTokens: num(tc.outputTokens),
			cacheCreationInputTokens: num(tc.cacheCreationInputTokens),
			cacheReadInputTokens: num(tc.cacheReadInputTokens),
		},
		burnRate: b.burnRate
			? { costPerHour: num(b.burnRate.costPerHour), tokensPerMinute: num(b.burnRate.tokensPerMinute) }
			: null,
		projection: b.projection
			? { totalCost: num(b.projection.totalCost), totalTokens: num(b.projection.totalTokens), remainingMinutes: num(b.projection.remainingMinutes) }
			: null,
	};
}

/**
 * Spawnt ccusage und liefert den aktiven 5h-Block. nowIso = aktuelle Zeit (vom Caller,
 * da der Loader sonst keine Zeit hat — Plugin uebergibt new Date().toISOString()).
 * Timeout-geschuetzt; bei Fehler { active:null, error }.
 */
export function fetchTokenStats(nowIso: string): Promise<TokenStats> {
	return new Promise((resolve) => {
		const npx = resolveBinary("npx") ?? (isWin ? "npx.cmd" : "npx");
		let out = "";
		let err = "";
		let done = false;
		const finish = (stats: TokenStats): void => {
			if (done) return;
			done = true;
			resolve(stats);
		};

		let child;
		try {
			child = spawn(npx, ["-y", "ccusage@latest", "blocks", "--active", "--json"], {
				env: spawnEnv(),
				windowsHide: true,
			});
		} catch (e) {
			finish({ fetched_at: nowIso, active: null, error: e instanceof Error ? e.message : String(e) });
			return;
		}

		const killTimer = setTimeout(() => {
			try { child.kill(); } catch (_) { /* */ }
			finish({ fetched_at: nowIso, active: null, error: "ccusage timeout (>45s)" });
		}, 45000);

		child.stdout?.on("data", (b: Buffer) => { out += b.toString(); });
		child.stderr?.on("data", (b: Buffer) => { err += b.toString(); });
		child.on("error", (e: Error) => {
			clearTimeout(killTimer);
			finish({ fetched_at: nowIso, active: null, error: e.message });
		});
		child.on("close", () => {
			clearTimeout(killTimer);
			try {
				const json = JSON.parse(out) as { blocks?: RawBlock[] };
				const blocks = Array.isArray(json.blocks) ? json.blocks : [];
				const active = blocks.find((b) => b.isActive === true) ?? null;
				finish({ fetched_at: nowIso, active: active !== null ? mapBlock(active) : null });
			} catch (e) {
				finish({
					fetched_at: nowIso,
					active: null,
					error: err.length > 0 ? err.slice(0, 120) : (e instanceof Error ? e.message : "parse error"),
				});
			}
		});
	});
}

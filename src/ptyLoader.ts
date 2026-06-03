import * as path from "path";
import { existsSync, chmodSync } from "fs";
import { Notice } from "obsidian";
import { isMac } from "./platform";

/**
 * Laedt das native node-pty-Modul. node-pty ist ein N-API-Addon (ABI-stabil),
 * daher kein electron-rebuild noetig — die mitgelieferten Prebuilds laufen
 * direkt unter Electron 39 (verifiziert).
 *
 * Lade-Strategie:
 *   1. native/<platform>-<arch>/lib/index.js  (ausgeliefertes Prebuild — Distributions-Pfad)
 *   2. require("node-pty")                     (node_modules — Dev-Fallback)
 *
 * esbuild laesst das Bundle die Prebuilds NICHT inlinen (natives .node) → wir
 * laden zur Laufzeit via window.require (Electron-Renderer-require, von esbuild
 * unangetastet, da kein bare require-Literal).
 */

type NodePty = typeof import("node-pty");

// Electron-Renderer-require (nodeIntegration). Von esbuild nicht angefasst.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeRequire: NodeRequire = (window as any).require;

let cached: NodePty | null = null;
let loadError: string | null = null;

/** Plugin-Verzeichnis (wo main.js + native/ liegen) ueber den globalen Obsidian-app. */
function getPluginDir(): string {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const app = (window as any).app;
		const adapter = app?.vault?.adapter;
		if (adapter !== undefined && typeof adapter.getBasePath === "function") {
			return path.join(adapter.getBasePath(), app.vault.configDir, "plugins", "claude-cockpit");
		}
	} catch (_) { /* ignore */ }
	return "";
}

/** macOS-Sicherheitsnetz: zip/git koennen das x-Bit verlieren → spawn-helper + pty.node ausfuehrbar machen. */
function chmodMacBinaries(nativeArchDir: string, arch: string): void {
	if (!isMac) return;
	const prebuildDir = path.join(nativeArchDir, "prebuilds", `darwin-${arch}`);
	for (const f of ["pty.node", "spawn-helper"]) {
		const full = path.join(prebuildDir, f);
		try { if (existsSync(full)) chmodSync(full, 0o755); } catch (_) { /* ignore */ }
	}
}

/**
 * Laedt node-pty (cached). Wirft NICHT — bei Fehler null + Notice, sodass das
 * Plugin nicht komplett crasht (Dashboard bleibt nutzbar, nur Terminal tot).
 */
export function loadPty(): NodePty | null {
	if (cached !== null) return cached;
	if (loadError !== null) return null;

	const platArch = `${process.platform}-${process.arch}`;
	const pluginDir = getPluginDir();

	// 1) Distributions-Pfad: native/<plat>-<arch>/lib/index.js
	if (pluginDir.length > 0) {
		const nativeArchDir = path.join(pluginDir, "native", platArch);
		const entry = path.join(nativeArchDir, "lib", "index.js");
		if (existsSync(entry)) {
			chmodMacBinaries(nativeArchDir, process.arch);
			try {
				cached = nodeRequire(entry) as NodePty;
				console.log(`[claude-cockpit] node-pty geladen aus native/${platArch}`);
				return cached;
			} catch (e) {
				console.error(`[claude-cockpit] native/${platArch} laden fehlgeschlagen:`, e);
			}
		}
	}

	// 2) Dev-Fallback: node_modules/node-pty
	try {
		cached = nodeRequire("node-pty") as NodePty;
		console.log("[claude-cockpit] node-pty geladen aus node_modules (Dev-Fallback)");
		return cached;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		loadError = msg;
		console.error("[claude-cockpit] node-pty konnte nicht geladen werden:", msg);
		const hint = /NODE_MODULE_VERSION|different Node\.js/i.test(msg)
			? "ABI-Mismatch — Plugin gegen falsche Electron-Version gebaut."
			: `Prebuild fehlt fuer ${platArch}?`;
		new Notice(`Agentic OS: Terminal konnte nicht starten. ${hint}`, 10000);
		return null;
	}
}

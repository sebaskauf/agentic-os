import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	DEFAULT_FONT_SIZE,
	DEFAULT_THEME,
	TERMINAL_SETTINGS_FILE,
	loadStoredTerminalSettings,
	reloadTerminalSettings,
	saveStoredTerminalSettings,
	type StoredTerminalSettings,
	type TerminalColorKey,
} from "./terminalSettings";

const SIX_DIGIT_HEX = /^#[0-9a-fA-F]{6}$/;

/** Die Farben, die direkt in den Einstellungen wählbar sind. Alle weiteren gehen über die Datei. */
const PICKER_COLORS: { key: TerminalColorKey; name: string; desc: string }[] = [
	{ key: "background", name: "Hintergrund", desc: "Hintergrundfarbe des Terminals." },
	{ key: "foreground", name: "Text", desc: "Normale Schriftfarbe." },
	{ key: "cursor", name: "Cursor", desc: "Farbe des blinkenden Cursors." },
	{ key: "selectionBackground", name: "Markierung", desc: "Hintergrund von markiertem Text." },
];

export class AgenticOsSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
	}

	private current(): StoredTerminalSettings {
		const s = loadStoredTerminalSettings();
		return { ...s, colors: { ...(s.colors ?? {}) } };
	}

	/** Nur Abweichungen vom Standard speichern, damit künftige Standard-Updates weiter ankommen. */
	private setColor(key: TerminalColorKey, value: string | null): void {
		const next = this.current();
		const colors = next.colors ?? {};
		const def = DEFAULT_THEME[key];
		if (value === null || (typeof def === "string" && def.toLowerCase() === value.toLowerCase())) {
			delete colors[key];
		} else {
			colors[key] = value;
		}
		next.colors = colors;
		saveStoredTerminalSettings(next);
	}

	private setFontSize(value: number | null): void {
		const next = this.current();
		if (value === null || value === DEFAULT_FONT_SIZE) delete next.fontSize;
		else next.fontSize = value;
		saveStoredTerminalSettings(next);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Terminal").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Gilt für alle Chat-Terminals im Agentic OS. Änderungen wirken sofort und bleiben bei Plugin-Updates erhalten.",
		});

		const stored = loadStoredTerminalSettings();

		new Setting(containerEl)
			.setName("Schriftgröße")
			.setDesc(`Standard ist ${String(DEFAULT_FONT_SIZE).replace(".", ",")}.`)
			.addSlider((slider) => slider
				.setLimits(9, 24, 0.5)
				.setValue(stored.fontSize ?? DEFAULT_FONT_SIZE)
				.setDynamicTooltip()
				.onChange((v) => { this.setFontSize(v); }))
			.addExtraButton((btn) => btn
				.setIcon("rotate-ccw")
				.setTooltip("Auf Standard zurücksetzen")
				.onClick(() => { this.setFontSize(null); this.display(); }));

		for (const c of PICKER_COLORS) {
			const own = stored.colors?.[c.key];
			const fallback = DEFAULT_THEME[c.key];
			const shown = own !== undefined && SIX_DIGIT_HEX.test(own) ? own : (typeof fallback === "string" ? fallback : "#000000");
			new Setting(containerEl)
				.setName(c.name)
				.setDesc(c.desc)
				.addColorPicker((picker) => picker
					.setValue(shown.toLowerCase())
					.onChange((v) => { this.setColor(c.key, v); }))
				.addExtraButton((btn) => btn
					.setIcon("rotate-ccw")
					.setTooltip("Auf Standard zurücksetzen")
					.onClick(() => { this.setColor(c.key, null); this.display(); }));
		}

		new Setting(containerEl)
			.setName("Weitere Farben")
			.setDesc(`Die 16 Terminal-Farben wie red, green oder brightBlue kannst du unter "colors" direkt in ${TERMINAL_SETTINGS_FILE} eintragen, als Hex-Wert. Danach hier neu einlesen.`)
			.addButton((btn) => btn
				.setButtonText("Datei neu einlesen")
				.onClick(() => { reloadTerminalSettings(); this.display(); }));

		new Setting(containerEl)
			.setName("Alles zurücksetzen")
			.setDesc("Schriftgröße und alle Farben wieder auf den Standard.")
			.addButton((btn) => btn
				.setButtonText("Zurücksetzen")
				.setWarning()
				.onClick(() => { saveStoredTerminalSettings({}); this.display(); }));
	}
}

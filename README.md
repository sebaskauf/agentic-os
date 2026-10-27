# Agentic OS

Claude Code in einem eingebetteten Terminal — direkt in Obsidian.

Ein echtes Pseudo-Terminal (via [node-pty](https://github.com/microsoft/node-pty)) lässt die volle
Claude-Code-TUI in einem Obsidian-Pane laufen: Multi-Tab, Pop-out, Status-Leiste (Modell / Effort /
Permission / Context), Datei-Drag-Drop, und ein Quick-Launch für deine eigenen Claude-Commands und -Agents.

> Kein `tmux` nötig. Das Terminal läuft nativ im Plugin.

---

## Voraussetzungen

- **Obsidian Desktop** (1.5.0+). Mobile wird nicht unterstützt.
- **macOS** (Apple Silicon `arm64` oder Intel `x64`). Windows ist in Arbeit (siehe Roadmap).
- **Claude Code CLI** installiert und eingeloggt. Das Plugin startet nur den lokalen `claude`-Befehl —
  es nutzt deine bestehende Anmeldung. Wer in der CLI oder in VS Code eingeloggt ist, ist es hier auch.
  Installation: https://docs.claude.com/claude-code

Das Plugin loggt dich **nicht** ein und verbraucht **kein** fremdes Kontingent — jeder nutzt seinen eigenen Account.

---

## Installation

Da das Plugin native Binaries mitbringt (der `native/`-Ordner), funktioniert der normale
Community-Store-/BRAT-Weg nicht. Du installierst den **ganzen Ordner** manuell:

### Variante A — Release-Zip (empfohlen)

1. Auf der [Releases](../../releases)-Seite die neueste `agentic-os-x.y.z-mac.zip` herunterladen.
2. Entpacken. Du erhältst einen Ordner `agentic-os/`.
3. Diesen Ordner nach `<dein-Vault>/.obsidian/plugins/` verschieben.
   (Den `.obsidian`-Ordner zeigt der Finder mit `Cmd+Shift+.` für versteckte Dateien.)
4. Obsidian neu laden (`Cmd+P` → „Reload app without saving").
5. Einstellungen → **Community-Plugins** → **Agentic OS** aktivieren.

### Variante B — git clone

```bash
cd "<dein-Vault>/.obsidian/plugins"
git clone https://github.com/sebaskauf/agentic-os.git
```

Dann Obsidian neu laden und das Plugin aktivieren.

### macOS-Hinweis (wichtig bei der Zip)

Aus dem Internet geladene Binaries werden von Gatekeeper in Quarantäne gesteckt — dann startet das
Terminal nicht (`posix_spawnp failed`). Einmalig im Terminal lösen:

```bash
xattr -dr com.apple.quarantine "<dein-Vault>/.obsidian/plugins/agentic-os"
```

---

## Benutzung

- Öffnen über das Terminal-Icon in der linken Leiste oder `Cmd+P` → „Open Agentic OS".
- Unten im Drawer mit **+** einen Chat starten (neutral, im Vault, oder mit einem deiner Agents).
- **Quick-Launch** oben listet deine eigenen Slash-Commands (`~/.claude/commands`) und Agents
  (`~/.claude/agents`) — Klick schickt sie ans aktive Terminal.
- Tab-Icon **⇱** löst einen Tab als eigenen Obsidian-Pane heraus (frei platzierbar, zweiter Bildschirm).
- Die Status-Pills (Modell / Effort / Permission / Context) sind klickbar.

Daten (offene Tabs etc.) liegen in `~/.agentic-os/`.

### Terminal anpassen (Schriftgröße und Farben)

Einstellungen → **Agentic OS**: Schriftgröße, Hintergrund, Text, Cursor und Markierung. Änderungen wirken
sofort in allen offenen Terminals, jeder Punkt lässt sich einzeln oder komplett zurücksetzen.

Gespeichert wird in `~/.agentic-os/terminal-settings.json`, also außerhalb des Plugin-Ordners. Deine
Einstellungen bleiben deshalb bei jedem Update erhalten. In der Datei stehen nur deine eigenen Werte, alles
andere kommt vom Standard. Ohne Datei sieht das Terminal genauso aus wie bisher.

Die 16 Terminal-Farben kannst du direkt in der Datei setzen, als Hex-Wert, danach in den Einstellungen
„Datei neu einlesen":

```json
{
  "fontSize": 14,
  "colors": {
    "background": "#1e1e2e",
    "foreground": "#cdd6f4",
    "red": "#f38ba8",
    "brightBlue": "#89b4fa"
  }
}
```

Erlaubte Farbnamen: `background`, `foreground`, `cursor`, `cursorAccent`, `selectionBackground`, `black`,
`red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white` und die `bright…`-Varianten. Ungültige Werte
werden ignoriert, eine kaputte Datei fällt auf den Standard zurück.

---

## Wie es funktioniert

Das Plugin spawnt `claude` in einem echten PTY über node-pty und rendert die TUI mit
[xterm.js](https://xtermjs.org/). node-pty 1.1.0 ist ein **N-API-Addon** (ABI-stabil) — die
mitgelieferten Prebuilds laufen ohne Neu-Kompilieren unter Obsidians Electron und überleben
Obsidian-Updates. Lädt aus `native/<platform>-<arch>/`.

---

## Roadmap

- [x] macOS (arm64 + x64)
- [ ] Windows — node-pty/ConPTY läuft, braucht aber einen Renderer-Worker-Patch + Tests auf echter Hardware
- [ ] Linux
- [x] Terminal-Einstellungen (Schriftgröße, Farben), update-fest in `~/.agentic-os/`
- [ ] Optionale Settings (eigene `--add-dir`-Pfade, Default-Workspace)

---

## Lizenz

MIT

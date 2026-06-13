> Windows-Release-Plan, generiert 2026-06-13 via UltraCode-Audit (18 Agents, adversarial verifiziert, read-only gegen main).
> 10/12 Blocker bestaetigt. Umsetzung noch offen.

# Agentic-OS Windows-Kompatibilitaet: Entscheidungsreifer Report

## Worum es wirklich geht

Der Mac-Build laeuft, weil die tmux-zu-node-pty-Migration sauber durch ist (platform.ts als Single-Source-of-Truth, ptyLoader plattform-agnostisch, alle Spawns isWin-gegated). Windows ist NICHT wegen tmux kaputt, diese Story ist tot. Die praezise Grundursache ist dreiteilig und liegt komplett ausserhalb deiner src/-Logik: (1) **Packaging** liefert nur darwin-Prebuilds aus, (2) node-ptys ConPTY-Layer startet im Obsidian-Renderer einen **worker_threads.Worker**, den Electron dort verbietet, und (3) ein kleiner **npx-Spawn-Rest** fuer die Token-Bar. Punkt 3 ist im Code bereits weitgehend gefixt, die zwei echten Blocker sind Packaging und Worker, und sie sind voneinander abhaengig: ohne win32-Binaries laedt nichts, mit win32-Binaries crasht der Worker. Beide muessen zusammen ausgeliefert werden.

Verifiziert auf deinem Mac, gegen den echten main-Code (nicht nur aus dem Dossier uebernommen):
- `git ls-files native/` und das ZIP fuehren je 41 Files fuer `darwin-arm64` + `darwin-x64`, **null win32**. `node_modules/node-pty/prebuilds/` hat lokal alle vier (inkl. `win32-x64` + `win32-arm64`).
- `native/darwin-arm64/lib/windowsConoutConnection.js:76` enthaelt `new worker_threads_1.Worker(...)` und ist **bit-identisch** zu node_modules (diff -q leer = ungepatcht ausgeliefert).
- `ccusageLoader.ts:90` hat schon `resolveBinary("npx") ?? (isWin ? "npx.cmd" : "npx")`, aber `spawn` (Zeile 102) hat nur `windowsHide`, kein `shell:true`.
- Kein `postinstall`/`patch-package` in package.json, kein `.github/workflows/`. README:84 dokumentiert den Blocker selbst.

## Die bestaetigten Windows-Blocker

| # | Problem | Datei:Zeile | Severity | Fix-Kern |
|---|---------|-------------|----------|----------|
| 1 | win32-Prebuilds fehlen im committeten `native/` und im ZIP. Loader findet `native/win32-x64/lib/index.js` nie, Terminal startet gar nicht | `scripts/setup-native.sh:27` (`PLATFORMS="darwin-arm64 darwin-x64"`) | BLOCKER | PLATFORMS um `win32-x64 win32-arm64` erweitern, `setup-native` laufen lassen, beide Ordner committen |
| 2 | node-pty baut auf Windows IMMER `new Worker(conoutSocketWorker.js)`. Obsidians Renderer kann keinen worker_threads.Worker konstruieren, "Failed to construct 'Worker'" beim ersten Terminal-Spawn | `native/win32-*/lib/windowsConoutConnection.js:76`, getriggert via `windowsPtyAgent.js:74` (unbedingt, ausserhalb `if(_useConpty)`) | BLOCKER (latent, scharf sobald #1 gefixt) | windowsConoutConnection.js patchen: Worker durch Inline-Socket-Piping ersetzen, mit Drain-Timeout vor `socket.destroy()` |
| 3 | Patch in `node_modules`/`native/lib` ueberlebt kein `npm ci` und kein erneutes `setup-native` (`cp -R "$SRC/lib"` Zeile 35 ueberschreibt). Naechster Maintainer-Build = garantierte Regression | `setup-native.sh:35`, kein patch-package in `package.json` | HIGH | Patch via `patch-package` + postinstall fixieren UND als Overlay-Step nach dem lib-Copy ins setup-native-Script |
| 4 | ccusage-Token-Bar: `spawn(npx, ...)` ohne `shell:true`. Wenn `resolveBinary` nichts findet, faellt es auf bares `"npx.cmd"` zurueck, modernes Node verweigert `.cmd`-Spawn ohne Shell (EINVAL, CVE-2024-27980-Haertung) | `src/ccusageLoader.ts:102` | MEDIUM | Auf Windows `shell: true` setzen oder bei Nicht-Fund sauber `{error}` zurueckgeben statt blind `npx.cmd` zu spawnen |

Reihenfolge ist zwingend: #1 ohne #2 produziert ein Terminal, das beim Spawn crasht. #2 ohne #3 ist beim naechsten Build wieder weg. #4 ist unabhaengig und betrifft nur die Token-Bar, nicht das Terminal.

## Bewertung des Community-Fixes (Sebastian Springer)

**Punkt 1 (fehlende Windows-Binaries): korrekt, uebernehmbar.** Sein Layout-Detail (`native/win32-x64/` identisch zu darwin: `lib/` + `prebuilds/<plat>-<arch>/` + package.json) stimmt exakt mit dem ueberein, was node-ptys `utils.js` aufloest. Eine Praezisierung zu seiner Anleitung: Du musst node-pty **nicht** "auf Windows installieren". Die win32-Prebuilds liegen bereits vollstaendig in deinem `node_modules` (verifiziert), und das sind fertige N-API-Binaries, kein Compiler noetig. Der reine Kopier-Schritt ist OS-agnostisch und laeuft auf deinem Mac. `cp -R "$SRC/prebuilds/$PA"` (Zeile 38) nimmt den `conpty/`-Unterordner (OpenConsole.exe + conpty.dll) und winpty automatisch mit, der `.pdb`-Strip (Zeile 48) greift ebenfalls automatisch. Wichtig: NIE einzelne `.node` picken, node-pty laedt auf Windows `conpty.node`, nicht `pty.node`, fehlt der Unterordner gibt es ENOENT.

**Punkt 2 (Worker-Crash): korrekt diagnostiziert, Fix-Richtung richtig, eine seiner Ausweich-Optionen falsch.** Die Diagnose ist verifiziert und durch ein Produktiv-Plugin belegt (lean-obsidian-terminal v1.3.0 nutzt denselben Stack und exakt diesen windowsConoutConnection.js-Patch). Entscheidende Widerlegung einer Alternative, die im Umlauf ist: `useConpty:false`/winpty umgeht den Worker **nicht**. `windowsPtyAgent.js:74` baut die ConoutConnection ausserhalb des `if(_useConpty)`-Blocks, ich habe die Zeile gelesen, sie steht unbedingt da. Also crasht auch der winpty-Pfad. Der einzige Caveat zu Springers Patch: Der Worker existiert gezielt gegen den ClosePseudoConsole-Deadlock (microsoft/node-pty#375). Inline-Piping muss den FLUSH_DATA_INTERVAL-Drain vor `socket.destroy()` nachbilden, sonst haengt das Schliessen oder verliert die letzten Output-Bytes. Mit diesem Drain ist sein Weg sauber.

**Punkt 3 (npx ENOENT): ueberholt, sein Fix ist sogar schlechter.** Dein Code loest npx schon ueber `resolveBinary` mit `.cmd/.exe/.bat`-Probing. Springers `spawn("npx.cmd", args, {shell:true})` oeffnet eine Command-Injection-Flaeche und Quoting-Bugs, die du nicht brauchst. Hier nicht uebernehmen. Es bleibt nur der kleine Rest aus Blocker #4 (Spawn ohne Shell beim bare-`npx.cmd`-Fallback), und der loest sich am saubersten, indem du bei Nicht-Fund gar nicht erst blind spawnst.

**Springer als Contributor einbinden: ja.** Er hat den Stack korrekt seziert und selbst gepatcht, das ist echte Vorarbeit. Bitte ihn um einen PR fuer den windowsConoutConnection.js-Patch (das ist der schwierige Teil, den du auf dem Mac nicht final testen kannst) und gib ihm Credit. Sein npx-Teil lehnst du mit Begruendung ab, das ist normaler Review.

**Der kritische Wartbarkeits-Punkt: Springers Patch in `node_modules`/`native/lib` ist fluechtig.** Das ist die Falle. Loesung zweigeteilt entlang der zwei Ladepfade in ptyLoader.ts:
- Fuer den ausgelieferten Build (Normalfall): gepatchte `windowsConoutConnection.js` als vendored Datei in `scripts/` halten und in `setup-native.sh` NACH dem `cp -R lib` (Zeile 35) gezielt ueber die win32-Ziele drueberkopieren. Simpel, kein Extra-Tool, deterministisch. Damit erzeugt `npm run setup-native` allein einen vollstaendig windows-tauglichen native/-Ordner.
- Falls auch der Dev-Fallback (`require("node-pty")` direkt aus node_modules) auf Windows klappen soll: zusaetzlich `patch-package` als devDependency + postinstall mit `patches/node-pty+1.1.0.patch`.

## Empfohlener Loesungsweg: EIN Cross-Platform-ZIP

**Architektur-Entscheidung: ein einziges Universal-ZIP, kein getrennter mac/win-Release.** Begruendung: `manifest.json` (`isDesktopOnly:true`, keine os/cpu-Felder) und `package.json` brauchen dafuer keine Aenderung, node-pty ist in esbuild als external markiert und wird zur Laufzeit aus `native/<plat>-<arch>/` geladen, ptyLoader berechnet den Pfad dynamisch. Ein ZIP mit allen vier Prebuilds laedt auf jeder Plattform genau das richtige. Endgroesse ~6MB statt ~1MB (mit `.pdb`-Strip, sonst ~55MB), fuer ein Desktop-Plugin akzeptabel. Benenne das Artefakt von `-mac.zip` auf `agentic-os-0.1.0.zip` um, damit klar ist, dass es beides abdeckt.

**Die node-pty-Frage, klare Empfehlung: official microsoft/node-pty@1.1.0 selbst patchen.** Begruendung gestuetzt auf die Best-Practice-Recherche:
- **@lydell/node-pty: nein.** Behebt den Renderer-Worker-Crash NICHT, derselbe windowsConoutConnection.js + worker_threads. Es ist reine Distributionsgroessen-Optimierung, plus beta-Status, plus der Autor selbst sagt, der Sinn entfaellt, sobald upstream nur noetige Binaries shippt.
- **Sidecar/Util-Process (node-pty in separatem Node-Child via ELECTRON_RUN_AS_NODE=1, oder Rust portable-pty wie Termy): nein, nicht jetzt.** Strukturell die sauberste Loesung (Worker dort erlaubt, kein Patch, PTY-Crash killt nicht Obsidian), aber deutlich groesserer Umbau (IPC-Bruecke fuer write/resize/onData) und kollidiert mit deiner aktuellen Renderer-Singleton-Architektur (ptySession.ts). Als dokumentierten Plan-B halten, falls der Patch bei kuenftigen Electron/node-pty-Versionen bricht.
- **Official@1.1.0 selbst patchen: ja.** Es ist der Weg, den das einzige vergleichbare Produktiv-Plugin (lean-obsidian-terminal) faehrt, upstream hat den Bug bis Juni 2026 nicht gefixt (electron#18540 ist WONTFIX, der Worker kam absichtlich gegen Deadlocks rein), und es ist der kleinste Sprung von deinem jetzigen Stand. Bedingung: node-pty-Version pinnen und den Patch deterministisch im Build verankern (siehe Wartbarkeits-Punkt oben), sonst ist jedes `npm update` eine tickende Bombe.

## Schritt-fuer-Schritt Release-Plan

1. **win32 ins Packaging aufnehmen** (Mac, ~10 Min): `setup-native.sh:27` auf `PLATFORMS="darwin-arm64 darwin-x64 win32-x64 win32-arm64"`. Der Rest des Scripts ist schon win-faehig (lib-Copy, prebuild-Copy rekursiv, pdb-Strip). Dann `npm run setup-native`.

2. **Worker-Patch erstellen** (Windows-Wissen noetig, ~1-2 h Arbeit): `windowsConoutConnection.js` so patchen, dass statt `new Worker()` der conout-Pipe inline im Renderer-Thread gedraint und an `_outSocket` relayed wird. Doppel-Pipe weglassen, `_outSocket` direkt mit `conoutPipeName` verbinden. **Zwingend** den Teardown mitloesen: Drain-Timeout vor `socket.destroy()`, `dispose()` statt `worker.terminate()`. Diesen Patch von Springer per PR holen, er hat ihn schon. **Muss auf echter Windows-Hardware getestet werden** (das Konstruieren-verboten und der Close-Deadlock sind auf dem Mac nicht reproduzierbar).

3. **Patch persistent machen** (Mac, ~30 Min): gepatchte Datei als vendored File in `scripts/` ablegen, in `setup-native.sh` einen `case win32-*` nach dem lib-Copy ergaenzen, der den Patch idempotent ueber die win32-Ziele kopiert. Optional zusaetzlich patch-package + postinstall fuer den Dev-Fallback.

4. **npx-Guard fuer die Token-Bar** (Mac, ~15 Min): in `ccusageLoader.ts:102` fuer Windows `shell:true` ergaenzen ODER bei `resolveBinary`-Nichtfund sauber `{error}` zurueckgeben statt bare `npx.cmd` zu spawnen. `briefingLoader.ts` zur Sicherheit mitziehen.

5. **Build + EIN ZIP** (Mac, ~10 Min): `git add native/win32-x64 native/win32-arm64`, `npm run build`, dann ZIP packen (main.js, manifest.json, styles.css, native/, skills/). Umbenennen auf `agentic-os-0.1.0.zip`. README:16 + Roadmap-Checkbox:84 aktualisieren nach erfolgreichem Test.

6. **Verifikation auf echter Windows-Hardware** (extern, siehe naechster Abschnitt): Terminal oeffnen, Befehl laufen lassen, Output streamen, Terminal waehrend aktivem Output schliessen (genau das Deadlock-Szenario), Plugin-Unload. Token-Bar pruefen.

**Auf dem Mac machbar:** Schritte 1, 3, 4, 5 und das Erstellen des Patch-Codes. **Muss auf echtem Windows:** Schritt 2 (final verifizieren) und Schritt 6 komplett. Der Patch-Code laesst sich auf dem Mac schreiben, aber ob er den Worker-Crash wirklich behebt und keinen Close-Deadlock einfuehrt, kannst du nur auf Windows beweisen.

## Windows-Verifikation ohne Windows-Rechner

Empfehlung in dieser Reihenfolge:

1. **GitHub Actions mit windows-latest-Runner (primaer).** Du hast noch kein `.github/workflows/`. Ein Workflow, der `npm ci`, `npm run setup-native`, `npm run build` ausfuehrt und einen headless-Smoke-Test gegen die gepatchte node-pty faehrt (spawn + write + onData + kill in einem Mini-Node-Script), faengt den Spawn-Crash und den Close-Deadlock automatisch ab. Vorteil: reproduzierbar, kostenlos fuer dein Repo, kein eigener Rechner. Grenze: GitHub-Runner laufen NICHT im Obsidian-Renderer, sie testen node-pty im normalen Node-Kontext, wo der Worker erlaubt ist. Der Renderer-spezifische Crash ist damit NICHT abgedeckt. Der CI-Test verifiziert, dass dein Inline-Patch funktional korrekt ist (Daten fliessen, kein Deadlock beim Close), nicht dass er den Renderer-Worker-Verbot umgeht.

2. **Community-Beta mit Springer/Toni/Robin (entscheidend).** Genau weil CI den Renderer nicht abbildet, ist ein echter Obsidian-auf-Windows-Test durch deine Windows-User der eigentliche Lackmustest. Springer hat den Crash reproduziert und gepatcht, er ist der ideale erste Beta-Tester. Gib ihnen das Universal-ZIP vor dem offiziellen Release, mit konkreter Test-Checkliste (Terminal oeffnen, langes Output, Schliessen waehrend Output, Token-Bar). Das deckt exakt die Pfade ab, die du nicht selbst sehen kannst.

3. **Windows-VM (Backup).** Parallels/UTM auf deinem Mac mit Windows 11 ARM, Obsidian installieren, ZIP testen. Aufwand hoeher, aber du siehst den echten Renderer-Kontext selbst. Nur wenn dir die Community-Beta zu langsam ist.

**Ehrliches Restrisiko:** Du kannst auf dem Mac null Prozent des Renderer-spezifischen Verhaltens beweisen. CI beweist node-pty-Funktionalitaet, nicht Renderer-Tauglichkeit. Der einzige harte Beweis ist Obsidian-auf-echtem-Windows. Bis ein Windows-User dir gruenes Licht gibt, ist "Windows funktioniert" eine begruendete Annahme, kein Fakt. Der Close-Deadlock (microsoft/node-pty#375) ist das fieseste Restrisiko: er kann intermittierend sein und nur unter Output-Last beim Schnell-Schliessen auftreten, also genau das, was ein fluechtiger Beta-Test verpasst. Deshalb die explizite Schliessen-waehrend-Output-Anweisung in der Checkliste.

## Weitere offene Cross-Platform-Punkte

Nach den Blockern, alle MEDIUM/LOW, kein Hard-Fail:

- **@-Mention-Quoting in ChatDrawer (MEDIUM, `ChatDrawer.tsx:539`):** FilePicker quotet Backslash-/Space-Pfade nicht, im Gegensatz zu XtermPane. Auf Windows bricht die Mention beim ersten Space, und die Mention-Regex enthaelt keinen Backslash. Fix: dieselbe `needsQuote`-Logik wie XtermPane oder relPath auf forward slashes normalisieren.
- **Textarea-Drop-Handler (LOW, `ChatDrawer.tsx:514`):** liest nur `File.path`, das in Electron 39 plattformweit leer ist. Faellt nicht auf, weil XtermPanes Capture-Handler vorher greift. Entweder entfernen oder auf `webUtils.getPathForFile` heben.
- **Hartkodierter `~/Documents/Projects` (LOW, `loadChatTabs.ts:101`):** bricht bei OneDrive-Known-Folder-Move (Documents unter `%USERPROFILE%\OneDrive\Documents`). Graceful (leerer Fallback), nur Feature-Verlust beim Projekt-Picker. Optional konfigurierbar machen.
- **`~/.claude/skills`-Labels (LOW, `App.tsx:234/235/274`):** rein kosmetisch, echtes Laden nutzt `homedir()`. Label generisch halten oder per isWin umschalten.
- **launchd/Symlink-Themen:** betreffen deine Automation-Heimat (`~/.skaile/`), nicht das ausgelieferte Plugin. Kein Windows-Release-Blocker.

Bereits korrekt geloest und nur zur Vollstaendigkeit: `platform.ts:59` (/opt/homebrew sauber non-Win-gegated), `keyMapper.ts:17` (Cmd-Mapper auf darwin beschraenkt), Image-Paste via `tmpdir()`, alle `~/.claude`-Loader via `path.join` (normalisiert / zu \ auf Windows). Diese sind kein Handlungsbedarf.
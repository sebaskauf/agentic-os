---
name: session-uebergabe
description: "Schreibt am Ende einer Arbeits-Session ein praegnantes Handoff-Dokument, damit die naechste Claude-Session sofort den vollen Kontext hat (was gemacht wurde, aktueller Stand, naechste Schritte, offene Punkte, wichtige Pfade). Trigger DE: 'session handoff', 'uebergabe', 'handoff', 'handoff schreiben', 'fass die session zusammen', 'session zusammenfassen', 'wo waren wir', 'kontext fuer naechste session', 'session dokumentieren'. Trigger EN: 'session handoff', 'write handoff', 'summarize the session', 'where were we', 'context for next session', 'document the session'."
---

# Session-Uebergabe

Dein Job: am Ende einer Arbeits-Session ein kurzes, dichtes Handoff-Dokument schreiben. Ziel ist, dass eine komplett frische Claude-Session (oder du selbst morgen) in 30 Sekunden wieder voll im Bild ist: Was wurde gemacht, wo stehen wir, was kommt als Naechstes, was ist offen, welche Dateien sind wichtig.

Das ist ein READ-ONLY plus EIN-FILE-WRITE Skill. Du liest Kontext und schreibst genau eine Markdown-Datei. Du veraenderst nichts am Projekt, fasst nichts an, loescht nichts.

## Grundprinzip

Ein Handoff ist kein Roman. Es ist eine Landekarte fuer die naechste Session. Schreib so, dass jemand der NICHTS von dieser Session weiss sofort weiterarbeiten kann. Konkret statt vage: nicht "Bug gefixt", sondern "Login-Bug in `auth/login.ts` Zeile 42 gefixt, Token wurde doppelt gesetzt".

## Ablauf

### 1. Kontext sammeln (READ-ONLY)

Bevor du schreibst, sammel was du brauchst. Nutz dazu was vorhanden ist:

- **Den Gespraechsverlauf dieser Session** ist deine Hauptquelle. Geh durch was tatsaechlich passiert ist: welche Aufgabe, welche Entscheidungen, welche Dateien, welche Sackgassen.
- **Glob/Read** fuer relevante Dateien, falls du Pfade oder den letzten Stand verifizieren willst. Nur lesen, nie raten. Wenn du einen Pfad nennst, soll er stimmen.
- Falls Git im Spiel war und du es aus dem Verlauf kennst: nenn Branch, letzten Commit-Gedanken, ob etwas uncommitted ist. Erfinde keine Hashes.

Wenn etwas unklar ist (z.B. was wirklich der naechste Schritt sein soll), frag den User kurz nach, statt zu raten. Eine gezielte Rueckfrage ist besser als ein falsches Handoff.

### 2. Session-Typ erkennen und Sektionen waehlen

Erzwing nicht jede Sektion. Waehl die die passen. Typische Typen:

- **Bug-Fix / Debug**: Was war der Bug, Root-Cause, Fix, was noch nicht getestet.
- **Feature-Build**: Was gebaut, was fehlt noch, wie testen.
- **Setup / Konfiguration**: Was eingerichtet, welche Schritte noch offen, welche Credentials/Platzhalter.
- **Planung / Research**: Erkenntnisse, Entscheidungen, offene Fragen, naechste Recherche.
- **Content / Schreiben**: Was produziert, Stand der Drafts, was noch fehlt.

Eine kurze 30-Minuten-Session braucht 5 Zeilen. Eine grosse braucht mehr. Pass die Laenge an die Realitaet an, nicht an ein Template.

### 3. Handoff schreiben

Schreib mit **Write** genau eine Datei. Sprache: die des Users (default Deutsch). Tech-Begriffe (Claude Code, MCP, Branch, Commit) englisch lassen. Umlaute korrekt, keine Em-Dashes.

**Speicherort** (in dieser Reihenfolge probieren, das erste was passt):
1. Wenn das Projekt einen `.planning/`-Ordner hat, dort hinein.
2. Sonst ein `handoffs/`-Ordner im Projekt-Root (lege ihn an, falls noetig).
3. Sonst ins aktuelle Arbeitsverzeichnis.

Wenn der User einen anderen Ort will (z.B. seinen Obsidian-Vault unter `{{VAULT_PFAD}}`), schreib dahin. Ersetze `{{VAULT_PFAD}}` durch deinen echten Vault-Pfad, falls du den nutzt.

**Dateiname**: `HANDOFF-<YYYY-MM-DD>-<kurzes-thema>.md`, z.B. `HANDOFF-2026-06-07-login-bug.md`. Datum aus dem System-Datum, nicht raten. Bei mehreren Handoffs am selben Tag eine `-2` anhaengen statt eine bestehende Datei zu ueberschreiben.

### 4. Bestaetigen

Sag dem User in 1-2 Saetzen wo die Datei liegt und nenn den absoluten Pfad. Fertig.

## Template

Nimm das als Geruest, lass weg was nicht passt:

```markdown
# Handoff: <Thema> - <YYYY-MM-DD>

## TL;DR
<2-3 Saetze: Worum ging es, wo stehen wir jetzt. Das Wichtigste zuerst.>

## Was gemacht wurde
- <konkrete Aenderung mit Datei/Ort, z.B. "X in `pfad/datei.ts` angepasst">
- <Entscheidung die getroffen wurde und warum>

## Aktueller Stand
<Funktioniert es? Getestet oder nicht? Deployed oder lokal? Branch sauber oder uncommitted?>

## Naechste Schritte
1. <konkret, umsetzbar, in Reihenfolge>
2. <...>

## Offene Punkte / Risiken
- <was blockiert, was unsicher ist, worauf man aufpassen muss>

## Wichtige Pfade & Befehle
- `pfad/zur/datei` - wofuer
- `befehl zum starten/testen` - was er tut

## Kontext-Notizen (optional)
<Sackgassen die wir schon ausgeschlossen haben, damit die naechste Session sie nicht nochmal probiert. Wichtige Annahmen.>
```

## Wichtige Regeln

- **Ehrlich ueber den Stand.** Wenn etwas nicht getestet ist, schreib "nicht getestet". Behaupte nie dass etwas funktioniert ohne Beleg. Ein falsches "laeuft" kostet die naechste Session Stunden.
- **Konkret statt vage.** Immer Datei, Ort, Zeile, Befehl nennen wo moeglich. Pfade absolut oder eindeutig relativ zum Projekt-Root.
- **Keine Geheimnisse ins Handoff.** Keine API-Keys, Tokens, Passwoerter, privaten Mail-Adressen im Klartext. Stattdessen Platzhalter wie `{{API_KEY in .env}}` oder den Hinweis wo es liegt.
- **Naechste Schritte muessen actionable sein.** "Weitermachen" ist kein Schritt. "In `auth/login.ts` den doppelten setToken-Call entfernen und Login-Flow durchtesten" ist einer.
- **Nicht raten.** Lieber eine Rueckfrage als erfundene Hashes, Pfade oder Stati.
- **Nur eine Datei schreiben, sonst nichts anfassen.** Dieser Skill veraendert das Projekt nicht.

_Teil des Agentic OS Skill-Bundles - frei anpassbar._

---

name: plan-woche
description: "Erstellt einen fokussierten Wochenplan - die 3 bis 5 wichtigsten Outcomes der Woche, grob auf die Tage verteilt, mit bewusstem Fokus auf Wenigem statt Vielem. Nutze diesen Skill IMMER wenn der User seine Woche planen oder strukturieren will. Trigger DE: 'wochenplan', 'plan die woche', 'woche planen', 'plane meine woche', 'was steht diese woche an', 'fokus für die woche'. Trigger EN: 'plan my week', 'weekly plan', 'plan the week', 'what should I focus on this week'. Auch auslösen wenn der User sinngemäß fragt, worauf er sich diese Woche konzentrieren soll, selbst ohne das Wort 'Wochenplan'."
---

# Wochenplan - Fokus auf Wenigem statt Vielem

Dieser Skill hilft dem User, seine Woche zu planen. Das Ziel ist nicht eine endlose To-do-Liste, sondern Klarheit: Welche 3 bis 5 Outcomes machen diese Woche zu einem Erfolg? Alles andere ist nachrangig.

Der wichtigste Grundgedanke: Eine Woche hat begrenzte Zeit und Energie. Wer sich 15 Dinge vornimmt, erledigt am Ende oft das Falsche und fühlt sich trotzdem ausgelaugt. Wer sich auf wenige, klar definierte Outcomes konzentriert, kommt wirklich voran. Dein Job ist es, den User zu genau dieser Reduktion zu führen, nicht ihn mit Vollständigkeit zu erschlagen.

Ein **Outcome** ist ein Ergebnis, kein Tätigkeitswunsch. "An der Webseite arbeiten" ist kein Outcome. "Landingpage online und erreichbar" ist eines. Achte beim Formulieren immer darauf, dass man am Ende der Woche eindeutig mit Ja oder Nein sagen kann, ob es erreicht wurde.

## Ablauf

### Schritt 1 - Kontext sammeln (read-only)

Bevor du planst, verschaffe dir ein Bild. Frage den User nach den großen Themen der Woche, falls er sie nicht schon genannt hat. Zwei, drei gezielte Fragen reichen:

- Was muss diese Woche unbedingt fertig werden? (harte Deadlines, Termine)
- Was würde dich am Sonntagabend zufrieden zurückblicken lassen?
- Gibt es feste Termine oder Blocker, um die herum geplant werden muss?

Wenn der User ein Notiz-System oder einen Vault nutzt (z.B. Obsidian, Notion-Export, ein Projektordner), darfst du dort **lesend** nach offenen Aufgaben, früheren Wochenplänen oder einem Backlog suchen. Nutze dafür `Glob` und `Read`. Greife nur auf Verzeichnisse zu, die der User dir nennt oder die offensichtlich dazugehören. Beispiele für Suchorte:

- `{{NOTIZEN_ORDNER}}` - der Ordner mit den Notizen/Aufgaben des Users. Ersetze {{NOTIZEN_ORDNER}} durch deinen echten Pfad, oder lass den User ihn nennen.
- letzter Wochenplan (Dateinamen wie `wochenplan-*.md` oder `week-*.md`), um zu sehen, was offen blieb.

Wenn du keinen Zugriff brauchst oder der User nichts nennt, plane einfach mit dem, was er dir im Chat gibt. Erfinde niemals Aufgaben dazu.

### Schritt 2 - Auf 3 bis 5 Outcomes reduzieren

Das ist der eigentliche Kern. Nimm alles, was zusammengetragen wurde, und destilliere es auf maximal 5 Outcomes. Drei ist oft besser als fünf.

Wenn der User mehr will, ist das ein Moment für ehrliches Sparring statt Mitschwimmen. Sag ihm klar: Mehr als 5 große Outcomes pro Woche gehen fast immer schief, weil die Energie nicht reicht. Frage zurück, welche 3 wirklich zählen würden, wenn die Woche schlecht läuft. Was nicht in die Top 5 passt, kommt in eine kurze "Backlog / falls Zeit"-Liste - nicht weggeworfen, aber bewusst nachrangig.

Sortiere die Outcomes nach Wichtigkeit, nicht nach Dringlichkeit. Das Wichtigste oben.

### Schritt 3 - Grob auf Tage verteilen

Verteile die Outcomes locker über die Arbeitstage. "Grob" ist Absicht: kein Minutenplan, sondern eine sinnvolle Reihenfolge. Faustregeln:

- Das wichtigste Outcome bekommt früh in der Woche seinen Platz (Montag/Dienstag), solange die Energie hoch ist.
- Plane pro Tag maximal 1 bis 2 echte Fokus-Outcomes ein. Mehr ist Selbstbetrug.
- Lass bewusst Puffer. Eine voll durchgetaktete Woche bricht beim ersten ungeplanten Termin zusammen.
- Berücksichtige genannte Fixtermine - plane Fokusarbeit nicht in Slots, die schon belegt sind.

Wenn der User keine Tagespräferenzen nennt, triff eine vernünftige Default-Verteilung und sag dazu, dass er sie frei verschieben kann.

### Schritt 4 - Plan ausgeben und speichern

Gib den Plan zuerst übersichtlich im Chat aus. Schreibe ihn dann mit `Write` als Markdown-Datei, damit der User ihn behalten und abhaken kann. Standard-Speicherort:

- `{{WOCHENPLAN_ORDNER}}/wochenplan-{{KW}}.md` - ersetze {{WOCHENPLAN_ORDNER}} durch deinen echten Ordner und {{KW}} durch die Kalenderwoche oder das Startdatum (z.B. `2026-06-08`). Wenn der User keinen Ordner nennt, schlage das aktuelle Arbeitsverzeichnis vor und frage kurz nach, bevor du schreibst.

Verwende exakt diese Struktur:

```markdown
# Wochenplan KW {{KW}} ({{START_DATUM}} – {{END_DATUM}})

## Die wichtigsten Outcomes dieser Woche
1. [ ] <Outcome 1 - das Wichtigste>
2. [ ] <Outcome 2>
3. [ ] <Outcome 3>
(maximal 5)

## Grobe Verteilung
- **Montag:** <Fokus / Outcome>
- **Dienstag:** <Fokus / Outcome>
- **Mittwoch:** <Fokus / Outcome>
- **Donnerstag:** <Fokus / Outcome>
- **Freitag:** <Fokus / Outcome>

## Fixtermine
- <Termin mit Uhrzeit, falls genannt>

## Backlog / falls Zeit übrig
- <bewusst nachrangige Dinge>

## Fokus-Satz der Woche
> <ein Satz: worauf es diese Woche wirklich ankommt>
```

Der "Fokus-Satz" am Ende ist wichtig: ein einziger Satz, den der User über die Woche im Kopf behalten kann. Er fasst zusammen, worum es eigentlich geht.

## Haltung

- **Weniger ist mehr.** Dein Wert liegt im Weglassen, nicht im Sammeln. Wenn du am Ende eine kurze, klare Liste hast, hast du gute Arbeit geleistet.
- **Outcomes, keine Tätigkeiten.** Jeder Punkt muss am Sonntag eindeutig als erledigt oder nicht erledigt bewertbar sein.
- **Ehrlich sein.** Wenn sich der User zu viel vornimmt, sag es freundlich aber direkt. Ein realistischer Plan, den er schafft, ist mehr wert als ein ambitionierter, an dem er scheitert.
- **Read-only by default.** Du liest Kontext und schreibst genau eine Plan-Datei. Du löschst oder veränderst keine bestehenden Notizen des Users.

## Beispiel

**Input:** "plan meine woche, ich hab das kundenprojekt am laufen, will endlich mein video raushauen und muss noch ne rechnung schreiben"

**Output (gekürzt):** Drei klare Outcomes statt vager Tätigkeiten - "Kundenprojekt: Feature X abgenommen und live", "Video veröffentlicht", "Rechnung raus" - grob verteilt (Kundenprojekt Mo/Di in der frischen Energie, Video Mi, Rechnung als kurze Aufgabe Do), Puffer am Freitag, plus ein Fokus-Satz wie "Diese Woche zählt: Kundenprojekt fertig, Rest ist Beiwerk."

_Teil des Agentic OS Skill-Bundles - frei anpassbar._

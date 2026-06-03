---
name: plan-tag
description: "Verwandelt die Ziele und den Kontext des Users in einen fokussierten, realistischen Tagesplan mit Top-3-Prioritaeten, Zeitbloecken und einer bewussten Weglass-Liste. Nutze diesen Skill, sobald der User seinen Tag strukturieren oder priorisieren will. Trigger DEUTSCH: 'plan meinen tag', 'tagesplan', 'plan den tag', 'heute planen', 'mein tag', 'was soll ich heute zuerst machen', 'tag strukturieren', 'prioritaeten fuer heute'. Trigger ENGLISCH: 'plan my day', 'daily plan', 'plan today', 'what should I focus on today', 'structure my day', 'priorities for today'."
---

# Plan Tag - Fokussierter Tagesplan

Dieser Skill macht aus einer Liste von Aufgaben, Gedanken und Terminen einen klaren, machbaren Tagesplan. Das Ziel ist nicht eine vollgepackte To-do-Liste, sondern ein realistischer Tag mit klaren Prioritaeten, Zeitbloecken und einer ehrlichen Antwort darauf, was heute eben NICHT passiert.

Die meisten Tagesplaene scheitern, weil sie zu viel wollen. Deine Aufgabe ist es, dem User zu helfen Fokus zu finden, nicht ihn mit Tasks zuzuschuetten.

## Schritt 1: Ziele und Kontext einsammeln

Bevor du planst, brauchst du Material. Schau zuerst, ob der User schon etwas mitgeliefert hat (Aufgaben, Termine, ein grobes Ziel fuer den Tag).

Wenn der Input duenn oder unklar ist, frag kurz und konkret nach. Halte die Fragen leicht, der User soll nicht arbeiten muessen:

- Was sind heute deine 3 bis 5 wichtigsten To-dos oder offenen Sachen?
- Gibt es feste Termine oder Zeiten, die schon stehen?
- Bis wann hast du heute realistisch Zeit zum Arbeiten (z.B. 9 bis 17 Uhr)?
- Gibt es eine Sache, die heute unbedingt fertig werden muss?

Stell nicht alle Fragen auf einmal wie ein Formular. Frag das, was wirklich fehlt. Wenn der User schon gesagt hat "ich hab heute Kundentermin um 14 Uhr und muss die Rechnung rausschicken", dann hast du genug, um loszulegen.

Optional kannst du im Vault nach Kontext suchen, falls der User auf eigene Notizen verweist (z.B. "schau in meine Aufgaben-Notiz"). Dafuer nutzt du `Glob`, um passende Dateien zu finden, und `Read`, um sie zu lesen. Tu das nur, wenn der User es will oder klar darauf verweist. Lies niemals wahllos private Dateien.

## Schritt 2: Den Plan bauen

Erstelle den Plan nach diesem Aufbau. Halte ihn knapp und scanbar, kein Roman.

```
# Tagesplan - {{DATUM}}

## Top 3 Prioritaeten
1. <wichtigste Sache, die den Tag erfolgreich macht>
2. <zweitwichtigste>
3. <drittwichtigste>

## Zeitbloecke
- <Uhrzeit> – <Uhrzeit>  | <Aufgabe / Termin>
- <Uhrzeit> – <Uhrzeit>  | <Fokusblock fuer Prio 1>
- <Uhrzeit> – <Uhrzeit>  | Pause
- ...

## Heute bewusst NICHT
- <Aufgabe, die warten kann>
- <Aufgabe, die delegiert oder verschoben wird>

## Wenn noch Zeit bleibt (Bonus)
- <kleinere Sachen, nice-to-have>
```

Prinzipien fuer einen guten Plan:

- **Top 3 zuerst.** Wenn am Ende des Tages nur diese drei Dinge erledigt sind, war es ein guter Tag. Wenn der User dir zehn Tasks gibt, ist deine Hauptarbeit, die drei wichtigsten herauszuziehen und das auch zu begruenden.
- **Realistisch bleiben.** Ein Mensch hat selten mehr als 3 bis 4 Stunden echte Fokuszeit am Tag. Plane Puffer ein. Wenn die Aufgabenmenge offensichtlich nicht in den Tag passt, sag das ehrlich, statt einen unmoeglichen Plan zu bauen.
- **Feste Termine sind Anker.** Baue Zeitbloecke um vorhandene Termine herum, nicht dagegen.
- **Tiefe Arbeit in die beste Zeit.** Wenn nicht anders gesagt, leg die anspruchsvollste Prio-1-Aufgabe in den Vormittag, wo der Kopf frischer ist.
- **Pausen einplanen.** Ein Plan ohne Pausen ist ein Plan, der gebrochen wird.
- **Die Weglass-Liste ist Pflicht.** Fokus entsteht durch Weglassen. Nenne explizit, was heute NICHT drankommt. Das nimmt dem User das schlechte Gewissen und macht den Plan ehrlich.

## Schritt 3: Optional als Notiz im Vault ablegen

Frag den User, ob er den Plan als Notiz speichern moechte. Wenn ja, schreibe ihn mit `Write` in den Vault.

- Speicherort, falls der User keinen anderen nennt: `{{VAULT_PFAD}}/Tagesplaene/{{DATUM}}.md`. Ersetze `{{VAULT_PFAD}}` durch deinen eigenen Vault- oder Notizen-Ordner (oft `~/Documents/<dein-vault>`). `{{DATUM}}` im Format `YYYY-MM-DD`.
- Schau vorher mit `Glob`, ob es schon eine Datei fuer heute gibt, damit du nichts versehentlich ueberschreibst. Wenn ja, frag, ob ergaenzt oder ersetzt werden soll.
- Schreibe niemals ungefragt in eine Datei. Der Plan im Chat reicht, wenn der User nichts speichern will.

## Stil und Ton

- Schreibe den Plan auf Deutsch, klar und kompakt. Tech-Begriffe bleiben englisch.
- Keine Floskeln, keine Motivations-Sprueche. Der User will einen Plan, kein Coaching-Pamphlet.
- Sei direkt: Wenn der User zu viel will, sag es. Ein ehrliches "das passt heute nicht alles rein, lass uns X auf morgen schieben" ist mehr wert als ein voller Plan, der scheitert.
- Wenn du etwas annimmst (z.B. Arbeitszeiten), schreib es kurz dazu, damit der User es korrigieren kann.

## Kurzbeispiel

**Input:** "Plan meinen Tag. Heute: Angebot fuer Kunde fertig machen, Steuerunterlagen sortieren, 3 Mails beantworten, neues Video-Skript anfangen, einkaufen. Kundencall 15 Uhr. Arbeite 9 bis 18 Uhr."

**Output (gekuerzt):**

Top 3: 1. Angebot fertig (vor dem Call, damit du es ansprechen kannst). 2. Kundencall vorbereiten + halten. 3. Video-Skript starten.
Zeitbloecke: 9 bis 11 Angebot, 11 bis 11:30 Mails, Mittag, 14 bis 15 Call-Prep, 15 Uhr Call, danach Skript.
Heute NICHT: Steuerunterlagen (kein Termindruck, blockt 2 Stunden, besser eigener Block morgen). Einkaufen lieber abends nebenbei, kein Fokus-Slot.

So sieht der User sofort, worauf es ankommt und was bewusst wegfaellt.

_Teil des Agentic OS Skill-Bundles - frei anpassbar._

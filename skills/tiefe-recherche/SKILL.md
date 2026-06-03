---
name: tiefe-recherche
description: "Recherchiert eine Frage tief ueber mehrere Web-Quellen (3+), checkt Aussagen quer, schreibt eine zitierte Zusammenfassung und legt sie optional als Vault-Notiz ab. Read-only ausser dem finalen Speichern. Triggert bei 'recherchier', 'tiefe recherche', 'research', 'finde raus', 'vergleich X vs Y', 'deep dive', 'mach eine recherche', 'research this', 'find out about', 'compare X vs Y', 'do a deep dive'."
---

# Tiefe Recherche

Dein Job: eine Frage nicht oberflaechlich beantworten, sondern wie ein skeptischer Researcher. Mehrere Quellen lesen, Aussagen gegeneinander pruefen, Widersprueche benennen, alles belegen. Lieber "das ist unklar" sagen als raten.

Tools die du nutzt: `WebSearch` (Quellen finden), `WebFetch` (Quellen lesen), `Read` (lokale Dateien falls relevant), `Write` (nur am Ende fuer die optionale Notiz). Bis zum Speichern ist alles read-only.

## 0. Frage schaerfen (10 Sekunden)

Wenn die Frage zu vage ist, um sinnvoll zu recherchieren, stell 1-2 kurze Rueckfragen. Beispiele fuer zu vage:
- "recherchier mal E-Autos" → Welches Ziel? Kaufberatung, Markttrend, Technik-Vergleich?
- "finde raus was besser ist" → Besser wofuer, fuer wen, mit welchem Budget?

Wenn die Frage klar genug ist, leg direkt los. Nicht unnoetig nachfragen.

## 1. Quellen finden (Fan-out)

1. Zerlege die Frage in 2-4 Such-Anfragen aus verschiedenen Winkeln. Bei "X vs Y" je eine Suche pro Seite plus eine neutrale Vergleichssuche.
2. Fuehre die `WebSearch`-Anfragen aus. Bei aktuellen Themen Datum/Jahr in die Query packen.
3. Waehle die vielversprechendsten Treffer. **Mindestens 3 voneinander unabhaengige Quellen** (nicht 3x dieselbe Pressemitteilung in anderem Gewand).
4. Bevorzuge Primaerquellen, offizielle Doku, Studien, etablierte Medien. SEO-Spam, reine Werbe-Landingpages und Inhalte ohne Autor/Datum niedriger gewichten.

## 2. Quellen lesen und querchecken

1. Lies jede ausgewaehlte Quelle mit `WebFetch`. Pro Quelle festhalten: Kernaussage, Datum, wer steht dahinter, wie vertrauenswuerdig.
2. **Triangulieren**: Bestaetigen sich die Aussagen ueber Quellen hinweg? Was sagen nur einzelne Quellen?
3. **Widersprueche markieren**: Wenn zwei Quellen sich widersprechen, beide nennen und sagen welche glaubwuerdiger ist und warum, statt eine still zu schlucken.
4. **Skepsis**: Achte auf Interessenkonflikte (Hersteller lobt eigenes Produkt), veraltete Daten, fehlende Belege, Behauptungen ohne Quelle. Eine einzelne unbelegte Behauptung ist kein Fakt.
5. Wenn die 3 Quellen nicht reichen oder uneinig sind, noch eine Runde suchen statt zu raten.

## 3. Zusammenfassung schreiben (zitiert)

Schreib eine klare, kompakte Antwort. Format:

```markdown
# Recherche: [Frage]

## Kurzantwort
[2-4 Saetze. Die direkte Antwort auf die Frage.]

## Befunde
- [Aussage] [Quelle 1, Quelle 3]
- [Aussage] [Quelle 2]
- ...

## Unsicher / Widersprueche
- [Wo sich Quellen widersprechen oder die Lage unklar ist + welche Seite glaubwuerdiger]

## Quellen
1. [Titel] - [URL] - [Datum, Herausgeber, kurze Einschaetzung der Verlaesslichkeit]
2. ...
3. ...
```

Regeln:
- **Jede konkrete Behauptung bekommt eine Quellen-Nummer.** Keine Behauptung ohne Beleg.
- Trenne klar: was ist belegt, was ist deine Einschaetzung, was ist offen.
- Keine erfundenen Zahlen, keine erfundenen URLs. Lieber Luecke offen lassen.
- Kompakt und direkt. Kein Geschwafel.

## 4. Optional als Vault-Notiz ablegen

Frag am Ende: "Soll ich das als Notiz speichern?" Falls ja (oder wenn schon im Auftrag steht), schreib die Zusammenfassung per `Write` nach `{{VAULT_PFAD}}/recherche-[kurz-slug].md`.

Ersetze `{{VAULT_PFAD}}` durch deinen Notiz-Ordner (z.B. dein Obsidian-Vault wie `~/Documents/mein-vault/wiki`). Wenn du keinen Vault nutzt, speichere in den Projektordner oder lass das Speichern weg.

Frontmatter fuer die Notiz:

```markdown
---
title: Recherche - [Frage]
tags: [recherche]
created: [YYYY-MM-DD]
sources: [Liste der URLs]
---
```

Danach den Notiz-Pfad ausgeben, damit man sie wiederfindet.

## Constraints

- **3+ unabhaengige Quellen** sind das Minimum. Weniger = sag dass die Datenlage duenn ist.
- Read-only bis zum finalen `Write`. Niemals etwas im Web absenden, einloggen oder Formulare ausfuellen.
- Skeptisch bleiben: Quelle nennen schlaegt Bauchgefuehl. Unsicherheit offen zugeben.
- Keine privaten Daten, keine internen Toolnamen in der Notiz.
- Deutsch, Umlaute korrekt, keine Em-Dashes, kompakt.

_Teil des Agentic OS Skill-Bundles - frei anpassbar._

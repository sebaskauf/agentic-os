---
name: council
description: "COUNCIL - pressure-test eine echte Entscheidung, indem du sie aus mehreren unabhaengigen Rollen analysierst, gegeneinander abwaegst und ein begruendetes Verdikt mit Risiken lieferst. Methodik nach Andrej Karpathys LLM Council. Trigger DEUTSCH: 'council', 'council this', 'pressure-test das', 'stress-test das', 'sollte ich X oder Y', 'welche option', 'ich kann mich nicht entscheiden', 'debatte das', 'durchleuchte diese entscheidung'. Trigger ENGLISCH: 'council this', 'run the council', 'pressure-test this', 'stress-test this', 'should I X or Y', 'which option', 'debate this', 'I can't decide', 'I'm torn between'. NUR fuer echte Entscheidungen mit Tradeoffs und Konsequenzen - NICHT fuer simple Faktenfragen oder Ja/Nein ohne Abwaegung."
---

# COUNCIL - druckgetestete Entscheidungsfindung

Du fuehrst den User durch eine harte, ehrliche Entscheidungsanalyse. Statt einer einzigen
Meinung simulierst du einen **Council** aus mehreren unabhaengigen Rollen, die dieselbe Frage
aus verschiedenen Blickwinkeln durchleuchten. Danach wiegst du die Stimmen gegeneinander ab
und lieferst ein synthetisiertes Verdikt mit Begruendung und Risiken.

> Methodik nach Andrej Karpathys LLM Council. Idee: mehrere unabhaengige Perspektiven schlagen
> eine einzelne Meinung - Blinde Flecken fallen auf, weil sich die Rollen widersprechen duerfen.
> Die Umsetzung hier ist eigenstaendig, kein fremder Code.

## Wann diesen Skill nutzen

NUR fuer **echte Entscheidungen mit Tradeoffs**:
- Zwei oder mehr ernsthafte Optionen ("X oder Y", "welche von dreien")
- Es steht etwas auf dem Spiel (Geld, Zeit, Reputation, Strategie, Beziehungen)
- Es gibt KEINE eindeutig richtige Antwort, sondern Abwaegungen

NICHT nutzen fuer:
- Faktenfragen ("wie heisst der Befehl fuer X") - einfach beantworten
- Trivialentscheidungen ohne echte Konsequenz ("Markdown oder Textdatei")
- Reine Ja/Nein-Fragen ohne Abwaegung

Wenn die Frage nicht in den Council gehoert: sag das kurz und beantworte sie normal,
statt den vollen Ablauf zu erzwingen.

## Schritt 0 - Entscheidung scharf stellen

Bevor der Council tagt, brauchst du eine klar formulierte Entscheidung. Falls unklar, frag
GENAU EINMAL nach (kurz, max. 2-3 Punkte), zum Beispiel:
- Was sind die konkreten Optionen?
- Was ist das Ziel oder der Erfolgsmassstab?
- Welche harten Constraints gibt es (Budget, Deadline, Risiko-Toleranz)?

Wenn die noetigen Infos schon im Chat stehen: NICHT nachfragen, direkt loslegen.
Fasse die Entscheidung in **einem Satz** zusammen und schreib sie an den Anfang deiner Antwort,
damit klar ist, worueber abgestimmt wird.

## Schritt 1 - Council besetzen (Rollen waehlen)

Waehle **3 bis 5 Rollen**, die fuer genau diese Entscheidung relevant sind. Nutze NICHT immer
dieselben - passe sie an. Beispiel-Pool (such die passenden aus, erfinde bei Bedarf eigene):

- **Der Pragmatiker** - was ist am schnellsten umsetzbar, was kostet am wenigsten Aufwand?
- **Der Skeptiker / Risiko-Anwalt** - was geht schief, was wird unterschaetzt, wo liegt die Falle?
- **Der Stratege / Langfrist-Denker** - was bedeutet das in 6-24 Monaten, baut es Optionen auf?
- **Der oekonomische Blick** - Kosten, ROI, Opportunitaetskosten, Cashflow.
- **Der Nutzer- / Kunden-Anwalt** - wie wirkt die Entscheidung auf die Betroffenen (Kunden, Team, Community)?
- **Der Contrarian** - die unbequeme Gegenposition, die bewusst das Gegenteil vertritt.
- Domaenenspezifische Rolle, falls passend (z.B. **Der Jurist/DSGVO-Blick**, **Der Engineer**, **Der Marketer**).

Wichtig: die Rollen sollen sich **widersprechen duerfen**. Ein Council, in dem alle einer Meinung
sind, hat versagt.

## Schritt 2 - Unabhaengige Einzel-Statements

Jede Rolle gibt **unabhaengig** ihr Statement ab - so, als haetten sie die anderen nicht gehoert.
Pro Rolle:

- **Empfehlung**: welche Option, klar benannt (oder "keine der beiden, weil ...")
- **Begruendung**: 2-4 Saetze aus genau diesem Blickwinkel
- **Groesstes Risiko aus dieser Sicht**: ein Satz

Halte jede Stimme kurz und scharf. Keine Wiederholungen zwischen den Rollen - wenn zwei Rollen
dasselbe sagen wuerden, war eine davon falsch besetzt.

## Schritt 3 - Cross-Examination (Stimmen gegeneinander)

Jetzt prallen die Statements aufeinander. Arbeite die echten Konfliktlinien heraus:

- Wo widersprechen sich die Rollen direkt? Wer hat das staerkere Argument und warum?
- Welche Annahme einer Rolle haelt der Kritik nicht stand?
- Gibt es einen Punkt, den **mehrere unabhaengige** Rollen nennen? Der wiegt schwer.
- Welches Risiko wurde von allen unterschaetzt?

Das ist der wichtigste Schritt. Hier entsteht der Mehrwert gegenueber einer Einzelmeinung.
Sei ehrlich, auch wenn das Ergebnis unbequem ist.

## Schritt 4 - Synthetisiertes Verdikt

Liefere eine klare Empfehlung. Kein Herumlavieren, keine "kommt drauf an"-Floskel ohne Substanz.

- **Verdikt**: welche Option, in einem Satz.
- **Konfidenz**: hoch / mittel / niedrig - und warum.
- **Tragende Gruende**: die 2-3 Argumente, die den Ausschlag gegeben haben.
- **Was dagegen spricht (Steelman der Gegenseite)**: die staerkste verbleibende Gegenposition,
  fair formuliert. Niemand soll sich uebergangen fuehlen.
- **Top-Risiken + Gegenmassnahme**: die 2-3 groessten Risiken, jeweils mit einem konkreten
  Schritt, der sie entschaerft.
- **Kill-Kriterium**: woran wuerde man erkennen, dass die Entscheidung falsch war - und ab wann
  man umsteuern sollte.
- **Naechster Schritt**: die EINE konkrete Handlung, die jetzt ansteht.

## Output-Format

Strukturiere die Antwort genau so (Markdown, kompakt):

```
## Entscheidung
<ein Satz>

## Council
**<Rolle 1>** - Empfehlung: ... | Begruendung: ... | Groesstes Risiko: ...
**<Rolle 2>** - ...
**<Rolle 3>** - ...
( bis zu 5 )

## Cross-Examination
- <Konfliktlinie / wer gewinnt das Argument>
- <unterschaetztes Risiko, das mehrere nennen>

## Verdikt
**Empfehlung:** ...
**Konfidenz:** hoch/mittel/niedrig - weil ...
**Tragende Gruende:** ...
**Staerkste Gegenposition:** ...
**Top-Risiken + Gegenmassnahme:** ...
**Kill-Kriterium:** ...
**Naechster Schritt:** ...
```

## Regeln

- Read-only und safe: du analysierst und empfiehlst, du fuehrst nichts aus. Keine Dateien aendern,
  keine externen Calls, keine Geld- oder Vertragsaktionen ausloesen.
- Ehrlichkeit vor Gefaelligkeit. Wenn die Lieblingsoption des Users die schlechtere ist, sag es -
  begruendet, nicht belehrend.
- Keine erfundenen Zahlen. Wenn dir Daten fehlen (Preise, Marktgroessen), benenne die Annahme
  ausdruecklich als Annahme statt sie als Fakt zu verkaufen.
- Halte dich kurz. Der Council soll Klarheit schaffen, nicht eine Textwand produzieren.
- Wo du User-Kontext brauchst, den du nicht hast (z.B. konkrete Kunden, Budgets, Tools), nutze
  Platzhalter wie {{BUDGET}}, {{DEADLINE}}, {{KUNDE}} und sag dem User kurz: "ersetze {{X}} durch
  dein ...". So bleibt der Skill generisch.

_Teil des Agentic OS Skill-Bundles - frei anpassbar._

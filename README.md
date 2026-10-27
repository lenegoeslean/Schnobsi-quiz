# Schnobbis Quiz 🎯

Allgemeinwissen-Quiz für den Spieleabend – als App fürs Handy (PWA).

## Auf GitHub hochladen

1. Auf github.com ein neues Repository anlegen (z. B. `schnobbis-quiz`, öffentlich).
2. **„uploading an existing file“** anklicken und den **Inhalt** dieses Ordners hochladen
   (also `index.html`, `app.js`, … und den Ordner `icons` – nicht den Ordner selbst).
3. **Settings → Pages** → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
4. Nach 1–2 Minuten ist die App unter `https://DEINNAME.github.io/schnobbis-quiz/` erreichbar.
5. Auf dem iPhone in Safari öffnen → Teilen → **„Zum Home-Bildschirm“**.

## So wird gespielt

- **Spieler anlegen** (Tipp aufs Tier = anderes Emoji, Pfeile = Reihenfolge).
- **Klassik:** Jeder bekommt reihum eine Frage. Lösung aufdecken → ✅ oder ❌.
- **Duell:** Zwei Spieler bekommen je eine vergleichbare Frage zum gleichen Thema.
  Ist nur einer richtig, gibt's +1 Extrapunkt.
- **Fragen pro Spieler:** Schnellwahl 3 / 5 / 10 / 15 / 20 oder feinjustieren bis 50.
- **📶 Schwierigkeit:** Leicht 🌱 / Mittel 🌸 / Schwer 🔥 – einzeln oder kombiniert wählbar.
- **📈 Steigend:** es wird von Runde zu Runde schwerer, pro Runde haben alle die gleiche Stufe.
- **💎 Schwer zählt mehr:** Leicht 1, Mittel 2, Schwer 3 Punkte (optional).
- **🏷️ Kategorien:** nur bestimmte Themen spielen (Klassik).
- **⏱️ Timer:** optional 15 / 30 / 60 Sekunden pro Frage.
- **🃏 Joker:** tauscht die Frage, bevor die Lösung aufgedeckt wird.
- **🔥 Serien-Bonus:** alle 3 richtigen Antworten am Stück +1.
- **🫳 Klauen:** Antwort falsch? Wer es wusste, bekommt den Punkt.
- **🎉 Finale:** die letzte Runde zählt doppelt.
- **Punktestand antippen:** Punkte von Hand korrigieren, Rückgängig, Spiel beenden.
- Der Spielstand wird automatisch gespeichert – App schließen und später weiterspielen geht.
- Gespielte Fragen kommen erst wieder, wenn alle durch sind (oder auf der Startseite zurücksetzen).

## Neue Fragen ergänzen

In `questions.js` unten in der Liste eine Zeile anhängen – die letzte Zahl ist die Schwierigkeit (1 = Leicht, 2 = Mittel, 3 = Schwer):

```js
[501, 'Was ist die Hauptstadt von Kroatien?', 'Zagreb', 'Geografie', 2],
```

Für neue Duell-Paare zwei Fragen anlegen und unter `PAIRS` eintragen: `[71, 'Thema', 501, 502],`
Danach in `sw.js` die Versionsnummer (`schnobbis-quiz-v5` → `v6`) erhöhen.

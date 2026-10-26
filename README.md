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
- **🃏 Joker:** tauscht die Frage, bevor die Lösung aufgedeckt wird.
- **🔥 Serien-Bonus:** alle 3 richtigen Antworten am Stück +1.
- **Punktestand antippen:** Punkte von Hand korrigieren, Rückgängig, Spiel beenden.
- Der Spielstand wird automatisch gespeichert – App schließen und später weiterspielen geht.
- Gespielte Fragen kommen erst wieder, wenn alle durch sind (oder auf der Startseite zurücksetzen).

## Neue Fragen ergänzen

In `questions.js` unten in der Liste eine Zeile anhängen, z. B.:

```js
[121, 'Wie heißt die Hauptstadt von Island?', 'Reykjavík', 'Geografie'],
```

Für neue Duell-Paare zwei Fragen anlegen und unter `PAIRS` eintragen.
Danach in `sw.js` die Versionsnummer (`schnobbis-quiz-v1` → `v2`) erhöhen.

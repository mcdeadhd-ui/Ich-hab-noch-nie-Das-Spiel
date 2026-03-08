# Ich hab noch nie – Das Spiel 🎉

Eine browserbasierte Multiplayer-Web-App des beliebten Partyspiels **„Ich hab noch nie"**.  
Erstelle einen Raum, lade Freunde ein und spielt gemeinsam – ganz ohne App-Installation.

---

## Features

- **Echtzeit-Multiplayer** via Socket.io – alle Spieler sehen Fragen und Reaktionen sofort
- **Räume erstellen & beitreten** – öffentliche Raumliste, einfacher Beitritt per Name
- **Zwei Alterskategorien** für die Fragen: `under12` (familienfreundlich) und `under16`
- **Admin-Steuerung**: Raumersteller kann das Spiel starten, Einstellungen ändern und Spieler rauswerfen
- **Reaktionssystem**: Jeder Spieler gibt an, ob die aktuelle Aussage auf ihn zutrifft oder nicht
- **Beitritt während einer laufenden Runde** (optional durch den Admin aktivierbar)
- **Automatische Weiterschaltung** zur nächsten Frage, sobald alle Spieler reagiert haben
- Läuft vollständig im Browser – kein Login, kein Account erforderlich

---

## Tech-Stack

| Bereich   | Technologie              |
|-----------|--------------------------|
| Backend   | Node.js, Express         |
| Echtzeit  | Socket.io                |
| Frontend  | Vanilla JS, HTML, CSS    |
| IDs       | UUID v4                  |

---

## Installation & Start

```bash
# Abhängigkeiten installieren
npm install

# Server starten (Port 3000)
npm start
```

Anschließend die App im Browser unter [http://localhost:3000](http://localhost:3000) öffnen.

### Entwicklungsmodus

```bash
npm run dev
```

---

## Projektstruktur

```
├── server.js          # Express- & Socket.io-Server, Spiellogik
├── questions.json     # Fragenkatalog nach Kategorien geordnet
├── public/
│   ├── index.html     # Haupt-HTML der App
│   ├── app.js         # Frontend-Logik (Screens, Socket-Events)
│   └── style.css      # Styling
└── package.json
```

---

## Spielablauf

1. Spieler öffnet die App und gibt seinen Namen ein.
2. Einen neuen Raum erstellen oder einem bestehenden beitreten.
3. Der Admin wählt die Fragenkategorie und startet das Spiel.
4. Zu jeder Frage reagieren alle Spieler mit „Hab ich" oder „Hab ich nie".
5. Nach allen Fragen wird das Spiel beendet – bereit für die nächste Runde!

---

## Lizenz

MIT

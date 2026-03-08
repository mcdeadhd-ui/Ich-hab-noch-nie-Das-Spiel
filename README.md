<div align="center">

# 🎉 Ich hab noch nie – Das Spiel

**Das beliebte Partyspiel direkt im Browser – ohne App, ohne Login, einfach losspielen.**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Echtzeit-010101?style=flat-square&logo=socket.io)](https://socket.io/)
[![License: MIT](https://img.shields.io/badge/Lizenz-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📖 Über das Projekt

Erstelle einen Raum, lade Freunde ein und spielt gemeinsam **„Ich hab noch nie"** – vollständig browserbasiert, in Echtzeit und mit drei Alterskategorien für jede Runde.

---

## ✨ Features

| Feature | Beschreibung |
|---|---|
| ⚡ **Echtzeit-Multiplayer** | Alle Spieler sehen Fragen & Reaktionen sofort via Socket.io |
| 🏠 **Räume erstellen & beitreten** | Öffentliche Raumliste, einfacher Beitritt per Name |
| 🎯 **Drei Alterskategorien** | `👶 unter 12` · `🧑 unter 16` · `🔞 18+` |
| 👑 **Admin-Steuerung** | Starten, Einstellungen ändern, Spieler rauswerfen |
| 💬 **Reaktionssystem** | Jeder Spieler reagiert live auf jede Frage |
| 🔓 **Beitritt während des Spiels** | Optional durch den Admin aktivierbar |
| ⏭️ **Auto-Weiterschaltung** | Nächste Frage, sobald alle reagiert haben |
| 🔄 **Session-Persistenz** | Seitenreload wirft dich nicht mehr aus dem Raum |

---

## 🛠️ Tech-Stack

| Bereich | Technologie |
|---|---|
| 🖥️ Backend | Node.js · Express |
| ⚡ Echtzeit | Socket.io |
| 🎨 Frontend | Vanilla JS · HTML · CSS |
| 🔑 IDs | UUID v4 |

---

## 🚀 Installation & Start

### Voraussetzungen

- [Node.js](https://nodejs.org/) v18 oder neuer

### Setup

```bash
# 1. Repository klonen
git clone https://github.com/mcdeadhd-ui/Ich-hab-noch-nie-Das-Spiel.git
cd Ich-hab-noch-nie-Das-Spiel

# 2. Abhängigkeiten installieren
npm install

# 3. Server starten
npm start
```

➡️ App im Browser öffnen: [http://localhost:3000](http://localhost:3000)

### Entwicklungsmodus (Auto-Reload)

```bash
npm run dev
```

---

## 📁 Projektstruktur

```
Ich-hab-noch-nie-Das-Spiel/
├── 📄 server.js          # Express- & Socket.io-Server, gesamte Spiellogik
├── 📋 questions.json     # Fragenkatalog (je 100 Fragen pro Kategorie)
├── 📦 package.json
└── 📂 public/
    ├── 🌐 index.html     # Single-Page-App Markup
    ├── ⚙️  app.js         # Frontend-Logik (Screens, Socket-Events, State)
    └── 🎨 style.css      # Styling & Layout
```

---

## 🎮 Spielablauf

```
 1. 👤  Namen eingeben
        ↓
 2. 🏠  Raum erstellen  oder  🚪 Raum beitreten
        ↓
 3. 👑  Admin wählt Alterskategorie & startet das Spiel
        ↓
 4. 💬  Alle Spieler reagieren auf jede Frage
        ↓
 5. 🏁  Spiel beenden – bereit für die nächste Runde!
```

---

## 📜 Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE) – frei nutzbar, veränderbar und teilbar.

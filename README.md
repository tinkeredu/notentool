# tinkeredu – Noten-App

Offline-Notenerfassung und -verwaltung für Lehrkräfte. Progressive Web App (PWA) für iPad und Desktop – keine Cloud, kein Server-Backend, alle Daten bleiben lokal auf dem Gerät (IndexedDB, AES-256-verschlüsselt, Entschlüsselung erst nach PIN-Eingabe).

**Wichtig:** Ein vergessener PIN bedeutet Datenverlust. Es gibt keine Wiederherstellung – das ist bewusst so (echte Verschlüsselung, kein UI-Schloss). Regelmäßige verschlüsselte Backups („Einstellungen → Export") sind Pflicht; die App erinnert daran.

## Installation (fertige Testversion auf eigenem Server)

Der Ordner [`dist/`](dist/) enthält den kompletten Produktions-Build – statisch, ohne Backend:

1. Inhalt von `dist/` auf einen beliebigen Webserver hochladen (FTP, Webspace, nginx, Apache, NAS …).
2. **HTTPS ist Pflicht.** Service Worker und IndexedDB funktionieren nur über `https://` (oder `localhost`). Ohne TLS startet die App nicht installierbar/offline-fähig.
3. Die App muss im **Root-Pfad** oder in einem Unterordner ohne Basis-Pfad-Änderung erreichbar sein – die Pfade sind relativ aufgebaut.
4. Einmalig im Browser öffnen – danach ist die App vollständig offline-fähig (Service Worker cached alle Assets).

Es werden keine Cookies, kein Tracking und keine ausgehenden Verbindungen benötigt. Der Server liefert nur statische Dateien aus.

## App installieren (PWA)

### iPad / iPhone (Safari)
1. `https://<dein-server>` in Safari öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm"**.
3. Beim ersten Start PIN festlegen. Danach läuft die App komplett offline.

### Desktop (Chrome/Edge)
1. Seite öffnen → Installations-Symbol in der Adressleiste → **Installieren**.
2. Alternativ: einfach als normale Website nutzen – Offline-Fähigkeit greift auch im Tab.

### Erste Schritte
1. PIN festlegen (merken! siehe Warnung oben).
2. Kurs anlegen → Bewertungsmodus wählen (Noten 1–6 oder Punkte 0–15).
3. Schüler eintragen oder per CSV importieren.
4. Notenbaum aufbauen (Kategorien mit Gewicht, Arbeiten mit Datum/Max-Punkten/Skala).
5. Im Raster eintragen: Note (z. B. `2-`, `2/3`), `e` = entschuldigt, `u` = unentschuldigt, Kommentar pro Zelle.
6. Regelmäßig unter Einstellungen → **Backup exportieren** die verschlüsselte Datei sichern.

## Entwicklung

```bash
npm ci          # Abhängigkeiten (Node ≥ 20)
npm run dev     # Dev-Server
npm run build   # Produktions-Build nach dist/ (inkl. Service Worker)
npx vitest run  # Unit-Tests der Notenlogik
```

Stack: React + TypeScript + Vite + Tailwind; Datenschicht Dexie/IndexedDB mit `vite-plugin-pwa` (Workbox). Neue Datenänderungen bitte in `src/domain/` (reine, getestete Logik), `src/data/` (Persistenz) und `src/app/` (UI) trennen.

## Sync zwischen zwei Geräten

Einstellungen → **Sync im Netz**: ein Gerät erzeugt einen Angebots-Code, das andere antwortet mit einem Antwort-Code (WebRTC DataChannel, manuelles Signaling – kein Server nötig). Konflikte werden pro Datensatz angezeigt und manuell aufgelöst.

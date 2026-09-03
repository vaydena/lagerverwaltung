# Vaydena Lager – Lagerverwaltung mit Barcode-Scan

Live-Adresse: https://lagerverwaltung.vaydena.de

Statische Web-App ohne Build-Schritt (HTML + CSS + Vanilla JS) mit Supabase-Backend.
Kunden legen ihre Barcodes/QR-Codes selbst an, scannen sie mit dem Smartphone und
buchen Ein-/Ausgaenge auch ohne Internetverbindung (Abgleich, sobald wieder Netz da ist).
Abrechnung als Abo je Firma, Zahlung ausschliesslich per Bankueberweisung + GiroCode.

## Struktur

- index.html – Landingpage; registrieren.html / anmelden.html – Zugang
- app.html – die eigentliche App (PWA, offline-faehig; sw.js + manifest.webmanifest)
- zahlung.html – Zahlseite je Rechnung (Ueberweisung + GiroCode); betreiber.html – Betreiber-Backend
- assets/app.css (Design-Tokens), assets/lager.css (App-Shell)
- assets/auth.js (window.LV: Supabase-Client, apiCall), assets/lager-store.js (IndexedDB, window.LVStore),
  assets/lager-sync.js (Push/Pull, window.LVSync), assets/lager-scan.js (Kamera + Handscanner),
  assets/lager-labels.js (Etikettendruck), assets/lager-app.js (alle Ansichten und Aktionen)
- supabase/ – Migrationen (Schema lager) und Edge Functions lager-api, lager-public, lager-admin
- test/api-e2e.js – End-to-End-Test gegen die Edge Functions: node test/api-e2e.js
- test/ui-smoke.js – UI-Smoke-Test der App (puppeteer-core + installiertes Chrome, Screenshots in test/out/shots/): node test/ui-smoke.js
  Beide Tests nacheinander laufen lassen, nie parallel (sonst sind die DB-Verbindungsslots erschoepft -> 500).
- tools/make-icons.js – erzeugt die Icons unter assets/icons/

## Deploy

Push auf main -> GitHub Actions (.github/workflows/deploy.yml) -> curl-FTPS nach Hostinger, Ordner /lagerverwaltung/.
Benoetigt das Repository-Secret FTP_PASSWORD (reines Passwort des Deploy-FTP-Kontos; Tab "Secrets", nicht "Variables").
Ohne Secret bleibt der Lauf gruen und ueberspringt den Upload.

Sofort-Weg ohne GitHub: deploy-local.ps1 in PowerShell starten. Das Skript fragt das Passwort ab und speichert nichts.

Vor jedem Deploy mit geaenderten App-Dateien: VERSION in sw.js erhoehen und den Marker in deploy-version.txt anpassen.
Sonst behalten bereits installierte Apps die alte Shell im Cache.

## Backend

Supabase-Projekt xeuexovdipdiiuzjpzkj (Frankfurt). Datenbankzugriff nur ueber die Edge Functions (RLS: alles verweigert).
Der Betreiber-Schluessel (x-admin-key fuer lager-admin) liegt nicht im Repo.

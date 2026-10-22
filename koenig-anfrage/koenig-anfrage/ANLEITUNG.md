# Dachanfrage König – Einrichtung

Das Anfrageformular läuft als kleiner Cloudflare Worker, getrennt von König Kalk.
Kunden öffnen den Link ohne Anmeldung. Jede Anfrage kommt als Mail mit Fotos an
info@dachdeckermeister-koenig.de, der Kunde bekommt eine Eingangsbestätigung.

Kosten: keine (Cloudflare kostenlos, Resend bis 3.000 Mails im Monat kostenlos).
Zeitaufwand: ca. 30 Minuten.

Link danach: `https://koenig-anfrage.leon-koenig.workers.dev`
(Der Teil `leon-koenig` ist deine Cloudflare-Subdomain, genau wie bei König Kalk.)

---

## Schritt 1: Resend (Mailversand) einrichten

1. Auf https://resend.com ein kostenloses Konto anlegen.
2. Links **Domains → Add Domain**:
   - Domain: `dachdeckermeister-koenig.de`
   - Region: **Ireland (eu-west-1)** wählen (Mails laufen dann über Server in der EU)
3. Resend zeigt dir jetzt 3 DNS-Einträge an (ein MX und zwei TXT, alle auf `send` bzw. `resend._domainkey`).
   Seite offen lassen, weiter mit Schritt 2.

## Schritt 2: DNS-Einträge bei IONOS eintragen

1. Bei IONOS anmelden → **Domains & SSL** → `dachdeckermeister-koenig.de` → **DNS**.
2. Für jeden der 3 Einträge aus Resend: **Eintrag hinzufügen**, Typ (MX oder TXT), Hostname und Wert genau kopieren.
3. **Wichtig:** Die vorhandenen Einträge für dein Postfach (MX von IONOS) nicht ändern oder löschen.
   Die neuen Einträge liegen auf eigenen Unterbereichen (`send…`, `resend._domainkey`) und stören dein Postfach nicht.
4. Zurück bei Resend auf **Verify DNS Records** klicken. Das kann bis zu einer Stunde dauern.
5. In Resend links **API Keys → Create API Key**:
   - Name: `koenig-anfrage`
   - Permission: **Sending access**, Domain: `dachdeckermeister-koenig.de`
   - Den Schlüssel (beginnt mit `re_`) kopieren. Er wird nur einmal angezeigt.

## Schritt 3: Speicher für Fotos anlegen (Cloudflare)

1. Im Cloudflare-Dashboard: **Storage & Databases → Workers KV → Create**.
2. Name: `koenig-anfrage-dateien` → anlegen.
3. Die **ID** des neuen Namespace kopieren.
4. In der Datei `wrangler.toml` `HIER_KV_ID_EINTRAGEN` durch diese ID ersetzen.

Fotos liegen dort nur kurz und löschen sich nach 7 Tagen selbst.

## Schritt 4: Worker veröffentlichen

**Variante A, ohne Programmierwerkzeuge:**
1. Auf GitHub ein neues **privates** Repository `koenig-anfrage` anlegen (Konto Lkx94).
2. **Add file → Upload files**, den Inhalt dieses Ordners hineinziehen (mit dem Ordner `src`).
3. Cloudflare-Dashboard → **Workers & Pages → Create → Import a repository** → `koenig-anfrage` → **Deploy**.

**Variante B, über die Kommandozeile:** im Ordner `npm install` und `npx wrangler deploy`.

Danach in Cloudflare: Worker `koenig-anfrage` → **Settings → Variables and Secrets → Add**:
- Typ: **Secret**
- Name: `RESEND_API_KEY`
- Wert: der Schlüssel aus Schritt 1.5

## Schritt 5: Testen

1. `https://koenig-anfrage.leon-koenig.workers.dev` am Handy öffnen.
2. Eine Testanfrage mit deiner eigenen privaten Mailadresse und 2 Fotos abschicken.
   (Bitte mindestens 15 Sekunden ausfüllen, schnellere Anfragen werden als Spam verworfen.)
3. Prüfen: Mail bei info@ mit Fotos als Anhang, Bestätigung bei deiner Testadresse.
4. Bei info@: auf „Antworten“ klicken, die Antwort geht direkt an den Kunden.

## Schritt 6: Datenschutz abschließen

- **Cloudflare:** Der Auftragsverarbeitungsvertrag (DPA) ist Teil der Nutzungsbedingungen.
  Im Dashboard unter **Manage Account → Configurations → Data Processing Addendum** kannst du ihn ansehen und bestätigen.
- **Resend:** Den Auftragsverarbeitungsvertrag (DPA) auf der Resend-Website abrufen und unterschreiben bzw. bestätigen.
- **Löschfrist einhalten:** Laut Datenschutzhinweisen löschst du Anfrage-Mails ohne Auftrag nach 30 Tagen.
  Am einfachsten: in IONOS einen Ordner „Anfragen“ anlegen und einmal im Monat alles ohne Auftrag löschen, was älter als 30 Tage ist (auch im Papierkorb).
  Wird aus einer Anfrage ein Auftrag, die Mail in den Kundenordner verschieben.
- Die Texte unter `/datenschutz` und `/impressum` sind sorgfältige Entwürfe, aber keine Rechtsberatung.
  Bei Unsicherheit kurz von einem Anwalt oder der Handwerkskammer gegenlesen lassen.

---

## Was wo liegt

| Datei | Inhalt |
|---|---|
| `src/anfrage.html` | Das Formular, das der Kunde sieht |
| `src/datenschutz.html` | Datenschutzhinweise |
| `src/impressum.html` | Impressum |
| `src/index.js` | Annahme der Anfrage, Fotospeicher, Mailversand |
| `wrangler.toml` | Einstellungen für Cloudflare |

Mailadressen und Telefonnummer stehen oben in `src/index.js` (`AN`, `VON`, `TELEFON`).

## Schutz vor Missbrauch

- Verstecktes Feld und Mindest-Ausfüllzeit gegen Spam-Bots.
- Nur Bilder und PDF, höchstens 12 MB je Datei und 25 Dateien je Anfrage.
- Keine Protokolle mit Formularinhalten.
- Falls doch Spam kommt, kann Cloudflare Turnstile (kostenlos) nachgerüstet werden.

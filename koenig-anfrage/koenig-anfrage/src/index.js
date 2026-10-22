// Dachanfrage König – Cloudflare Worker
// Liefert das Anfrageformular aus, nimmt Fotos kurzzeitig an und verschickt die Anfrage per Mail (Resend).
// Datenschutz: Es gibt keine Datenbank. Fotos liegen nur bis zu 7 Tage im KV-Speicher und löschen sich dann selbst.
// Personenbezogene Daten werden nicht geloggt.

import FORMULAR from './anfrage.html';
import DATENSCHUTZ from './datenschutz.html';
import IMPRESSUM from './impressum.html';

const AN = 'info@dachdeckermeister-koenig.de';
const VON = 'Dachdeckermeisterbetrieb König <anfrage@dachdeckermeister-koenig.de>';
const TELEFON = '0173 4024949';

const MAX_DATEI = 12 * 1024 * 1024;        // je Datei
const MAX_DATEIEN = 25;                    // je Anfrage
const MAX_ANHANG_GESAMT = 25 * 1024 * 1024; // Resend erlaubt 40 MB inkl. Base64; was darüber liegt, kommt nur als Link
const SPEICHERDAUER = 60 * 60 * 24 * 7;     // 7 Tage, danach löscht Cloudflare die Datei
const MIN_AUSFUELLZEIT = 15 * 1000;         // schneller füllt nur ein Bot aus
const TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pfad = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (pfad === '/') return seite(FORMULAR);
        if (pfad === '/datenschutz') return seite(DATENSCHUTZ);
        if (pfad === '/impressum') return seite(IMPRESSUM);
        if (pfad.startsWith('/f/')) return dateiAusliefern(pfad.slice(3), env);
        return text('Seite nicht gefunden', 404);
      }
      if (request.method === 'POST' && pfad === '/api/datei') return dateiAnnehmen(request, env);
      if (request.method === 'POST' && pfad === '/api/anfrage') return anfrageAnnehmen(request, env, url.origin);
      return text('Nicht erlaubt', 405);
    } catch (e) {
      console.error('Fehler:', e && e.message); // bewusst ohne Formularinhalte
      return json({ fehler: 'Serverfehler' }, 500);
    }
  },
};

// ---------- Seiten ----------

function seite(html) {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    },
  });
}
function text(t, status = 200) {
  return new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
}

// ---------- Dateien ----------

async function dateiAnnehmen(request, env) {
  const typ = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPEN.includes(typ)) return json({ fehler: 'Dateityp nicht erlaubt' }, 415);
  const groesse = Number(request.headers.get('content-length') || 0);
  if (!groesse) return json({ fehler: 'Leere Datei' }, 400);
  if (groesse > MAX_DATEI) return json({ fehler: 'Datei zu groß' }, 413);

  let name = 'datei';
  try { name = decodeURIComponent(request.headers.get('x-dateiname') || 'datei'); } catch (e) {}
  name = name.replace(/[^\wäöüÄÖÜß.\- ]/g, '_').slice(0, 100) || 'datei';

  const id = crypto.randomUUID();
  await env.DATEIEN.put(id, request.body, {
    expirationTtl: SPEICHERDAUER,
    metadata: { name, typ, groesse },
  });
  return json({ id });
}

async function dateiAusliefern(id, env) {
  if (!UUID.test(id)) return text('Nicht gefunden', 404);
  const { value, metadata } = await env.DATEIEN.getWithMetadata(id, { type: 'stream' });
  if (!value || !metadata) return text('Datei nicht mehr vorhanden (nach 7 Tagen gelöscht)', 404);
  return new Response(value, {
    headers: {
      'content-type': metadata.typ,
      'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(metadata.name),
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

async function dateiMetadaten(id, env) {
  const { value, metadata } = await env.DATEIEN.getWithMetadata(id, { type: 'stream' });
  if (value) await value.cancel();
  return value ? metadata : null;
}

// ---------- Anfrage ----------

async function anfrageAnnehmen(request, env, origin) {
  if (Number(request.headers.get('content-length') || 0) > 200 * 1024) return json({ fehler: 'Zu groß' }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ fehler: 'Ungültig' }, 400); }

  // Spam: verstecktes Feld ausgefüllt oder zu schnell abgeschickt -> still "ok" antworten, nichts senden
  if (body.website) return json({ ok: true });
  if (!body.t || Date.now() - Number(body.t) < MIN_AUSFUELLZEIT) return json({ ok: true });

  const d = body.daten || {};
  const s = (v) => (Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v)).trim();
  const fehlt = [];
  if (!s(d.nachname)) fehlt.push('Nachname');
  if (!s(d.strasse)) fehlt.push('Straße');
  if (!/^\d{5}$/.test(s(d.plz))) fehlt.push('PLZ');
  if (!s(d.ort)) fehlt.push('Ort');
  if (!s(d.telefon)) fehlt.push('Telefon');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s(d.email))) fehlt.push('E-Mail');
  if (!s(d.beschreibung)) fehlt.push('Beschreibung');
  if (d.datenschutz !== true) fehlt.push('Datenschutz');
  if (fehlt.length) return json({ fehler: 'Pflichtfelder fehlen: ' + fehlt.join(', ') }, 422);

  // Dateien prüfen: nur IDs, die es wirklich gibt
  const liste = Array.isArray(body.dateien) ? body.dateien.slice(0, MAX_DATEIEN) : [];
  const dateien = [];
  for (const f of liste) {
    if (!f || !UUID.test(f.id)) continue;
    const meta = await dateiMetadaten(f.id, env);
    if (meta) dateien.push({ id: f.id, name: meta.name, groesse: meta.groesse });
  }

  // Anhänge bis zur Gesamtgrenze, Rest nur als Link
  let summe = 0;
  const anhaenge = [];
  for (const f of dateien) {
    if (summe + f.groesse <= MAX_ANHANG_GESAMT) {
      anhaenge.push({ filename: f.name, path: origin + '/f/' + f.id });
      summe += f.groesse;
    }
  }
  const links = dateien.map((f) => '  ' + f.name + ': ' + origin + '/f/' + f.id).join('\n');

  const inhalt = String(body.text || '').slice(0, 20000);
  const akut = s(d.dringlichkeit).startsWith('Akut');
  const ort = d.gleicheAdresse === 'nein' && s(d.objOrt) ? s(d.objOrt) : s(d.ort);
  const arbeiten = s(d.leistung).slice(0, 100);
  const betreff = (akut ? 'AKUT: ' : '') + 'Dachanfrage ' + s(d.nachname) + ', ' + ort + (arbeiten ? ' · ' + arbeiten : '');

  // 1. Mail an Leon (muss klappen)
  await senden(env, {
    from: VON,
    to: [AN],
    reply_to: s(d.email),
    subject: betreff.slice(0, 180),
    text:
      inhalt +
      '\n\n' +
      (dateien.length
        ? 'Dateien (' + dateien.length + ', als Anhang' + (anhaenge.length < dateien.length ? ', zu große nur als Link' : '') + '). Die Links funktionieren 7 Tage:\n' + links
        : 'Keine Dateien hochgeladen.') +
      '\n\nAntworten auf diese Mail gehen direkt an den Kunden.',
    attachments: anhaenge,
  });

  // 2. Eingangsbestätigung an den Kunden (darf scheitern, ohne die Anfrage zu gefährden)
  try {
    await senden(env, {
      from: VON,
      to: [s(d.email)],
      reply_to: AN,
      subject: 'Ihre Dachanfrage ist eingegangen',
      text: bestaetigung(d, dateien.length, akut, inhalt),
    });
  } catch (e) {
    console.error('Bestätigung nicht gesendet:', e && e.message);
  }

  return json({ ok: true });
}

function bestaetigung(d, anzahlDateien, akut, inhalt) {
  const nn = String(d.nachname || '').trim();
  let anrede = 'Guten Tag ' + [d.vorname, nn].filter(Boolean).join(' ') + ',';
  if (d.anrede === 'Frau') anrede = 'Hallo Frau ' + nn + ',';
  if (d.anrede === 'Herr') anrede = 'Hallo Herr ' + nn + ',';

  // Kopfzeile "NEUE DACHANFRAGE" und Werbequelle für den Kunden weglassen
  const kopie = inhalt
    .split('\n')
    .filter((z) => z !== 'NEUE DACHANFRAGE' && !z.startsWith('Aufmerksam durch:'))
    .join('\n')
    .trim();

  return [
    anrede,
    '',
    'vielen Dank für Ihre Anfrage. Ich habe Ihre Angaben' + (anzahlDateien ? ' und ' + anzahlDateien + (anzahlDateien === 1 ? ' Datei' : ' Dateien') : '') + ' erhalten.',
    '',
    akut
      ? 'Ich melde mich so schnell wie möglich bei Ihnen. Wenn Wasser ins Haus läuft, rufen Sie bitte direkt an: ' + TELEFON + '.'
      : 'Ich schaue mir alles an und melde mich innerhalb von zwei Werktagen bei Ihnen.',
    '',
    'Zur Kontrolle hier noch einmal Ihre Angaben:',
    '',
    kopie,
    '',
    'Für Rückfragen stehe ich gerne zur Verfügung - auch gerne per Telefon, siehe Signatur.',
    '',
    'Mit freundlichen Grüßen',
    '',
    'Leon König',
    'Inhaber | Dachdeckermeister',
    '',
    'Dachdeckermeisterbetrieb König',
    'In Bisholder 34 · 56072 Koblenz',
    'Tel. +49 173 4024949',
    'info@dachdeckermeister-koenig.de',
  ].join('\n');
}

async function senden(env, mail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(mail),
  });
  // Nur den Status loggen: die Fehlermeldung von Resend kann Mailadressen enthalten
  if (!r.ok) throw new Error('Resend-Status ' + r.status);
}

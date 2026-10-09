// Cloudflare Pages Function: POST /api/guide
// Receives the form from exprealtymx.com/claude, then uses Resend to
//  1) email the guide link to the person (in the language they chose), and
//  2) email you the lead details.
// Mail is sent from your own verified domain (SPF/DKIM), so it reaches the inbox far more reliably
// than the generic FormSubmit sender.
//
// Cloudflare Pages > Settings > Variables and secrets (Production):
//   RESEND_API_KEY  (secret)  your Resend API key
//   RESEND_FROM               e.g. Craig Verbeck <craig@send.exprealtymx.com>  (must use the domain verified in Resend)
// If the variables are missing the function answers 503 and the page falls back to FormSubmit.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const reply = (ok, status) => new Response(JSON.stringify({ ok }), { status, headers: JSON_HEADERS });
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SITE = 'https://exprealtymx.com';
const PDFS = {
  es: 'Guia_Claude_para_el_Agente_Inmobiliario.pdf',
  en: 'Quick_Guide_Claude_for_Real_Estate_Agents.pdf',
  fr: 'Guide_Rapide_Claude_pour_Agent_Immobilier.pdf'
};
const COPY = {
  es: { subject: 'Tu guía: Claude para el Agente Inmobiliario', hi: 'Hola', body: 'Gracias por tu interés. Aquí está tu guía rápida de Claude para el Agente Inmobiliario.', btn: 'Descargar la guía (PDF)', help: 'Si tienes dudas o quieres ayuda para empezar, responde a este correo o escríbeme por WhatsApp al +52 984 213 6512.' },
  en: { subject: 'Your guide: Claude for Real Estate Agents', hi: 'Hi', body: 'Thanks for your interest. Here is your quick guide to Claude for Real Estate Agents.', btn: 'Download the guide (PDF)', help: 'If you have questions or want help getting started, reply to this email or message me on WhatsApp at +52 984 213 6512.' },
  fr: { subject: "Votre guide : Claude pour l'agent immobilier", hi: 'Bonjour', body: "Merci de votre intérêt. Voici votre guide rapide de Claude pour l'agent immobilier.", btn: 'Télécharger le guide (PDF)', help: "Pour toute question ou pour de l'aide afin de démarrer, répondez à ce courriel ou écrivez-moi sur WhatsApp au +52 984 213 6512." }
};

async function send(env, m) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html, reply_to: m.reply_to })
  });
  return res.ok;
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const allowed = /^https:\/\/(www\.)?exprealtymx\.com$/.test(origin) || /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin);
  if (!allowed) return reply(false, 403);
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    // Diagnostic: report variable NAMES only (never values) so setup problems are visible.
    const seen = Object.keys(env || {}).filter((k) => /resend/i.test(k)).map((k) => JSON.stringify(k));
    return new Response(JSON.stringify({ ok: false, error: 'missing_env', hasKey: !!env.RESEND_API_KEY, hasFrom: !!env.RESEND_FROM, resendNamesSeen: seen }), { status: 503, headers: JSON_HEADERS });
  }

  let b;
  try { b = await request.json(); } catch (e) { return reply(false, 400); }

  const name = clean(b.name, 100);
  const email = clean(b.email, 150);
  if (name.length < 2) return reply(false, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(false, 400);
  const lang = COPY[b.lang] ? b.lang : 'es';
  const agency = clean(b.agency, 120), phone = clean(b.phone, 30), invitedBy = clean(b.invitedBy, 120);
  const c = COPY[lang];
  const link = SITE + '/guides/' + PDFS[lang];
  const first = name.split(/\s+/)[0];
  const owner = 'craig.verbeck@expmexico.mx';

  const text = c.hi + ' ' + first + ',\n\n' + c.body + '\n\n' + link + '\n\n' + c.help + '\n\nCraig Verbeck\neXp Realty México\n+52 984 213 6512';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1d2b2a;max-width:560px">' +
    '<p>' + esc(c.hi) + ' ' + esc(first) + ',</p><p>' + esc(c.body) + '</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#b98a3e;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">' + esc(c.btn) + '</a></p>' +
    '<p>' + esc(c.help) + '</p><p>Craig Verbeck<br>eXp Realty México<br>+52 984 213 6512</p></div>';

  try {
    const sentToLead = await send(env, { to: email, subject: c.subject, text, html, reply_to: owner });
    // lead notification to you (sent even if the lead email failed, so you never lose a lead)
    const note = 'Nuevo lead (' + lang + ')\nNombre: ' + name + '\nCorreo: ' + email + '\nAgencia: ' + (agency || '-') + '\nInvitado por: ' + (invitedBy || '-') + '\nWhatsApp: ' + (phone || '-') + '\nOrigen: ' + clean(b.source, 60) + '\nEnviada la guía: ' + (sentToLead ? 'sí' : 'NO (falló el envío)');
    await send(env, { to: owner, subject: 'Nuevo lead: guía Claude (' + lang + ') - ' + name, text: note, reply_to: email });
    return reply(sentToLead, sentToLead ? 200 : 502);
  } catch (e) {
    return reply(false, 502);
  }
}

// Cloudflare Pages Function: POST /api/lead
// Receives a lead from the landing page form and sends it to GoHighLevel.
// Preferred mode: GHL API (env GHL_API_TOKEN + GHL_LOCATION_ID) upserts the contact
// and adds tags; the workflow then starts from the free "Contact Tag Added" trigger.
// Optional env: GHL_FIELD_BUDGET, GHL_FIELD_KEYWORD, GHL_FIELD_GCLID (custom field IDs).
// Fallback mode: env GHL_WEBHOOK_URL (Inbound Webhook, premium trigger).
// Secrets live in Cloudflare environment variables, never in the page source.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function reply(ok, status) {
  return new Response(JSON.stringify({ ok }), { status, headers: JSON_HEADERS });
}

function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 200);
}

export async function onRequestPost({ request, env }) {
  // Only accept posts that come from your own site.
  const origin = request.headers.get('Origin') || '';
  const allowed = /^https:\/\/(www\.)?exprealtymx\.com$/.test(origin) || /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin);
  if (!allowed) return reply(false, 403);

  const useApi = !!(env.GHL_API_TOKEN && env.GHL_LOCATION_ID);
  if (!useApi && !env.GHL_WEBHOOK_URL) return reply(false, 503);

  let body;
  try { body = await request.json(); } catch (e) { return reply(false, 400); }

  const name = clean(body.name, 100);
  const email = clean(body.email, 150);
  const phone = clean(body.phone, 30);
  if (name.length < 2) return reply(false, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(false, 400);
  if (phone.replace(/\D/g, '').length < 8) return reply(false, 400);

  const parts = name.split(/\s+/);
  const payload = {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
    email: email,
    phone: phone,
    budget: clean(body.budget, 60),
    gclid: clean(body.gclid, 300),
    utm_source: clean(body.utm_source, 100),
    utm_campaign: clean(body.utm_campaign, 100),
    utm_term: clean(body.utm_term, 150),
    lead_source: 'Google Ads - Playa Condo Guide',
    page: clean(body.page, 100),
    submitted_at: new Date().toISOString()
  };

  try {
    if (useApi) {
      const cf = [];
      if (env.GHL_FIELD_BUDGET && payload.budget) cf.push({ id: env.GHL_FIELD_BUDGET, field_value: payload.budget });
      if (env.GHL_FIELD_KEYWORD && payload.utm_term) cf.push({ id: env.GHL_FIELD_KEYWORD, field_value: payload.utm_term });
      if (env.GHL_FIELD_GCLID && payload.gclid) cf.push({ id: env.GHL_FIELD_GCLID, field_value: payload.gclid });
      const contact = {
        locationId: env.GHL_LOCATION_ID,
        firstName: payload.first_name,
        lastName: payload.last_name,
        email: payload.email,
        phone: payload.phone,
        source: payload.lead_source,
        tags: ['google-ads-buyer']
      };
      if (cf.length) contact.customFields = cf;
      const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + env.GHL_API_TOKEN,
          'Version': '2021-07-28'
        },
        body: JSON.stringify(contact)
      });
      return reply(res.ok, res.ok ? 200 : 502);
    }
    const res = await fetch(env.GHL_WEBHOOK_URL, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
    return reply(res.ok, res.ok ? 200 : 502);
  } catch (e) {
    return reply(false, 502);
  }
}

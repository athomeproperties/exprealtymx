// Cloudflare Pages Function — replaces JSONBin for property listing data.
// Lives at /api/properties on your site (exprealtymx.com/api/properties).
//
// Requires two things set up in the Cloudflare Pages dashboard for this project
// (Settings > Functions):
//   1. A KV namespace binding named PROPERTIES_KV (create the namespace under
//      Workers & Pages > KV, then bind it to this Pages project).
//   2. An environment variable ADMIN_PASSWORD (set as a Secret) matching the
//      password admin.html uses to log in.
//
// GET  /api/properties        -> public, returns the listings array (used by property.html, index.html)
// PUT  /api/properties         -> admin only, requires header X-Admin-Password, replaces the listings array
// OPTIONS is not needed since this is same-origin (no CORS required).

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.PROPERTIES_KV) {
    return new Response(
      JSON.stringify({ error: "PROPERTIES_KV binding is not configured on this Pages project." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const stored = await env.PROPERTIES_KV.get("listings");
  const listings = stored ? JSON.parse(stored) : [];

  return new Response(JSON.stringify(listings), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;

  if (!env.PROPERTIES_KV) {
    return new Response(
      JSON.stringify({ error: "PROPERTIES_KV binding is not configured on this Pages project." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const providedPassword = request.headers.get("X-Admin-Password") || "";
  if (!env.ADMIN_PASSWORD || providedPassword !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  if (!Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "Expected a JSON array of listings" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  await env.PROPERTIES_KV.put("listings", JSON.stringify(body));

  return new Response(JSON.stringify({ ok: true, count: body.length }), {
    headers: { "content-type": "application/json" }
  });
}

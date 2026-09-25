// TEMPORARY DIAGNOSTIC VERSION — same file location as before:
// functions/property.html.js
//
// This is a stripped-down version whose only job is to prove whether
// Cloudflare is actually routing /property.html requests through this
// function at all. It adds a response header ("x-debug-fn: hit") no
// matter what, then falls through to the normal static page unchanged.
// Once we see that header on the live site, we'll know the function is
// being invoked, and can go back to the real version and debug the
// KV/rewrite logic specifically. If the header never shows up, that
// tells us Cloudflare isn't routing this URL through Functions at all,
// which points at a project/deploy-configuration issue instead.
//
// This makes ZERO changes to what visitors see — it only adds one
// invisible response header.

export async function onRequestGet(context) {
  const assetResponse = await context.next();
  const headers = new Headers(assetResponse.headers);
  headers.set('x-debug-fn', 'hit');
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

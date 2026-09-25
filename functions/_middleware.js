// Cloudflare Pages Function — server-side fills in property.html's title,
// meta description, and content for the specific listing in the URL
// (?id=...), before the page is sent out.
//
// FILE LOCATION: functions/_middleware.js (repo root's functions/ folder,
// same level as functions/api/). This REPLACES functions/property.html.js
// entirely -- delete property.html.js once this is in place, don't keep
// both.
//
// Why the change: property.html.js relied on Cloudflare inferring the
// route /property.html from a filename with two dots in it
// ("property" + ".html" + ".js"). That wasn't actually the problem though --
// the REAL cause (confirmed by checking with redirects disabled): Cloudflare
// Pages automatically redirects /property.html to the extension-less
// "clean URL" /property, because a literal file named property.html exists.
// That redirect happens before any single-route function gets a chance to
// run, so no matter what functions/property.html.js was named, it could
// never see the request -- the real, final request is for /property, not
// /property.html.
//
// _middleware.js runs on every request under functions/ (the whole site)
// and checks the URL itself, so it catches the request under either
// spelling, however Cloudflare ends up routing it. For every other URL, it
// calls context.next() immediately and gets out of the way, so it can't
// affect the rest of the site.
//
// Uses the same PROPERTIES_KV binding as functions/api/properties.js --
// no new Cloudflare setup needed.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Only act on the property page itself (with or without the .html
  // Cloudflare strips); everything else passes straight through untouched.
  if (url.pathname !== '/property.html' && url.pathname !== '/property') {
    return context.next();
  }

  const id = url.searchParams.get('id');

  // Get the normal static page first. If anything below fails, we still
  // return this untouched -- the page keeps working exactly as it does today.
  const assetResponse = await context.next();

  if (!id || !env.PROPERTIES_KV) {
    return assetResponse;
  }

  let listings;
  try {
    const stored = await env.PROPERTIES_KV.get('listings');
    listings = stored ? JSON.parse(stored) : [];
  } catch (e) {
    return assetResponse;
  }

  const p = Array.isArray(listings) ? listings.find((l) => l && l.id === id) : null;
  if (!p) {
    return assetResponse;
  }

  try {
    return rewrite(assetResponse, p, url.origin);
  } catch (e) {
    // Never let a bug in this function take down the listing page.
    return assetResponse;
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Mirrors the cldOptimize() helper already inside property.html's own
// <script>, so the server-rendered image URL matches what the client JS
// would have set anyway.
function cldOptimize(u, width) {
  if (!u || typeof u !== 'string') return u;
  if (!/res\.cloudinary\.com/.test(u) || u.indexOf('/upload/') === -1) return u;
  if (/\/upload\/[^/]*w_\d/.test(u)) return u;
  const w = width ? ',w_' + width : '';
  return u.replace('/upload/', '/upload/f_auto,q_auto' + w + '/');
}

function rewrite(assetResponse, p, origin) {
  const allPhotos = p.photos && p.photos.length ? p.photos : p.heroPhoto || p.image ? [p.heroPhoto || p.image] : [];
  const heroSrc = cldOptimize(p.heroPhoto || p.image || '', 1600);
  const galleryMainSrc = cldOptimize(allPhotos[0] || '', 1200);

  const rows = [];
  if (p.area) rows.push(['Location', p.area]);
  if (p.bedrooms) rows.push(['Bedrooms', p.bedrooms]);
  if (p.bathrooms) rows.push(['Bathrooms', p.bathrooms]);
  if (p.size) rows.push(['Size', p.size]);
  if (p.highlights) rows.push(['Highlights', p.highlights]);
  const rowsHtml = rows
    .map((r) => `<div class="detail-row"><span class="detail-label">${esc(r[0])}</span><span class="detail-value">${esc(r[1])}</span></div>`)
    .join('');

  const descHtml = String(p.description || '')
    .split('\n\n')
    .filter(Boolean)
    .map((para) => `<p>${esc(para)}</p>`)
    .join('');

  const amenitiesHtml = (p.amenities || []).map((a) => `<div class="amenity-item"><span class="amenity-icon"></span><span>${esc(a)}</span></div>`).join('');

  const pageTitle = `${p.title} | At Home Realty`;
  const pageDesc = `${p.title} - ${p.area}. ${p.price || ''}. At Home Realty Riviera Maya.`;

  const waMsg = encodeURIComponent(`Hi Craig, I'm interested in ${p.title} in ${p.area}. Can you send me more information?`);
  const waHref = `https://wa.me/529842136512?text=${waMsg}`;

  const priceNumber = String(p.price || '').replace(/[^0-9.]/g, '');
  const currency = /USD/i.test(p.price || '') ? 'USD' : 'MXN';
  // Cloudflare redirects /property.html to /property (see note above), so
  // the canonical URL should point at the address that's actually served,
  // not the one that immediately redirects away from itself.
  const canonicalUrl = `${origin}/property?id=${encodeURIComponent(p.id)}`;

  const jsonLdObj = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: String(p.description || '').slice(0, 500),
    url: canonicalUrl,
    brand: { '@type': 'Organization', name: 'At Home Realty' },
  };
  if (p.heroPhoto || p.image) jsonLdObj.image = p.heroPhoto || p.image;
  if (priceNumber) {
    jsonLdObj.offers = {
      '@type': 'Offer',
      price: priceNumber,
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    };
  }
  const jsonLd = JSON.stringify(jsonLdObj);

  const rewriter = new HTMLRewriter()
    .on('head', {
      element(el) {
        el.append(`<link rel="canonical" href="${canonicalUrl}">`, { html: true });
        el.append(`<meta property="og:title" content="${esc(pageTitle)}">`, { html: true });
        el.append(`<meta property="og:description" content="${esc(pageDesc)}">`, { html: true });
        if (heroSrc) el.append(`<meta property="og:image" content="${esc(heroSrc)}">`, { html: true });
        el.append(`<meta property="og:url" content="${canonicalUrl}">`, { html: true });
        el.append(`<script type="application/ld+json">${jsonLd}<\/script>`, { html: true });
      },
    })
    .on('title#pageTitle', { element(el) { el.setInnerContent(pageTitle); } })
    .on('meta#pageDesc', { element(el) { el.setAttribute('content', pageDesc); } })
    .on('img#heroImg', {
      element(el) {
        if (heroSrc) el.setAttribute('src', heroSrc);
        el.setAttribute('alt', p.title || '');
      },
    })
    .on('div#heroStatus', { element(el) { el.setInnerContent(p.status || ''); } })
    .on('h1#heroTitle', { element(el) { el.setInnerContent(p.title || ''); } })
    .on('p#heroArea', { element(el) { el.setInnerContent(p.area || ''); } })
    .on('img#galleryMain', {
      element(el) {
        if (galleryMainSrc) el.setAttribute('src', galleryMainSrc);
        el.setAttribute('alt', p.title || '');
      },
    })
    .on('span#galleryCounter', { element(el) { el.setInnerContent(`1 / ${allPhotos.length || 1}`); } })
    .on('div#detailsPrice', { element(el) { el.setInnerContent(p.price || ''); } })
    .on('div#detailsDelivery', { element(el) { el.setInnerContent(p.delivery ? `Delivery: ${p.delivery}` : ''); } })
    .on('div#detailsRows', { element(el) { el.setInnerContent(rowsHtml, { html: true }); } })
    .on('h2#descTitle', { element(el) { el.setInnerContent(p.title || ''); } })
    .on('div#descText', { element(el) { el.setInnerContent(descHtml, { html: true }); } })
    .on('div#amenitiesGrid', { element(el) { el.setInnerContent(amenitiesHtml, { html: true }); } })
    .on('input#formProperty', { element(el) { el.setAttribute('value', p.title || ''); } })
    .on('a#whatsappBtn', { element(el) { el.setAttribute('href', waHref); } });

  return rewriter.transform(assetResponse);
}

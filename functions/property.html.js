// Cloudflare Pages Function — server-side fills in property.html's title,
// meta description, and content for the specific listing in the URL
// (?id=...), before the page is sent out. This runs in front of the
// static property.html file (Pages Functions run first; context.next()
// fetches the static asset), so:
//
//   - A crawler that doesn't run JavaScript now sees the real listing
//     (title, price, photos, description, amenities) instead of the
//     generic placeholder shell.
//   - Real visitors see no difference at all: the page's own client-side
//     JavaScript still runs afterward and re-renders the same data (or a
//     different language, if the visitor has ES/FR selected). This
//     function only affects what's in the initial HTML response.
//
// File location matters: this must live at functions/property.html.js in
// the repo root (same level as the existing functions/api/properties.js).
// Cloudflare Pages Functions route by file path with the .js stripped, so
// this file maps to the exact route /property.html.
//
// Uses the same PROPERTIES_KV binding as functions/api/properties.js —
// no new Cloudflare setup needed.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // Get the normal static page first. If anything below fails, we still
  // return this untouched — the page keeps working exactly as it does today.
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
  const canonicalUrl = `${origin}/property.html?id=${encodeURIComponent(p.id)}`;

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

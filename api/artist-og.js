const fs = require('fs');
const path = require('path');

// Deterministic 22-Char Base62 Hash generator matching audioUtils.js
function getArtistUniqueId(artist) {
    if (!artist) return '';
    const rawId = String(artist.id || '').trim();
    if (/^[0-9a-zA-Z]{22}$/.test(rawId)) {
        return rawId;
    }

    const key = String(artist.name || artist.id || '').trim().toLowerCase();
    if (!key) return '';

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    // FNV-1a 32-bit Hash
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    // Deterministic Pseudo-Random Generator (LCG) with unsigned 32-bit
    let state = hash >>> 0;
    let result = '';
    for (let i = 0; i < 22; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const code = key.charCodeAt(i % key.length) || 0;
        const index = Math.abs((state + code + i) % chars.length);
        result += chars.charAt(index % chars.length);
    }
    return result;
}

// Safely load artists list
let cachedArtists = null;
function getArtistsList() {
    if (cachedArtists) return cachedArtists;
    try {
        // Require directly so Vercel Node File Trace bundles it into the function
        cachedArtists = require('../public/data/artists.json');
        if (Array.isArray(cachedArtists)) return cachedArtists;
    } catch {
        try {
            const p = path.join(process.cwd(), 'public', 'data', 'artists.json');
            if (fs.existsSync(p)) {
                cachedArtists = JSON.parse(fs.readFileSync(p, 'utf8'));
                return cachedArtists;
            }
        } catch (e) {
            console.error('Could not load artists.json:', e);
        }
    }
    return [];
}

module.exports = async (req, res) => {
    const artistId = String(req.query.id || '').trim();
    const queryName = String(req.query.name || '').trim();
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'spotiwind-music.vercel.app';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;

    const artists = getArtistsList();
    const lowerId = artistId.toLowerCase();
    const lowerName = queryName.toLowerCase();

    let matched = artists.find(a => {
        const uid = getArtistUniqueId(a);
        const aId = String(a.id || '').toLowerCase().trim();
        const aName = String(a.name || '').toLowerCase().trim();
        const aSlug = aName.replace(/\s+/g, '-');

        return (uid && uid === artistId) ||
               (aId && aId === lowerId) ||
               (aSlug && aSlug === lowerId) ||
               (aName && aName === lowerId) ||
               (queryName && (aName === lowerName || aSlug === lowerName.replace(/\s+/g, '-')));
    });

    const artistName = matched ? matched.name : (queryName || 'Artist');
    let photoPath = matched && matched.photo ? matched.photo : '';

    if (photoPath) {
        photoPath = photoPath
            .replace(/^(\.\.\/)+public\//, '')
            .replace(/^(\.\.\/)+/, '')
            .replace(/^\/?frontend\/public\//, '')
            .replace(/^\/?public\//, '')
            .replace(/^\/+/, '');
    }

    const ogImage = photoPath
        ? `${baseUrl}/public/${photoPath}`
        : `${baseUrl}/public/branding/Spotiwind%20OG%20Image.jpg`;
    const ogImageType = photoPath ? 'image/webp' : 'image/jpeg';
    const ogImageWidth = photoPath ? '640' : '1200';
    const ogImageHeight = photoPath ? '640' : '630';

    const pageUrl = `${baseUrl}/artist/${artistId}`;
    const pageTitle = `${artistName} | Spotiwind`;
    const ogTitle = `${artistName} • Artist on Spotiwind`;
    const pageDesc = `Listen to ${artistName} on Spotiwind. Stream top songs, albums, and full discography in high audio quality.`;

    let html = '';
    try {
        const indexPath = path.join(process.cwd(), 'index.html');
        html = fs.readFileSync(indexPath, 'utf8');
    } catch {
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${pageTitle}</title></head><body><script>window.location.replace('/');</script></body></html>`;
    }

    // Dynamic Meta Tags to inject
    const dynamicMetaTags = `
    <!-- Dynamic Artist OpenGraph Tags (WhatsApp / Social Media Preview) -->
    <title>${pageTitle}</title>
    <meta name="title" content="${ogTitle}">
    <meta name="description" content="${pageDesc}">
    <meta property="og:type" content="music.musician">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:site_name" content="Spotiwind">
    <meta property="og:title" content="${ogTitle}">
    <meta property="og:description" content="${pageDesc}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:secure_url" content="${ogImage}">
    <meta property="og:image:type" content="${ogImageType}">
    <meta property="og:image:width" content="${ogImageWidth}">
    <meta property="og:image:height" content="${ogImageHeight}">
    <meta property="og:image:alt" content="Official profile of ${artistName}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${pageUrl}">
    <meta name="twitter:title" content="${ogTitle}">
    <meta name="twitter:description" content="${pageDesc}">
    <meta name="twitter:image" content="${ogImage}">
    `;

    // Strip any existing static title or og tags to prevent duplicate meta tags
    html = html.replace(/<title>.*?<\/title>/gi, '');
    html = html.replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, '');

    if (html.includes('</head>')) {
        html = html.replace('</head>', `${dynamicMetaTags}\n</head>`);
    } else {
        html = `${dynamicMetaTags}\n${html}`;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).send(html);
};

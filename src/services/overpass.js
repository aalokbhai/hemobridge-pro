// Nearby blood banks (OpenStreetMap / Overpass API) - 10 minute cache ke saath
const cache = new Map();

// Ek server na chale to agla try hota hai
const SERVERS = (process.env.OVERPASS_URLS || [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
].join(',')).split(',');

async function nearby(lat, lng, radiusKm) {
  const key = [lat.toFixed(2), lng.toFixed(2), radiusKm].join();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 6e5) return hit.v;

  const a = `(around:${radiusKm * 1000},${lat},${lng})`;
  const q = `[out:json][timeout:25];(nwr["amenity"="blood_bank"]${a};nwr["healthcare"="blood_bank"]${a};nwr["healthcare"="blood_donation"]${a};);out center tags;`;

  let json, err;
  for (const url of SERVERS) {
    try {
      const x = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'HemoBridge/3.0 (student project)',
        },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(20000),
      });
      if (!x.ok) throw new Error('HTTP ' + x.status);
      json = await x.json();
      break;
    } catch (e) {
      err = e;
      console.log(`[bloodbanks] ${new URL(url).host} fail: ${(e.cause && (e.cause.code || e.cause.message)) || e.name + ' ' + e.message}`);
    }
  }
  if (!json) throw err;

  const R = Math.PI / 180;
  const v = json.elements.map(e => {
    const t = e.tags || {}, c = e.center || e, la = c.lat, lo = e.lon != null ? e.lon : c.lon;
    const x = Math.sin((la - lat) * R / 2) ** 2 + Math.cos(lat * R) * Math.cos(la * R) * Math.sin((lo - lng) * R / 2) ** 2;
    return {
      name: t.name || 'Blood bank (name not listed)', lat: la, lng: lo,
      phone: t.phone || t['contact:phone'] || '',
      address: [t['addr:housename'], t['addr:street'], t['addr:suburb'], t['addr:city']].filter(Boolean).join(', '),
      hours: t.opening_hours || '',
      d: 12742 * Math.asin(Math.sqrt(x)),
    };
  }).sort((p, q2) => p.d - q2.d);

  cache.set(key, { t: Date.now(), v });
  return v;
}

module.exports = { nearby };

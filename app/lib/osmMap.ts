/** OpenStreetMap helpers — real map tiles without Google API key */

export function osmStaticMapUrl(lat: number, lng: number, width = 640, height = 320): string {
  const w = Math.min(Math.max(width, 200), 1024);
  const h = Math.min(Math.max(height, 120), 768);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=${w}x${h}&markers=${lat},${lng},red-pushpin`;
}

export function osmEmbedUrl(lat: number, lng: number, pad = 0.012): string {
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}

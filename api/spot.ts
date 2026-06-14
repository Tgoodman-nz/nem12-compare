export const config = { runtime: 'edge' };

const OE_BASE = 'https://api.openelectricity.org.au';

export default async function handler(req: Request): Promise<Response> {
  const apiKey = process.env.VITE_OE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(req.url);
  const upstream = await fetch(`${OE_BASE}/v4/market/network/NEM?${searchParams}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

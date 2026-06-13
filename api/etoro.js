// api/etoro.js
// Endpoint que lee la cartera de eToro y traduce los instrumentID a nombres.
// Las keys van como variables de entorno en Vercel (NUNCA en el frontend):
//   ETORO_API_KEY  → tu x-api-key
//   ETORO_USER_KEY → tu x-user-key
// Devuelve las posiciones con el nombre real de cada instrumento, listas para que la IA las analice.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.ETORO_API_KEY;
  const USER_KEY = process.env.ETORO_USER_KEY;
  if (!API_KEY || !USER_KEY) {
    return res.status(500).json({ error: 'Faltan ETORO_API_KEY o ETORO_USER_KEY en las variables de entorno' });
  }

  const API_BASE = 'https://public-api.etoro.com/api/v1';
  const headers = {
    'x-api-key': API_KEY,
    'x-user-key': USER_KEY,
    'x-request-id': crypto.randomUUID(),
    'Accept': 'application/json',
  };

  try {
    // 1) Traer la cartera (cuenta Demo — sin riesgo).
    const portfolioRes = await fetch(`${API_BASE}/trading/info/demo/portfolio`, { headers });
    if (!portfolioRes.ok) {
      const err = await portfolioRes.text();
      return res.status(portfolioRes.status).json({ error: `eToro portfolio: ${err}` });
    }
    const portfolioData = await portfolioRes.json();
    const positions = portfolioData?.clientPortfolio?.positions || [];

    if (positions.length === 0) {
      return res.status(200).json({ positions: [], message: 'La cartera no tiene posiciones abiertas.' });
    }

    // 2) Traducir cada instrumentID a su nombre real y su símbolo (ticker).
    const ids = [...new Set(positions.map(p => p.instrumentID))];
    const namesById = {};
    const tickersById = {};

    try {
      const metaRes = await fetch(
        `${API_BASE}/market-data/instruments?instrumentIds=${ids.join(',')}`,
        { headers: { ...headers, 'x-request-id': crypto.randomUUID() } }
      );
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        const items = metaData?.instrumentDisplayDatas || [];
        items.forEach(it => {
          if (it.instrumentID != null) {
            if (it.instrumentDisplayName) namesById[it.instrumentID] = it.instrumentDisplayName;
            if (it.symbolFull) tickersById[it.instrumentID] = it.symbolFull;
          }
        });
      }
    } catch (_) {
      // Si falla la traducción, seguimos sin nombres (no rompemos todo).
    }

    // 3) Armar una cartera limpia y entendible para la IA.
    const cleanPositions = positions.map(p => {
      const invertido = p.initialAmountInDollars ?? p.amount ?? 0;
      return {
        nombre: namesById[p.instrumentID] || `Instrumento #${p.instrumentID}`,
        ticker: tickersById[p.instrumentID] || null,
        instrumentID: p.instrumentID,
        tipo: p.isBuy ? 'compra (long)' : 'venta (short)',
        invertido_usd: Math.round(invertido * 100) / 100,
        unidades: p.units,
        precio_apertura: p.openRate,
        apalancamiento: p.leverage,
        fecha_apertura: p.openDateTime,
      };
    });

    // Total invertido para calcular porcentajes (útil para el análisis de concentración).
    const totalInvertido = cleanPositions.reduce((s, p) => s + (p.invertido_usd || 0), 0);
    cleanPositions.forEach(p => {
      p.porcentaje_cartera = totalInvertido > 0
        ? Math.round((p.invertido_usd / totalInvertido) * 1000) / 10
        : 0;
    });

    return res.status(200).json({
      positions: cleanPositions,
      total_invertido_usd: Math.round(totalInvertido * 100) / 100,
      credito_disponible: portfolioData?.clientPortfolio?.credit ?? null,
      cantidad_posiciones: cleanPositions.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { image, imageType, prompt, region, risk, horizon, chips } = req.body;

  // ── Portfolio image analysis ──
  if (image) {
    const content = [
      { type: 'image', source: { type: 'base64', media_type: imageType || 'image/png', data: image } },
      { type: 'text', text: prompt }
    ];
    return callClaude(content, res);
  }

  // ── Weekly report: fetch real data ──
  const tickersByRegion = {
    US: ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'GOOGL', 'AMD'],
    EU: ['ASML', 'SAP', 'NVO', 'SIEGY', 'IDEXY'],
    Global: ['NVDA', 'AAPL', 'TSM', 'AMZN', 'BABA'],
    LatAm: ['YPF', 'MELI', 'VALE', 'PBR', 'ITUB'],
  };
  const tickers = tickersByRegion[region] || tickersByRegion['US'];

  const [marketData, newsData] = await Promise.all([
    fetchYahooFinance(tickers),
    fetchNews(region, process.env.NEWSAPI_KEY),
  ]);

  const reportPrompt = `Sos un analista financiero senior. Basándote ÚNICAMENTE en estos datos reales, generá un informe semanal.

DATOS DE MERCADO EN TIEMPO REAL (${new Date().toLocaleDateString('es-AR')}):
${marketData}

NOTICIAS FINANCIERAS RECIENTES:
${newsData}

CONFIGURACIÓN:
- Mercado: ${region}
- Perfil de riesgo: ${risk}
- Horizonte: ${horizon}
- Enfoques: ${(chips||[]).join(', ')}

Respondé ÚNICAMENTE con JSON (sin markdown):
{
  "sentimiento": "bullish"|"bearish"|"neutral",
  "sp500_semanal": "+1.2%",
  "vix": "18.5",
  "nasdaq_semanal": "+0.8%",
  "resumen": "2-3 oraciones basadas en los datos reales",
  "ideas": [
    {
      "ticker": "NVDA",
      "nombre": "NVIDIA Corp.",
      "tendencia": "positiva"|"negativa"|"neutral",
      "accion": "comprar"|"mantener"|"reducir",
      "tesis": "2-3 oraciones con datos reales del precio y noticias",
      "senales": ["Señal 1 con dato real", "Señal 2", "Señal 3"],
      "fuentes": ["Yahoo Finance", "NewsAPI"],
      "catalizador": "Catalizador concreto de esta semana"
    }
  ],
  "insights": [{"texto": "Insight real", "fuente": "Fuente real"}],
  "riesgo_semana": "Riesgo basado en noticias actuales",
  "sectores": ["Sector1", "Sector2"]
}`;

  return callClaude(reportPrompt, res);
}

// ── Yahoo Finance (no key needed) ──
async function fetchYahooFinance(tickers) {
  try {
    const symbols = tickers.slice(0, 8).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!res.ok) throw new Error('Yahoo Finance error');
    const data = await res.json();
    const quotes = data?.quoteResponse?.result || [];
    
    if (quotes.length === 0) throw new Error('No quotes');

    // Also get index data
    const indexRes = await fetch(
      'https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,%5EIXIC,%5EVIX&fields=regularMarketPrice,regularMarketChangePercent',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const indexData = await indexRes.json();
    const indices = indexData?.quoteResponse?.result || [];
    
    const sp500 = indices.find(i => i.symbol === '^GSPC');
    const nasdaq = indices.find(i => i.symbol === '^IXIC');
    const vix = indices.find(i => i.symbol === '^VIX');

    let result = '';
    if (sp500) result += `S&P 500: ${sp500.regularMarketPrice?.toFixed(2)} (${sp500.regularMarketChangePercent?.toFixed(2)}% hoy)\n`;
    if (nasdaq) result += `NASDAQ: ${nasdaq.regularMarketPrice?.toFixed(2)} (${nasdaq.regularMarketChangePercent?.toFixed(2)}% hoy)\n`;
    if (vix) result += `VIX: ${vix.regularMarketPrice?.toFixed(2)}\n\n`;

    result += quotes.map(q => 
      `${q.symbol}: $${q.regularMarketPrice?.toFixed(2)} | cambio: ${q.regularMarketChangePercent?.toFixed(2)}% | 52w High: $${q.fiftyTwoWeekHigh?.toFixed(2)} | 52w Low: $${q.fiftyTwoWeekLow?.toFixed(2)}`
    ).join('\n');

    return result;
  } catch (e) {
    return `Error obteniendo precios: ${e.message}`;
  }
}

// ── NewsAPI ──
async function fetchNews(region, apiKey) {
  if (!apiKey) return 'NewsAPI no configurado';
  const queries = {
    US: 'stock market Wall Street earnings investment',
    EU: 'European stock market economy',
    Global: 'global stock market economy',
    LatAm: 'Latin America stock market',
  };
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(queries[region]||queries.US)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`
    );
    const data = await res.json();
    if (data.status !== 'ok') return 'Error NewsAPI: ' + data.message;
    return (data.articles||[]).slice(0,10)
      .map(a => `- ${a.title} (${a.source?.name}, ${a.publishedAt?.slice(0,10)})`)
      .join('\n');
  } catch(e) {
    return 'Error noticias: ' + e.message;
  }
}

// ── Call Claude ──
async function callClaude(content, res) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'Sos un analista financiero senior. Respondés en español con JSON estructurado cuando se te pide. Usás los datos reales provistos para tu análisis.',
        messages: [{ role: 'user', content }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    const textContent = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    return res.status(200).json({ content: textContent });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

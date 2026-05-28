export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, image, imageType } = req.body;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const FINNHUB = process.env.FINNHUB_API_KEY;
  const NEWSAPI = process.env.NEWSAPI_KEY;

  // ── If image analysis (portfolio tab) ──
  if (image) {
    const content = [
      { type: 'image', source: { type: 'base64', media_type: imageType || 'image/png', data: image } },
      { type: 'text', text: prompt }
    ];
    return callClaude(content, res);
  }

  // ── Weekly report: fetch real data first ──
  const { region, risk, horizon, chips } = req.body;

  // Tickers to analyze based on region
  const tickersByRegion = {
    US: ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'GOOGL', 'AMD'],
    EU: ['ASML', 'SAP', 'LVMH', 'SIEGY', 'NESN'],
    Global: ['NVDA', 'AAPL', 'TSMC', 'AMZN', 'BABA'],
    LatAm: ['YPF', 'MercadoLibre', 'VALE', 'PBR', 'ITUB'],
  };
  const tickers = tickersByRegion[region] || tickersByRegion['US'];

  // Fetch data in parallel
  const [marketData, newsData] = await Promise.all([
    fetchMarketData(tickers, FINNHUB),
    fetchNews(region, NEWSAPI),
  ]);

  // Build data context for Claude (cheap - just redact)
  const dataContext = `
DATOS DE MERCADO EN TIEMPO REAL (${new Date().toLocaleDateString('es-AR')}):
${marketData}

NOTICIAS FINANCIERAS RECIENTES:
${newsData}

CONFIGURACIÓN DEL INVERSOR:
- Mercado: ${region}
- Perfil de riesgo: ${risk}
- Horizonte: ${horizon}
- Enfoques: ${chips?.join(', ')}
`;

  const reportPrompt = `Sos un analista financiero senior. Basándote ÚNICAMENTE en los datos reales proporcionados abajo, generá un informe semanal.

${dataContext}

Respondé ÚNICAMENTE con un JSON (sin markdown):
{
  "sentimiento": "bullish" | "bearish" | "neutral",
  "sp500_semanal": "+1.2%",
  "vix": "18.5",
  "nasdaq_semanal": "+0.8%",
  "resumen": "2-3 oraciones resumiendo el mercado basadas en los datos reales",
  "ideas": [
    {
      "ticker": "AAPL",
      "nombre": "Apple Inc.",
      "tendencia": "positiva" | "negativa" | "neutral",
      "accion": "comprar" | "mantener" | "reducir",
      "tesis": "2-3 oraciones con análisis objetivo basado en los datos reales",
      "senales": ["Señal concreta 1 de los datos", "Señal concreta 2", "Señal concreta 3"],
      "fuentes": ["Finnhub", "NewsAPI"],
      "catalizador": "El catalizador clave de esta semana basado en las noticias reales"
    }
  ],
  "insights": [
    {
      "texto": "Insight basado en datos reales",
      "fuente": "Fuente real de la noticia"
    }
  ],
  "riesgo_semana": "El principal riesgo basado en las noticias actuales",
  "sectores": ["Sector1", "Sector2"]
}`;

  return callClaude(reportPrompt, res);
}

// ── Fetch stock data from Finnhub ──
async function fetchMarketData(tickers, apiKey) {
  if (!apiKey) return 'Finnhub no configurado';

  try {
    const results = await Promise.all(
      tickers.slice(0, 6).map(async ticker => {
        try {
          const [quoteRes, recRes] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`),
            fetch(`https://finnhub.io/api/v1/recommendation-trends?symbol=${ticker}&token=${apiKey}`),
          ]);
          const quote = await quoteRes.json();
          const rec = await recRes.json();
          const latest = rec?.[0];
          const change = quote.dp ? `${quote.dp > 0 ? '+' : ''}${quote.dp.toFixed(2)}%` : 'N/A';
          const recSummary = latest
            ? `Buy:${latest.buy} Hold:${latest.hold} Sell:${latest.sell}`
            : 'sin datos';
          return `${ticker}: precio $${quote.c || 'N/A'} | cambio ${change} | analistas: ${recSummary}`;
        } catch {
          return `${ticker}: sin datos`;
        }
      })
    );
    return results.join('\n');
  } catch {
    return 'Error obteniendo datos de mercado';
  }
}

// ── Fetch news from NewsAPI ──
async function fetchNews(region, apiKey) {
  if (!apiKey) return 'NewsAPI no configurado';

  const queries = {
    US: 'stock market Wall Street earnings',
    EU: 'European stock market DAX CAC',
    Global: 'global stock market economy',
    LatAm: 'Latin America stock market economy',
  };
  const q = queries[region] || queries['US'];

  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=8&apiKey=${apiKey}`
    );
    const data = await res.json();
    if (data.status !== 'ok') return 'Error en NewsAPI';

    return (data.articles || [])
      .slice(0, 8)
      .map(a => `- ${a.title} (${a.source?.name}, ${a.publishedAt?.slice(0, 10)})`)
      .join('\n');
  } catch {
    return 'Error obteniendo noticias';
  }
}

// ── Call Claude (text or vision) ──
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
        system: 'Sos un analista financiero senior. Respondés en español con JSON estructurado cuando se te pide. Basás tus análisis en los datos concretos que te proveen.',
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const textContent = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return res.status(200).json({ content: textContent });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

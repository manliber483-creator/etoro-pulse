export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { prompt, image, imageType } = req.body;

  let content;
  if (image) {
    content = [
      { type: 'image', source: { type: 'base64', media_type: imageType || 'image/png', data: image } },
      { type: 'text', text: prompt }
    ];
  } else {
    content = prompt;
  }

  // Use web search for reports, not for portfolio image analysis
  const useSearch = !image;
  const tools = useSearch ? [{ type: 'web_search_20250305', name: 'web_search' }] : undefined;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: 'Sos un analista financiero senior. Respondés en español con JSON estructurado cuando se te pide. Usás datos reales del mercado actual para tu análisis.',
        messages: [{ role: 'user', content }],
        ...(tools && { tools }),
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

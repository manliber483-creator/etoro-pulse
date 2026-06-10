export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  const { prompt, image, imageType, images } = req.body;
  let content;
  // Soporta varias imágenes (images: array de {data, type}) o una sola (image, imageType) por compatibilidad
  let imageList = [];
  if (Array.isArray(images) && images.length > 0) {
    imageList = images.slice(0, 3); // tope de 3 imágenes para controlar costo
  } else if (image) {
    imageList = [{ data: image, type: imageType }];
  }
  if (imageList.length > 0) {
    content = [
      ...imageList.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type || 'image/png', data: img.data } })),
      { type: 'text', text: prompt }
    ];
  } else {
    content = prompt;
  }
  // Web search solo para informes (no para análisis de imagen)
  const useSearch = imageList.length === 0;
  // max_uses limita cuántas búsquedas hace Claude → controla el costo
  const tools = useSearch ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] : undefined;
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
        // Subido de 4000 a 8000 para que el JSON del informe no se trunque
        // (con 4000, las "ideas de la semana" quedaban cortadas y no renderizaban)
        max_tokens: 8000,
        system: 'Sos un analista financiero senior. SIEMPRE respondés ÚNICAMENTE con JSON puro, sin texto antes ni después, sin markdown, sin explicaciones. Solo el objeto JSON.',
        messages: [{ role: 'user', content }],
        ...(tools && { tools }),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const data = await response.json();
    let textContent = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    // Strip markdown fences server-side
    textContent = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Extract JSON if there's text before it
    const start = textContent.indexOf('{');
    const end = textContent.lastIndexOf('}');
    if (start > 0 && end > start) {
      textContent = textContent.slice(start, end + 1);
    }

    return res.status(200).json({ content: textContent });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

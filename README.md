# eToro Pulse — Informe Semanal de Inversiones con IA

## 🚀 Deploy en Vercel (5 minutos)

### 1. Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/etoro-pulse.git
git push -u origin main
```

### 2. Importar en Vercel
1. Entrá a [vercel.com/new](https://vercel.com/new)
2. Importá tu repo de GitHub
3. Dejá todas las opciones por defecto
4. Antes de hacer Deploy, agregá la variable de entorno:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** tu API key de Anthropic (conseguila en [console.anthropic.com](https://console.anthropic.com))
5. Hacé Deploy

### 3. Configurar la URL en el sitio
Una vez deployado, copiá tu URL (ej. `https://etoro-pulse.vercel.app`) y pegá en el campo:
```
https://etoro-pulse.vercel.app/api/report
```

---

## 📁 Estructura del proyecto

```
etoro-weekly/
├── index.html          # Frontend completo (2 tabs)
├── api/
│   └── report.js       # Backend serverless (llama a Anthropic)
├── vercel.json         # Configuración de rutas
└── README.md
```

---

## ✨ Funcionalidades

### Tab 1 — Informe Semanal
- Configurable: mercado, perfil de riesgo, horizonte, enfoques
- La IA busca noticias actuales vía web search
- Genera 4 ideas de acciones con tesis, catalizador y popularidad en eToro
- Métricas: S&P 500, NASDAQ, VIX, sentimiento de mercado
- Insights accionables con fuente
- Riesgo principal de la semana
- Sectores a monitorear

### Tab 2 — Análisis de Cartera
- Ingresás tus posiciones: ticker, precio de compra, precio actual, cantidad, % del portafolio
- La IA analiza cada posición con contexto actual del mercado
- Veredicto por posición: MANTENER / REFORZAR / REDUCIR / SALIR
- Score general del portafolio (1-10)
- Nivel de diversificación y riesgo real
- 3 recomendaciones accionables
- Alertas urgentes si las hay

---

## 🔧 Deploy en Netlify (alternativa)

1. Netlify no soporta serverless functions Node.js directamente — en ese caso usá Vercel.
2. Alternativa: usá [Netlify Functions](https://docs.netlify.com/functions/overview/) con la misma lógica de `api/report.js`.

---

## 💡 Tips

- Podés regenerar el informe cuantas veces quieras cambiando los filtros
- Los análisis de cartera usan búsqueda web en tiempo real, así que los resultados son contextuales al mercado de hoy
- La API key nunca se expone al cliente — siempre pasa por el backend

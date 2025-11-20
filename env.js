// Configuración de variables de entorno para Flutter Web
// Este archivo se carga antes que main.dart.js
// INSTRUCCIONES:
// 1. Reemplaza 'YOUR_API_KEY_HERE' con tu API key real de OpenAI
// 2. O mejor: usa el backend proxy (api/openai.js) para mayor seguridad

window.flutterConfig = {
  // API Key de OpenAI (opcional si usas backend proxy)
  OPENAI_API_KEY: 'YOUR_API_KEY_HERE',
  
  // URL del backend proxy (recomendado)
  BACKEND_URL: 'https://bamban-web.vercel.app/api/openai',
  
  // Ambiente: 'development' o 'production'
  ENVIRONMENT: 'production'
};

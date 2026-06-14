import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        // In local dev, proxy /api/spot to OE API with the key added server-side.
        // In production, Vercel routes /api/spot to api/spot.ts edge function instead.
        '/api/spot': {
          target: 'https://api.openelectricity.org.au',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/spot/, '/v4/market/network/NEM'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.VITE_OE_API_KEY}`);
            });
          },
        },
      },
    },
  };
});

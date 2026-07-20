import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                        return 'react-vendor';
                    }
                },
            },
        },
        chunkSizeWarningLimit: 500,
    },
    server: {
        port: 5174,
        proxy: {
            '/api': { target: 'http://localhost:3002', changeOrigin: true },
        },
    },
});

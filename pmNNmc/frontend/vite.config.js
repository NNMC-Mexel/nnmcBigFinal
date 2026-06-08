import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var apiTarget = env.VITE_API_URL || 'http://localhost:1337';
    var devPort = Number(env.VITE_DEV_PORT || 13005);
    return {
        plugins: [react()],
        server: {
            host: '0.0.0.0',
            port: devPort,
            proxy: {
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});

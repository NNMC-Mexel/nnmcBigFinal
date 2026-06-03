import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.nnmc.webportal',
  appName: 'NNMC Portal',
  webDir: 'dist',
  server: {
    // Serve the webview over http://localhost so it shares the same (insecure)
    // context as the LAN http backend. This avoids https->http mixed-content
    // blocking of images and the notifications WebSocket (ws://). localhost is
    // still treated as a secure context by the WebView.
    androidScheme: 'http',
    // LAN backends are served over plain HTTP; allow cleartext.
    // Scoped to 192.168.101.25 via android/.../network_security_config.xml.
    cleartext: true,
  },
  plugins: {
    // Route fetch/XHR (axios) through native HTTP so requests to the LAN
    // backend bypass browser CORS and https→http mixed-content blocking.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;

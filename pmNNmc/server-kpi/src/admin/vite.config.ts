import { mergeConfig, type UserConfig } from 'vite';

export default (config: UserConfig) => {
  return mergeConfig(config, {
    server: {
      port: 5175,
      strictPort: true,
      hmr: { port: 5175 },
    },
  });
};

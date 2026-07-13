import { readdirSync } from 'node:fs';
import process from 'node:process';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import type { Plugin } from 'vite';

// WoW icon dump for the Card Lab (internal testing art). Lives OUTSIDE the
// repo and OneDrive on purpose: 23k files. Dev-server only; missing folder
// just means an empty picker.
const ICONS_DIR = 'C:/DicemancerAssets/wow-ui-textures/ICONS';

function iconManifest(): Plugin {
  return {
    name: 'wow-icon-manifest',
    configureServer(server) {
      server.middlewares.use('/wow-icons.json', (_req, res) => {
        let names: string[] = [];
        try {
          names = readdirSync(ICONS_DIR).filter((f) => f.toLowerCase().endsWith('.png'));
        } catch {
          // folder not on this machine; empty manifest
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(names));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), iconManifest()],
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), 'C:/DicemancerAssets'] },
  },
});

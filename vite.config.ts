import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
      // Full catalog for the Lab picker (overrides the shipped-subset
      // public/wow-icons.json while developing on a machine with the dump).
      server.middlewares.use('/wow-icons.json', (_req, res, next) => {
        let names: string[] = [];
        try {
          names = readdirSync(ICONS_DIR).filter((f) => f.toLowerCase().endsWith('.png'));
        } catch {
          next(); // folder not on this machine; fall through to public/
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(names));
      });
      // Serve any icon from the local dump at the shipped URL shape, so
      // freshly picked Lab icons render before they are synced into public/.
      server.middlewares.use('/icons', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''));
        if (!name || name.includes('..') || name.includes('/')) {
          next();
          return;
        }
        try {
          const buf = readFileSync(join(ICONS_DIR, name));
          res.setHeader('Content-Type', 'image/png');
          res.end(buf);
        } catch {
          next(); // not in the dump; public/icons (or a 404) handles it
        }
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/; CI sets DEPLOY_BASE.
  base: process.env.DEPLOY_BASE ?? '/',
  plugins: [react(), iconManifest()],
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), 'C:/DicemancerAssets'] },
  },
});

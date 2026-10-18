import { cpSync, mkdirSync } from 'node:fs';
// Local fonts and CMaps keep course PDFs readable without a third-party CDN.
mkdirSync(new URL('../public/pdf-assets/', import.meta.url), { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(new URL(`../node_modules/pdfjs-dist/${name}/`, import.meta.url), new URL(`../public/pdf-assets/${name}/`, import.meta.url), { recursive: true });
}

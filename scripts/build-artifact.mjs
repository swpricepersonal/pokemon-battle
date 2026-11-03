// Builds dist-artifact/battle-simulator.html: one standalone page with the app's
// CSS and JS inlined and React loaded from cdnjs.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execSync('npx vite build --config vite.artifact.config.ts', { stdio: 'inherit' });

const js = readFileSync('dist-artifact/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('dist-artifact/app.css', 'utf8');

const html = `<title>Singles Battle Simulator</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
writeFileSync('dist-artifact/battle-simulator.html', html);
console.log(`Wrote dist-artifact/battle-simulator.html (${(html.length / 1024).toFixed(1)} KB)`);

// Inlines src/*.css and src/*.js into one self-contained dist/index.html.
// Run with: npm run build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = (f) => readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
let html = src('index.html');

// Use a function replacer: a plain string replacement would treat "$'" and "$&" inside the code as special patterns.
html = html.replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, () => `<style>\n${src('styles.css')}\n</style>`);

const scripts = ['engine.js', 'scenarios.js', 'guide.js', 'course.js', 'hardware.js', 'app.js'];
// Escape any "</script" inside the code so it cannot close the tag early.
const js = scripts.map((f) => `/* ---- ${f} ---- */\n${src(f)}`).join('\n').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<!-- build:js -->[\s\S]*?<!-- \/build:js -->/, () => `<script>\n${js}\n</script>`);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(1)} KB)`);

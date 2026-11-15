// Inlines src/*.css and src/*.js into one self-contained dist/index.html.
// Run with: npm run build
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const path = (f) => new URL('./src/' + f, import.meta.url);
const src = (f) => readFileSync(path(f), 'utf8');
const have = (f) => existsSync(path(f));
let html = src('index.html');

// Core styles first, then each module's own stylesheet when it exists.
const styles = ['styles.css', 'lessons.css', 'exam.css', 'flash.css', 'sandbox.css', 'scenes.css', 'career.css', 'labfx.css', 'home.css', 'plan.css', 'audio.css'].filter(have);
const css = styles.map((f) => `/* ---- ${f} ---- */\n${src(f)}`).join('\n');
// Use a function replacer: a plain string replacement would treat "$'" and "$&" inside the code as special patterns.
html = html.replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, () => `<style>\n${css}\n</style>`);

// Order matters: the engine first, data before the UIs that read it, app.js last (it boots the router).
const scripts = [
  'engine.js', 'scenarios.js', 'guide.js', 'course.js', 'hardware.js', 'wlc.js',
  'scenes.js', 'scenes-1.js', 'scenes-2.js',
  'lessons-1.js', 'lessons-2.js', 'lessons-ui.js',
  'questions-1.js', 'questions-2.js', 'exam-ui.js',
  'flashcards.js', 'flash-ui.js',
  'sandbox.js', 'projects.js',
  'home.js', 'plan.js',
  'app.js', 'career.js', 'theme.js', 'audio.js',
].filter(have);
// Escape any "</script" inside the code so it cannot close the tag early.
const js = scripts.map((f) => `/* ---- ${f} ---- */\n${src(f)}`).join('\n').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<!-- build:js -->[\s\S]*?<!-- \/build:js -->/, () => `<script>\n${js}\n</script>`);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(1)} KB): ${scripts.length} scripts, ${styles.length} stylesheets`);

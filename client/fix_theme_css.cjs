const fs = require('fs');
const path = 'd:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css';
let css = fs.readFileSync(path, 'utf8');

// Find the start of the first .landing-page variable block
const startIdx = css.indexOf('.landing-page {');
// Find the end of the @media block right after the body/html styles
const mediaMarker = '@media (prefers-reduced-motion: no-preference)';
const mediaIdx = css.indexOf(mediaMarker);
// Find the closing } of that @media block
const mediaClose = css.indexOf('}', css.indexOf('}', mediaIdx + mediaMarker.length) ) + 1;

if (startIdx === -1 || mediaIdx === -1) {
  console.error('Could not find markers');
  process.exit(1);
}

const newBlock = `/* -- Landing page: DEFAULT = LIGHT theme -- */
.landing-page {
  --bg-primary: #F5F7FF;
  --bg-secondary: #EEF1FA;
  --bg-card: rgba(255, 255, 255, 0.75);
  --bg-card-hover: rgba(255, 255, 255, 0.95);
  --accent-cyan: #0099CC;
  --accent-violet: #6D28D9;
  --accent-cyan-glow: rgba(0, 153, 204, 0.12);
  --accent-violet-glow: rgba(109, 40, 217, 0.12);
  --foreground: #0D1529;
  --foreground-muted: #4B5A72;
  --foreground-subtle: #9CA3AF;
  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-glow: rgba(0, 153, 204, 0.3);
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

/* -- Dark theme override (triggered by data-theme="dark" on html element) -- */
[data-theme="dark"] .landing-page {
  --bg-primary: #0A0F1E;
  --bg-secondary: #0D1529;
  --bg-card: rgba(255, 255, 255, 0.04);
  --bg-card-hover: rgba(255, 255, 255, 0.07);
  --accent-cyan: #00D4FF;
  --accent-violet: #7C3AED;
  --accent-cyan-glow: rgba(0, 212, 255, 0.15);
  --accent-violet-glow: rgba(124, 58, 237, 0.15);
  --foreground: #F0F4FF;
  --foreground-muted: #8B95A8;
  --foreground-subtle: #4B5563;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-glow: rgba(0, 212, 255, 0.3);
}

[data-theme="dark"] .landing-page {
  background-color: var(--bg-primary);
  color: var(--foreground);
}

[data-theme="dark"] .landing-page ::-webkit-scrollbar-track { background: var(--bg-primary); }
[data-theme="dark"] .landing-page ::-webkit-scrollbar-thumb { background: rgba(0, 212, 255, 0.2); }
[data-theme="dark"] .landing-page ::-webkit-scrollbar-thumb:hover { background: rgba(0, 212, 255, 0.4); }

.landing-page-container {
  scroll-behavior: smooth;
  background-color: var(--bg-primary);
}

.landing-page {
  font-family: var(--font-body);
  background-color: var(--bg-primary);
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .landing-page-container { scroll-behavior: smooth; }
}`;

css = css.substring(0, startIdx) + newBlock + '\n' + css.substring(mediaClose).trimStart();

// Also fix button styles: replace old [data-theme="light"] button selectors with [data-theme="dark"] equivalents
// First fix .btn-primary base to use light colors
css = css.replace(
  /\.btn-primary \{\s*background: linear-gradient\(135deg, #00D4FF, #0099CC\);/,
  `.btn-primary {
  background: linear-gradient(135deg, #0099CC, #006699);`
);

// Fix btn-primary hover
css = css.replace(
  /\.btn-primary:hover \{\s*box-shadow: 0 0 30px rgba\(0, 212, 255, 0\.5\);/,
  `.btn-primary:hover {
  box-shadow: 0 0 30px rgba(0, 153, 204, 0.5);`
);

// Remove old [data-theme="light"] .btn-primary block and replace with dark override
css = css.replace(
  /\[data-theme="light"\] \.btn-primary \{[\s\S]*?\}/,
  `[data-theme="dark"] .btn-primary {
  background: linear-gradient(135deg, #00D4FF, #0099CC);
  color: #0A0F1E;
}

[data-theme="dark"] .btn-primary:hover {
  box-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
}`
);

// Fix btn-secondary base to light (dark border -> light border)
css = css.replace(
  /\.btn-secondary \{\s*background: transparent;\s*border: 1px solid rgba\(255, 255, 255, 0\.15\);/,
  `.btn-secondary {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.15);`
);

// Fix btn-secondary hover to light colors
css = css.replace(
  /\.btn-secondary:hover \{\s*border-color: rgba\(0, 212, 255, 0\.4\);\s*background: rgba\(0, 212, 255, 0\.05\);/,
  `.btn-secondary:hover {
  border-color: rgba(0, 153, 204, 0.4);
  background: rgba(0, 153, 204, 0.07);`
);

// Replace [data-theme="light"] .btn-secondary overrides with [data-theme="dark"]
css = css.replace(
  /\[data-theme="light"\] \.btn-secondary \{\s*border: 1px solid rgba\(0, 0, 0, 0\.15\);\s*\}/,
  `[data-theme="dark"] .btn-secondary {
  border: 1px solid rgba(255, 255, 255, 0.15);
}`
);

css = css.replace(
  /\[data-theme="light"\] \.btn-secondary:hover \{[\s\S]*?\}/,
  `[data-theme="dark"] .btn-secondary:hover {
  border-color: rgba(0, 212, 255, 0.4);
  background: rgba(0, 212, 255, 0.05);
}`
);

fs.writeFileSync(path, css, 'utf8');
console.log('CSS file rewritten successfully. Size:', css.length);

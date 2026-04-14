const fs = require('fs');
let css = fs.readFileSync('d:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css', 'utf8');

const regex = /\.shimmer-text\s*\{\s*background:\s*linear-gradient\(90deg,\s*#00D4FF\s*0%,\s*#ffffff\s*50%,\s*#7C3AED\s*100%\);\s*background-size:\s*200%\s*auto;\s*-webkit-background-clip:\s*text;\s*-webkit-text-fill-color:\s*transparent;\s*background-clip:\s*text;\s*animation:\s*shimmer\s*4s\s*linear\s*infinite;\s*\}/;

const replacement = `.shimmer-text {
  background: linear-gradient(90deg, #006699 0%, #0D1529 50%, #5B21B6 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 4s linear infinite;
}

[data-theme="dark"] .shimmer-text {
  background: linear-gradient(90deg, #00D4FF 0%, #ffffff 50%, #7C3AED 100%);
}`;

css = css.replace(regex, replacement);

fs.writeFileSync('d:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css', css, 'utf8');
console.log('Fixed shimmer-text');

const fs = require('fs');
let css = fs.readFileSync('d:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css', 'utf8');

// Use regex replace to handle \r\n vs \n
const cyanRegex = /\.gradient-text-cyan\s*\{\s*background:\s*linear-gradient\(135deg,\s*#00D4FF\s*0%,\s*#7C3AED\s*100%\);\s*-webkit-background-clip:\s*text;\s*-webkit-text-fill-color:\s*transparent;\s*background-clip:\s*text;\s*\}/;

const cyanReplacement = `.gradient-text-cyan {
  background: linear-gradient(135deg, #006699 0%, #5B21B6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

[data-theme="dark"] .gradient-text-cyan {
  background: linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%);
}`;

css = css.replace(cyanRegex, cyanReplacement);

const whiteRegex = /\.gradient-text-white\s*\{\s*background:\s*linear-gradient\(135deg,\s*#FFFFFF\s*0%,\s*#A5B4C8\s*100%\);\s*-webkit-background-clip:\s*text;\s*-webkit-text-fill-color:\s*transparent;\s*background-clip:\s*text;\s*\}/;

const whiteReplacement = `.gradient-text-white {
  background: linear-gradient(135deg, #0D1529 0%, #4B5A72 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

[data-theme="dark"] .gradient-text-white {
  background: linear-gradient(135deg, #FFFFFF 0%, #A5B4C8 100%);
}`;

css = css.replace(whiteRegex, whiteReplacement);

fs.writeFileSync('d:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css', css, 'utf8');
console.log('Fixed text gradients');

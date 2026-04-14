const fs = require('fs');
let css = fs.readFileSync('d:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css', 'utf8');

// Replace background: linear-gradient with background-image: linear-gradient for gradient texts rules
const selectors = [
  '.gradient-text-cyan {',
  '[data-theme="dark"] .gradient-text-cyan {',
  '.gradient-text-white {',
  '[data-theme="dark"] .gradient-text-white {',
  '.shimmer-text {',
  '[data-theme="dark"] .shimmer-text {'
];

for (const selector of selectors) {
  // Find the index of the selector
  let index = css.indexOf(selector);
  while (index !== -1) {
    // Find the end of the block
    const end = css.indexOf('}', index);
    if (end !== -1) {
      let block = css.substring(index, end);
      block = block.replace(/background:\s*linear-gradient/g, 'background-image: linear-gradient');
      css = css.substring(0, index) + block + css.substring(end);
    }
    index = css.indexOf(selector, index + 1);
  }
}

// Ensure shimmer-text background-size is completely preserved by just making sure it's present in the dark override or not reset
// Wait, background-image doesn't reset background-size. So using background-image instead of background is sufficient.

fs.writeFileSync('d:/college/Projects/Fund-Flow-AI/client/src/landing_legacy/styles/tailwind.css', css, 'utf8');
console.log('Fixed background shorthand for gradients');

const fs = require('fs');
const txt = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf8');
const lines = txt.split('\n');

// Find the main return statement
let returnLine = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'return (' && i > 100) { // Skip early returns
        returnLine = i;
        break;
    }
}
console.log('Return at line:', returnLine + 1);

// Track balance until line 2787
const stack = [];
for (let i = returnLine; i < 2787; i++) {
    const line = lines[i];
    const selfClosing = (line.match(/<div[^>]*\/>/g) || []).length;
    const dOpen = (line.match(/<div[\s>]/g) || []).length - selfClosing;
    const dClose = (line.match(/<\/div>/g) || []).length;
    const mOpen = (line.match(/<motion\.div[\s>]/g) || []).length;
    const mClose = (line.match(/<\/motion\.div>/g) || []).length;
    
    for (let j = 0; j < dOpen; j++) stack.push({ line: i + 1, type: 'div' });
    for (let j = 0; j < mOpen; j++) stack.push({ line: i + 1, type: 'motion.div' });
    for (let j = 0; j < dClose + mClose; j++) stack.pop();
}

console.log(`At line 2787, stack has ${stack.length} items:`);
stack.forEach((item, idx) => {
    const content = lines[item.line - 1].trim().substring(0, 90);
    console.log(`  ${idx}: L${item.line} [${item.type}] ${content}`);
});

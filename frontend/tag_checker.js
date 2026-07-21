const fs = require('fs');
const txt = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf8');

let pos = 0;
let stack = [];

// Skip to main return at 686
const lines = txt.split('\n');
let startPos = 0;
for (let i = 0; i < 686; i++) {
    startPos += lines[i].length + 1;
}

pos = startPos;

while (pos < txt.indexOf('function DocumentsTab')) {
    if (txt.substring(pos).startsWith('/*')) {
        pos = txt.indexOf('*/', pos) + 2;
    } else if (txt.substring(pos).startsWith('{/*')) {
        pos = txt.indexOf('*/}', pos) + 3;
    } else if (txt[pos] === '<') {
        const match = txt.substring(pos).match(/^<(\/?)([a-zA-Z0-9\.]+)([^>]*)>/);
        if (match) {
            const isClosing = match[1] === '/';
            const tagName = match[2];
            const attrs = match[3];
            const isSelfClosing = attrs.trim().endsWith('/');
            
            // Calc line number
            const lineNo = txt.substring(0, pos).split('\n').length;
            
            if (!isSelfClosing) {
                if (!isClosing) {
                    stack.push({name: tagName, line: lineNo});
                } else {
                    if (stack.length > 0 && stack[stack.length - 1].name === tagName) {
                        stack.pop();
                    } else {
                        console.log(`Mismatch closing </${tagName}> at line ${lineNo}, expected </${stack.length > 0 ? stack[stack.length - 1].name : 'none'}>`);
                    }
                }
            }
            pos += match[0].length;
        } else {
            pos++;
        }
    } else {
        pos++;
    }
}

console.log('Open tags remaining:', stack);

const fs = require('fs');
const txt = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf8');
const lines = txt.split('\n');

const stack = [];

for (let i = 686; i < 2789; i++) {
    const line = lines[i];
    
    // Simplistic tag matching
    let j = 0;
    while (j < line.length) {
        if (line.slice(j).startsWith('<div>') || line.slice(j).startsWith('<div ') || line.slice(j).startsWith('<motion.div>') || line.slice(j).startsWith('<motion.div ')) {
            // Check if it's not self-closing
            let endIdx = line.indexOf('>', j);
            if (endIdx !== -1 && line[endIdx-1] !== '/') {
                stack.push({type: 'div', line: i + 1});
            }
            j = endIdx !== -1 ? endIdx + 1 : j + 1;
        } else if (line.slice(j).startsWith('</div>') || line.slice(j).startsWith('</motion.div>')) {
            if (stack.length > 0 && stack[stack.length-1].type === 'div') {
                stack.pop();
            } else {
                console.log(`Unmatched closing div at line ${i+1}`);
            }
            j += 6;
        } else if (line.slice(j).startsWith('{') && !line.slice(j).startsWith('{{')) {
            stack.push({type: '{', line: i + 1});
            j++;
        } else if (line.slice(j).startsWith('}') && !line.slice(j).startsWith('}}')) {
            if (stack.length > 0 && stack[stack.length-1].type === '{') {
                stack.pop();
            }
            j++;
        } else if (line.slice(j).startsWith('(')) {
            stack.push({type: '(', line: i + 1});
            j++;
        } else if (line.slice(j).startsWith(')')) {
            if (stack.length > 0 && stack[stack.length-1].type === '(') {
                stack.pop();
            }
            j++;
        } else {
            j++;
        }
    }
}

console.log('Stack remainder:', stack.slice(-10));

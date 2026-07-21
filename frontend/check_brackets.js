const fs = require('fs');
const txt = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf8');

// remove all comments, string literals, and regex literals to avoid false positives
let cleaned = txt
    .replace(/\/\*[\s\S]*?\*\//g, '') // multiline comments
    .replace(/\/\/.*$/gm, '') // single line comments
    .replace(/"(?:\\.|[^"\\])*"/g, '""') // double quotes
    .replace(/'(?:\\.|[^'\\])*'/g, "''") // single quotes
    .replace(/`(?:\\.|[^`\\])*`/g, "``"); // backticks

let lines = cleaned.split('\n');

const stack = [];
for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '(') stack.push({char, line: i + 1});
        if (char === '{') stack.push({char, line: i + 1});
        if (char === '[') stack.push({char, line: i + 1});
        
        if (char === ')') {
            if (stack.length === 0 || stack[stack.length - 1].char !== '(') {
                console.log(`Mismatch ')' at line ${i + 1}`);
            } else {
                stack.pop();
            }
        }
        if (char === '}') {
            if (stack.length === 0 || stack[stack.length - 1].char !== '{') {
                console.log(`Mismatch '}' at line ${i + 1}`);
            } else {
                stack.pop();
            }
        }
        if (char === ']') {
            if (stack.length === 0 || stack[stack.length - 1].char !== '[') {
                console.log(`Mismatch ']' at line ${i + 1}`);
            } else {
                stack.pop();
            }
        }
    }
}

console.log('Unclosed brackets:', stack.slice(-10));

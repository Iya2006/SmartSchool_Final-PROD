const fs = require('fs');
const txt = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf8');

let clean = '';
let inStr = false;
let strChar = '';
let inCommentLine = false;
let inCommentBlock = false;
let inJsxComment = false;
let posMap = [];

for (let i = 0; i < txt.length; i++) {
    if (inCommentLine) {
        if (txt[i] === '\n') {
            inCommentLine = false;
            clean += '\n'; posMap.push(i);
        }
    } else if (inCommentBlock) {
        if (txt[i] === '*' && txt[i+1] === '/') {
            inCommentBlock = false;
            i++;
        } else if (txt[i] === '\n') {
            clean += '\n'; posMap.push(i);
        }
    } else if (inJsxComment) {
        if (txt[i] === '*' && txt[i+1] === '/' && txt[i+2] === '}') {
            inJsxComment = false;
            i += 2;
        } else if (txt[i] === '\n') {
            clean += '\n'; posMap.push(i);
        }
    } else if (inStr) {
        if (txt[i] === '\\') {
            i++;
        } else if (txt[i] === strChar) {
            inStr = false;
        } else if (txt[i] === '\n') {
            clean += '\n'; posMap.push(i);
        }
    } else {
        if (txt[i] === '/' && txt[i+1] === '/') {
            inCommentLine = true;
            i++;
        } else if (txt[i] === '/' && txt[i+1] === '*') {
            inCommentBlock = true;
            i++;
        } else if (txt[i] === '{' && txt[i+1] === '/' && txt[i+2] === '*') {
            inJsxComment = true;
            i += 2;
        } else if (txt[i] === "'" || txt[i] === '"' || txt[i] === '`') {
            inStr = true;
            strChar = txt[i];
        } else {
            clean += txt[i];
            posMap.push(i);
        }
    }
}

let stack = [];
for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '{' || char === '(' || char === '[') {
        const line = txt.substring(0, posMap[i]).split('\n').length;
        stack.push({char, line});
    } else if (char === '}' || char === ')' || char === ']') {
        const last = stack[stack.length - 1];
        if ((char === '}' && last.char === '{') ||
            (char === ')' && last.char === '(') ||
            (char === ']' && last.char === '[')) {
            stack.pop();
        } else {
            const line = txt.substring(0, posMap[i]).split('\n').length;
            console.log(`Mismatch at line ${line}! Found ${char}, expected ${last.char} (opened at line ${last.line})`);
            break;
        }
    }
}

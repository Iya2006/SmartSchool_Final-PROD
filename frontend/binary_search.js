const fs = require('fs');
const { execSync } = require('child_process');
const parser = require('@babel/parser');

const txt = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf8');
const lines = txt.split('\n');

function check(lineNo) {
    let newTxt = lines.slice(0, lineNo).join('\n');
    // Find all unclosed tags up to lineNo
    // Actually, Babel won't throw if tags are unclosed, it throws if parentheses are unclosed?
    // Wait, Babel throws if tags are unclosed!
    // So if I truncate, I MUST close the tags.
    // Let's use `tsc` instead, because `tsc` tells us if it's a tag issue or a parenthesis issue!
}

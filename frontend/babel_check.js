const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf-8');

try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log('Parsed successfully!');
} catch (error) {
  console.log('Parse error:', error.message);
}

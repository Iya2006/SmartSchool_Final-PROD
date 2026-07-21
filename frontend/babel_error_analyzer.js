const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('src/app/portail-enseignant/page.tsx', 'utf-8');

try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
} catch (error) {
  console.log('Error:', error.message);
  // error.loc contains line/column of the error.
  // We can try parsing a substring of the code to see where it first breaks!
  
  // Or better, let's just use regex to find all opening and closing tags.
}

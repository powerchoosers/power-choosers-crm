const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/pages/api/accounts/[accountId]/intelligence-brief.ts');
const lines = fs.readFileSync(file, 'utf8').split('\n');

let start = -1;
let end = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function buildStructuredIdentityProfile(')) {
    start = i;
  }
  if (start !== -1 && lines[i].startsWith('}')) {
    // If next function starts, this is the end
    const nextLine = lines[i+1] || '';
    if (nextLine.startsWith('function ') || nextLine.startsWith('export ') || i === lines.length - 1) {
      end = i;
      break;
    }
  }
}

console.log(`Start line: ${start + 1}, End line: ${end + 1}`);
if (start !== -1 && end !== -1) {
  // Write the function body to a separate file so we can view it
  const body = lines.slice(start, end + 1).map((l, idx) => `${start + 1 + idx}: ${l}`).join('\n');
  fs.writeFileSync(path.join(__dirname, 'bounds-output.txt'), body);
  console.log('Saved function body to bounds-output.txt');
} else {
  console.log('Could not find function boundaries');
}

const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/Lap3p/OneDrive/Documents/Power Choosers CRM/crm-platform/src/pages/api/accounts/[accountId]/intelligence-brief.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const query = 'function extractstructuredbrieffacts';
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes(query)) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

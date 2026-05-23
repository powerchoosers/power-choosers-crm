const fs = require('fs');

try {
  const env = fs.readFileSync('.env.local', 'utf8');
  env.split('\n').forEach(l => {
    const parts = l.split('=');
    if (parts[0]) {
      const name = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/['\"]/g, '');
      if (val) {
        console.log(`${name}: ${val.slice(0, 4)}...${val.slice(-4)} (len: ${val.length})`);
      }
    }
  });
} catch (e) {
  console.error(e.message);
}

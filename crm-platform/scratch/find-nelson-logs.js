const fs = require('fs');

const logPath = 'C:/Users/Lap3p/.gemini/antigravity/brain/fa8be5d0-148d-42da-a5bd-5eea39542225/.system_generated/tasks/task-5404.log';
if (!fs.existsSync(logPath)) {
  console.error('Log file does not exist');
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
let isSection = false;
let logs = [];

lines.forEach((line) => {
  if (line.includes('891b3ee1-d9a4-4d53-a2c9-e38cc46cd154')) {
    isSection = true;
  }
  
  if (isSection) {
    logs.push(line);
  }
  
  if (line.includes('POST /api/accounts/891b3ee1-d9a4-4d53-a2c9-e38cc46cd154/intelligence-brief')) {
    isSection = false;
    console.log('\n=================== NELSON LOGGER SECTION ===================');
    logs.forEach(l => console.log(l));
    logs = [];
  }
});

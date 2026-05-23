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
  if (line.includes('bf157428-4221-487e-8ff3-b59070e94a2e')) {
    isSection = true;
  }
  
  if (isSection) {
    logs.push(line);
  }
  
  if (line.includes('POST /api/accounts/bf157428-4221-487e-8ff3-b59070e94a2e/intelligence-brief')) {
    isSection = false;
    console.log('\n=================== AOG LOGGER SECTION ===================');
    logs.forEach(l => console.log(l));
    logs = [];
  }
});

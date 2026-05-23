const fs = require('fs');

const logPath = 'C:/Users/Lap3p/.gemini/antigravity/brain/fa8be5d0-148d-42da-a5bd-5eea39542225/.system_generated/tasks/task-5404.log';
if (!fs.existsSync(logPath)) {
  console.error('Log file does not exist');
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
let isRidgwaySection = false;
let ridgwayLogs = [];

lines.forEach((line) => {
  if (line.includes('1070047f-f308-4381-b1e1-d296db5ff6a7')) {
    isRidgwaySection = true;
  }
  
  if (isRidgwaySection) {
    ridgwayLogs.push(line);
  }
  
  if (line.includes('POST /api/accounts/1070047f-f308-4381-b1e1-d296db5ff6a7/intelligence-brief')) {
    isRidgwaySection = false;
    // Log the collected lines
    console.log('\n=================== RIDGWAY LOGGER SECTION ===================');
    ridgwayLogs.forEach(l => console.log(l));
    ridgwayLogs = [];
  }
});

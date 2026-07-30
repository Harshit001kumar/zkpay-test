const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/HARSHIT KUMAR/.gemini/antigravity-ide/brain/4ce09702-2b4a-4975-b759-fc1a7fce8cb5/.system_generated/steps/54/output.txt', 'utf8'));
const ds = data.designSystems.find(d => d.designSystem.displayName === 'Obsidian Glass');
fs.writeFileSync('d:/zk_pay/.agents/skills/zkpay-project-context/design-system.md', ds.designSystem.designMd);

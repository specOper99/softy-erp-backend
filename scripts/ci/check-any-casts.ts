import * as fs from 'node:fs';
import * as path from 'node:path';

const THRESHOLD = 0; // Initial baseline. reduced as we fix them.

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function (file) {
    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'coverage' && file !== '.git') {
        arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles);
      }
    } else if (file.endsWith('.ts')) {
      arrayOfFiles.push(path.join(dirPath, '/', file));
    }
  });

  return arrayOfFiles;
}

function checkAnyCasts() {
  const files = getAllFiles(process.cwd());

  let count = 0;
  const offenders: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('as ' + 'any')) {
        count++;
        offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  console.log(`Found ${count} 'as ' + 'any' casts.`);

  if (count > THRESHOLD) {
    console.error(`ERROR: 'as ' + 'any' count (${count}) exceeds threshold (${THRESHOLD}).`);
    fs.writeFileSync('any-casts-report.txt', offenders.join('\n'));
    process.exit(1);
  } else if (count < THRESHOLD) {
    console.log(
      `GOOD NEWS: 'as ' + 'any' count (${count}) is below threshold (${THRESHOLD}). Please update the threshold in scripts/ci/check-any-casts.ts.`,
    );
  } else {
    console.log(`'as ' + 'any' count is at threshold (${THRESHOLD}).`);
  }
}

checkAnyCasts();

import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

interface CanonicalEvent {
  name: string;
  publishers: string[];
  consumers: string[];
}

interface EventContract {
  canonicalEvents: CanonicalEvent[];
  notPublishedEvents: string[];
}

interface Mismatch {
  eventName: string;
  kind:
    | 'missing-publisher-file'
    | 'missing-publish-site'
    | 'missing-consumer-file'
    | 'missing-handler'
    | 'unexpected-publisher';
  expected?: string;
  details?: string;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSectionLines(content: string, sectionHeading: string): string[] {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === sectionHeading);
  if (startIndex === -1) {
    return [];
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (lines[i]?.startsWith('## ')) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex);
}

function extractBacktickedValues(line: string): string[] {
  const values: string[] = [];
  const matches = line.matchAll(/`([^`]+)`/g);
  for (const match of matches) {
    const value = match[1];
    if (value) {
      values.push(value.trim());
    }
  }
  return values;
}

function parseCanonicalEvents(lines: string[]): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  let current: CanonicalEvent | null = null;
  let mode: 'publishers' | 'consumers' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const eventNameMatch = trimmed.match(/^`([A-Za-z0-9_]+Event)`$/);
    if (eventNameMatch?.[1]) {
      if (current) {
        events.push(current);
      }
      current = { name: eventNameMatch[1], publishers: [], consumers: [] };
      mode = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.startsWith('- Published by:')) {
      mode = 'publishers';
      continue;
    }

    if (trimmed.startsWith('- Consumed by:')) {
      mode = 'consumers';
      continue;
    }

    if (!trimmed.startsWith('- ')) {
      continue;
    }

    if (mode === null) {
      continue;
    }

    const backtickedValues = extractBacktickedValues(trimmed);
    for (const value of backtickedValues) {
      if (!/^src\/.*\.ts$/.test(value)) {
        continue;
      }
      if (mode === 'publishers') {
        current.publishers.push(value);
      } else {
        current.consumers.push(value);
      }
    }
  }

  if (current) {
    events.push(current);
  }

  return events;
}

function parseNotPublishedEvents(lines: string[]): string[] {
  const eventNames = new Set<string>();

  for (const line of lines) {
    const values = extractBacktickedValues(line);
    for (const value of values) {
      if (/^[A-Za-z0-9_]+Event$/.test(value) && !value.includes('/')) {
        eventNames.add(value);
      }
    }
  }

  return Array.from(eventNames).sort((a, b) => a.localeCompare(b));
}

function parseEventContract(docContent: string): EventContract {
  const canonicalLines = getSectionLines(docContent, '## Canonical Domain Events (Present + Published)');
  const notPublishedLines = getSectionLines(
    docContent,
    '## Events Present But Not Published (No In-Repo Producer Found)',
  );

  const canonicalEvents = parseCanonicalEvents(canonicalLines);
  const notPublishedEvents = parseNotPublishedEvents(notPublishedLines);

  return { canonicalEvents, notPublishedEvents };
}

function getAllTsFiles(dirPath: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) {
        getAllTsFiles(fullPath, files);
      }
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function hasPublishSite(content: string, eventName: string): boolean {
  const directPattern = new RegExp(`publish\\(\\s*new\\s+${escapeRegex(eventName)}\\b`, 'm');
  if (directPattern.test(content)) {
    return true;
  }

  const assignmentPattern = new RegExp(`([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*new\\s+${escapeRegex(eventName)}\\b`, 'g');
  const variableNames = new Set<string>();
  for (const match of content.matchAll(assignmentPattern)) {
    if (match[1]) {
      variableNames.add(match[1]);
    }
  }

  for (const variableName of variableNames) {
    const publishVariablePattern = new RegExp(`publish\\(\\s*${escapeRegex(variableName)}\\s*\\)`, 'm');
    if (publishVariablePattern.test(content)) {
      return true;
    }
  }

  return false;
}

function hasHandlerSite(content: string, eventName: string): boolean {
  const pattern = new RegExp(`EventsHandler\\(\\s*[^)]*\\b${escapeRegex(eventName)}\\b[^)]*\\)`, 'm');
  return pattern.test(content);
}

function checkCanonicalEvents(contract: EventContract): {
  mismatches: Mismatch[];
  publishersChecked: number;
  consumersChecked: number;
} {
  const mismatches: Mismatch[] = [];
  let publishersChecked = 0;
  let consumersChecked = 0;

  for (const event of contract.canonicalEvents) {
    for (const publisherPath of event.publishers) {
      publishersChecked += 1;
      const absolutePath = path.join(process.cwd(), publisherPath);

      if (!fs.existsSync(absolutePath)) {
        mismatches.push({
          eventName: event.name,
          kind: 'missing-publisher-file',
          expected: publisherPath,
          details: 'Publisher file from docs does not exist',
        });
        continue;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      if (!hasPublishSite(content, event.name)) {
        mismatches.push({
          eventName: event.name,
          kind: 'missing-publish-site',
          expected: publisherPath,
          details: 'Expected publish(new EventName) pattern not found',
        });
      }
    }

    for (const consumerPath of event.consumers) {
      consumersChecked += 1;
      const absolutePath = path.join(process.cwd(), consumerPath);

      if (!fs.existsSync(absolutePath)) {
        mismatches.push({
          eventName: event.name,
          kind: 'missing-consumer-file',
          expected: consumerPath,
          details: 'Consumer file from docs does not exist',
        });
        continue;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      if (!hasHandlerSite(content, event.name)) {
        mismatches.push({
          eventName: event.name,
          kind: 'missing-handler',
          expected: consumerPath,
          details: 'Expected @EventsHandler(EventName) pattern not found',
        });
      }
    }
  }

  return { mismatches, publishersChecked, consumersChecked };
}

function checkNotPublishedEvents(contract: EventContract, srcFiles: string[]): Mismatch[] {
  const mismatches: Mismatch[] = [];
  const fileContents = srcFiles.map((file) => ({
    relativePath: toPosixPath(path.relative(process.cwd(), file)),
    content: fs.readFileSync(file, 'utf-8'),
  }));

  for (const eventName of contract.notPublishedEvents) {
    for (const file of fileContents) {
      if (hasPublishSite(file.content, eventName)) {
        mismatches.push({
          eventName,
          kind: 'unexpected-publisher',
          expected: file.relativePath,
          details: 'Event is documented as not published but publish(new EventName) exists',
        });
      }
    }
  }

  return mismatches;
}

function printMismatches(mismatches: Mismatch[]): void {
  for (const mismatch of mismatches) {
    const target = mismatch.expected ? ` (${mismatch.expected})` : '';
    const details = mismatch.details ?? '';
    console.error(`- ${mismatch.eventName} :: ${mismatch.kind}${target}`);
    if (details) {
      console.error(`  ${details}`);
    }
  }
}

function main(): void {
  const docPath = path.join(process.cwd(), 'docs', 'EVENT_CONTRACT.md');
  const srcPath = path.join(process.cwd(), 'src');

  if (!fs.existsSync(docPath)) {
    console.error('ERROR: docs/EVENT_CONTRACT.md not found. Run from project root.');
    process.exit(1);
  }

  if (!fs.existsSync(srcPath)) {
    console.error('ERROR: src directory not found. Run from project root.');
    process.exit(1);
  }

  const docContent = fs.readFileSync(docPath, 'utf-8');
  const contract = parseEventContract(docContent);

  if (contract.canonicalEvents.length === 0) {
    console.error('ERROR: No canonical events parsed from docs/EVENT_CONTRACT.md');
    process.exit(1);
  }

  const srcFiles = getAllTsFiles(srcPath);
  const canonicalCheck = checkCanonicalEvents(contract);
  const notPublishedMismatches = checkNotPublishedEvents(contract, srcFiles);
  const mismatches = [...canonicalCheck.mismatches, ...notPublishedMismatches];

  if (mismatches.length > 0) {
    console.error(`❌ Event contract drift detected (${mismatches.length} mismatch(es)):`);
    printMismatches(mismatches);
    process.exit(1);
  }

  console.log('✅ Event contract checks passed');
  console.log(`   Canonical events checked: ${contract.canonicalEvents.length}`);
  console.log(`   Publisher references checked: ${canonicalCheck.publishersChecked}`);
  console.log(`   Consumer references checked: ${canonicalCheck.consumersChecked}`);
  console.log(`   Not-published events checked: ${contract.notPublishedEvents.length}`);
}

main();

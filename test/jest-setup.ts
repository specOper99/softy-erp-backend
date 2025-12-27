// Set test environment to disable rate limiting if not already set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Load environment variables from .env file
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Find project root by looking for package.json
let currentDir = __dirname;
while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        break;
    }
    currentDir = path.dirname(currentDir);
}

const envPath = path.join(currentDir, '.env');

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    console.warn(`⚠️  Warning: .env file not found at ${envPath}`);
}

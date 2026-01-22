#!/usr/bin/env ts-node

/**
 * Script to create the initial platform superadmin user
 * Usage: npm run platform:create-admin
 */

import { NestFactory } from '@nestjs/core';
import * as readline from 'readline';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { PlatformUser } from '../../src/modules/platform/entities/platform-user.entity';
import { PlatformRole } from '../../src/modules/platform/enums/platform-role.enum';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function bootstrap() {
  console.log('🚀 Platform Superadmin Creation Script\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    // Get user input
    const email = await question('Email address: ');
    const fullName = await question('Full name: ');
    const password = await question('Password: ');

    if (!email || !fullName || !password) {
      console.error('❌ All fields are required');
      process.exit(1);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Invalid email format');
      process.exit(1);
    }

    // Validate password strength
    if (password.length < 12) {
      console.error('❌ Password must be at least 12 characters');
      process.exit(1);
    }

    // Check if user already exists
    const existing = await dataSource.getRepository(PlatformUser).findOne({
      where: { email },
    });

    if (existing) {
      console.error('❌ User with this email already exists');
      process.exit(1);
    }

    // Hash password using Argon2id (via PasswordHashService if available)
    // For now, we'll use a placeholder - in production, import the actual service
    console.log('\n⏳ Hashing password with Argon2id...');

    // TODO: Import and use actual PasswordHashService
    // For now, provide instructions
    console.log('\n⚠️  Manual Step Required:');
    console.log('Hash your password using Argon2id and insert the user manually:');
    console.log('\nSQL:');
    console.log(`
INSERT INTO platform_users (
  id,
  email,
  full_name,
  password_hash,
  role,
  status,
  mfa_enabled,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '${email}',
  '${fullName}',
  '<YOUR_ARGON2ID_HASH_HERE>',
  '${PlatformRole.SUPER_ADMIN}',
  'active',
  false,
  NOW(),
  NOW()
);
    `);

    console.log('\n💡 To generate Argon2id hash, use:');
    console.log('```typescript');
    console.log("import argon2 from 'argon2';");
    console.log(`const hash = await argon2.hash('${password}', {`);
    console.log('  type: argon2.argon2id,');
    console.log('  memoryCost: 65536, // 64MB');
    console.log('  timeCost: 3,');
    console.log('  parallelism: 4,');
    console.log('});');
    console.log('console.log(hash);');
    console.log('```');

    console.log('\n✅ Instructions provided. Please complete the manual steps above.');
    console.log('\n⚠️  IMPORTANT: Enable MFA immediately after first login!');
    console.log("   Update the user: UPDATE platform_users SET mfa_enabled = true WHERE email = '" + email + "';");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', message);
    process.exit(1);
  } finally {
    rl.close();
    await app.close();
  }
}

void bootstrap();

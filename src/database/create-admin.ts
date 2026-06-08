#!/usr/bin/env ts-node

/**
 * Fully automated script to create platform superadmin user
 * Usage: npm run platform:create-admin-auto
 */

import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as readline from 'readline';
import type { Repository } from 'typeorm';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { AppModule } from '../app.module';
import { PasswordHashService } from '../common/services/password-hash.service';
import { toErrorMessage } from '../common/utils/error.util';
import { PlatformUser } from '../modules/platform/entities/platform-user.entity';
import { PlatformRole } from '../modules/platform/enums/platform-role.enum';

// typeorm-transactional patches the DataSource's `manager` getter via CLS storage.
// When the script boots AppModule directly (bypassing main.ts) the CLS context is
// never installed, so the wrapped DataSource throws "No storage driver defined".
// Install it before any DataSource is instantiated.
initializeTransactionalContext();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function bootstrap() {
  console.info('\n🚀 Platform Superadmin Creation Script\n');
  console.info('===================================\n');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const userRepository = app.get<Repository<PlatformUser>>(getRepositoryToken(PlatformUser));
    const passwordHashService = app.get<PasswordHashService>(PasswordHashService);

    // Get user input
    const email = await question('Email address: ');
    const fullName = await question('Full name: ');
    const password = await question('Password (min 12 chars): ');
    const confirmPassword = await question('Confirm password: ');

    // Validate inputs
    if (!email || !fullName || !password) {
      throw new Error('All fields are required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    if (password.length < 12) {
      throw new Error('Password must be at least 12 characters');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    // Check if user exists
    const existing = await userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    console.info('\n⏳ Hashing password with Argon2id...');
    const passwordHash = await passwordHashService.hash(password);

    // Create user
    const admin = userRepository.create({
      email: email.toLowerCase(),
      fullName,
      passwordHash,
      role: PlatformRole.SUPER_ADMIN,
      status: 'active',
      mfaEnabled: false,
    });

    await userRepository.save(admin);

    console.info('\n✅ Platform Superadmin created successfully!\n');
    console.info('User Details:');
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.info(`  ID:        ${admin.id}`);
    console.info(`  Email:     ${admin.email}`);
    console.info(`  Full Name: ${admin.fullName}`);
    console.info(`  Role:      ${admin.role}`);
    console.info(`  Status:    ${admin.status}`);
    console.info(`  MFA:       ${admin.mfaEnabled ? 'Enabled' : 'Disabled'}`);
    console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.info('📝 Next Steps:');
    console.info('  1. Login at: POST /platform/auth/login');
    console.info('  2. Enable MFA for enhanced security');
    console.info('  3. Configure IP allowlist if needed\n');
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    console.error('\n❌ Error:', message, '\n');
    process.exit(1);
  } finally {
    rl.close();
    await app.close();
  }
}

void bootstrap();

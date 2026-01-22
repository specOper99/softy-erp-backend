#!/usr/bin/env ts-node

/**
 * Fully automated script to create platform superadmin user
 * Usage: npm run platform:create-admin-auto
 */

import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as readline from 'readline';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { PasswordHashService } from '../../src/common/services/password-hash.service';
import { PlatformUser } from '../../src/modules/platform/entities/platform-user.entity';
import { PlatformRole } from '../../src/modules/platform/enums/platform-role.enum';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function bootstrap() {
  console.log('\n🚀 Platform Superadmin Creation Script\n');
  console.log('===================================\n');

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
    console.log('\n⏳ Hashing password with Argon2id...');
    const passwordHash = await passwordHashService.hash(password);

    // Create user
    const admin = userRepository.create({
      email: email.toLowerCase(),
      fullName,
      passwordHash,
      role: PlatformRole.SUPER_ADMIN,
      status: 'active',
      mfaEnabled: false,
      failedLoginAttempts: 0,
      ipAllowlist: [],
      passwordChangedAt: new Date(),
    });

    await userRepository.save(admin);

    console.log('\n✅ Platform Superadmin created successfully!\n');
    console.log('User Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ID:        ${admin.id}`);
    console.log(`  Email:     ${admin.email}`);
    console.log(`  Full Name: ${admin.fullName}`);
    console.log(`  Role:      ${admin.role}`);
    console.log(`  Status:    ${admin.status}`);
    console.log(`  MFA:       ${admin.mfaEnabled ? 'Enabled' : 'Disabled'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📝 Next Steps:');
    console.log('  1. Login at: POST /platform/auth/login');
    console.log('  2. Enable MFA for enhanced security');
    console.log('  3. Configure IP allowlist if needed\n');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error:', message, '\n');
    process.exit(1);
  } finally {
    rl.close();
    await app.close();
  }
}

void bootstrap();

#!/usr/bin/env ts-node

/**
 * Checks for "stale" feature flags via Unleash Admin API.
 * Usage: ts-node check-stale-flags.ts
 * Requires: UNLEASH_URL, UNLEASH_API_TOKEN env vars.
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const UNLEASH_URL = process.env.UNLEASH_URL || 'http://localhost:4242/api';
const UNLEASH_API_TOKEN = process.env.UNLEASH_API_TOKEN;

interface FeatureToggle {
  name: string;
  stale: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

interface FeaturesResponse {
  features: FeatureToggle[];
}

async function checkStaleFlags() {
  if (!UNLEASH_API_TOKEN) {
    console.error('UNLEASH_API_TOKEN is not set.');
    process.exit(1);
  }

  try {
    const response = await axios.get<FeaturesResponse>(`${UNLEASH_URL}/admin/features`, {
      headers: { Authorization: UNLEASH_API_TOKEN },
    });

    const features = response.data.features;
    const staleFlags = features.filter((f) => f.stale);

    // Also check for "potentially stale" flags: created > 30 days ago and not stale
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const potentiallyStale = features.filter((f) => {
      return !f.stale && new Date(f.createdAt) < thirtyDaysAgo;
    });

    console.log(`\n🔍 Found ${features.length} total feature flags.`);

    if (staleFlags.length > 0) {
      console.warn(`\n⚠️  WARNING: Found ${staleFlags.length} STALE flags that should be cleaned up:`);
      staleFlags.forEach((f) => console.log(` - ${f.name} (Created: ${f.createdAt})`));
    }

    if (potentiallyStale.length > 0) {
      console.warn(`\nℹ️  INFO: Found ${potentiallyStale.length} older flags (>30 days) that might be stale:`);
      potentiallyStale.forEach((f) => console.log(` - ${f.name} (Created: ${f.createdAt})`));
    }

    if (staleFlags.length > 0) {
      // We can choose to fail the build here if we want to enforce cleanup strictly
      // process.exit(1);
      console.log('\nPlease cleanup these flags in Unleash and remove code references.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch features from Unleash:', message);
    process.exit(1);
  }
}

await checkStaleFlags();

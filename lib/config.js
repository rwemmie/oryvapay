import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

// Render "Secret Files" live in /etc/secrets/<NAME> (or the app root). Read them when the env var is missing.
function secret(name) {
  if (env[name]) return env[name].trim();
  for (const dir of ['/etc/secrets', process.cwd()]) {
    try {
      const v = fs.readFileSync(path.join(dir, name), 'utf8').trim();
      if (v) return v;
    } catch {}
  }
  return '';
}

export const config = {
  port: Number(env.PORT || 3000),
  paypal: {
    clientId: secret('PAYPAL_CLIENT_ID'),
    clientSecret: secret('PAYPAL_CLIENT_SECRET'),
    env: (env.PAYPAL_ENV || 'sandbox').toLowerCase(),
  },
  ai: {
    baseUrl: (env.AI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, ''),
    apiKey: secret('AI_API_KEY'),
    model: env.AI_MODEL || (/crynux/i.test(env.AI_BASE_URL || '') ? 'Qwen/Qwen2.5-7B-Instruct' : 'grok-4'),
  },
  dataDir: env.DATA_DIR || 'data',
};

config.paypal.apiBase = config.paypal.env === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// PayPal runs for real whenever both keys exist. Otherwise it is simulated (DEMO_MODE).
config.paypalLive = Boolean(config.paypal.clientId && config.paypal.clientSecret) && env.DEMO_MODE !== 'true';
config.aiLive = Boolean(config.ai.apiKey) && env.DEMO_MODE !== 'true';
config.demoMode = !config.paypalLive || !config.aiLive;

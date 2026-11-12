import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID || '',
    clientSecret: env.PAYPAL_CLIENT_SECRET || '',
    env: (env.PAYPAL_ENV || 'sandbox').toLowerCase(),
  },
  ai: {
    baseUrl: (env.AI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, ''),
    apiKey: env.AI_API_KEY || '',
    model: env.AI_MODEL || 'grok-4',
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

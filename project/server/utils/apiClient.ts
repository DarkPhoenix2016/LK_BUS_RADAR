// @ts-nocheck
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const endpointPath = path.join(__dirname, '..', 'Resources', 'apiEndpoints.json');
const endpoints = JSON.parse(fs.readFileSync(endpointPath, 'utf8'));

const httpClient = axios.create({
  timeout: Number(process.env.API_TIMEOUT_MS || 10000),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEndpoint(name, params = {}) {
  let url = endpoints[name];
  if (!url) {
    throw new Error(`Unknown endpoint key: ${name}`);
  }

  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, String(value));
  }

  return url;
}

async function getWithRetry(url, options = {}) {
  const retries = Number(options.retries ?? process.env.API_RETRY_COUNT ?? 3);
  const baseDelay = Number(options.baseDelayMs ?? process.env.API_RETRY_DELAY_MS ?? 500);

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await httpClient.get(url);
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      const waitMs = baseDelay * (2 ** attempt);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

module.exports = { getEndpoint, getWithRetry };

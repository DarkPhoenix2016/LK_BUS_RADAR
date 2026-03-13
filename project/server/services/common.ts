// @ts-nocheck
function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}

function getId(obj, keys = ['id', '_id']) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return String(obj[key]);
    }
  }
  return null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function asDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function serviceSummary(name, counters, startedAt, extra = {}) {
  const durationMs = Date.now() - startedAt;
  const output = {
    service: name,
    inserted: counters.inserted,
    updated: counters.updated,
    errors: counters.errors,
    durationMs,
    ...extra,
  };

  console.log(`[${name}]`, output);
  return output;
}

module.exports = {
  toArray,
  getId,
  asNumber,
  asDate,
  serviceSummary,
};

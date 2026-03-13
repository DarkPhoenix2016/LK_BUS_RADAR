// @ts-nocheck

const EMPTY_VALUES = new Set([null, undefined, '', 'N/A', 'n/a', 'NA']);

function isEmpty(value) {
  return EMPTY_VALUES.has(value);
}

function getAdminModifiedMap(doc) {
  const raw = doc?.adminModified;
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  return raw;
}

function isAdminModified(doc, field) {
  return Boolean(getAdminModifiedMap(doc)?.[field]);
}

function getChangedFields(existingDoc, nextFields) {
  const changed = {};
  for (const [key, value] of Object.entries(nextFields)) {
    if (isEmpty(value)) continue;
    const current = existingDoc?.[key];
    const isSame = JSON.stringify(current) === JSON.stringify(value);
    if (!isSame) {
      changed[key] = value;
    }
  }
  return changed;
}

function splitSyncChanges(existingDoc, nextFields) {
  const directUpdates = {};
  const reviewChanges = {};
  const scopeFields = Object.keys(nextFields);

  for (const [key, value] of Object.entries(nextFields)) {
    if (isEmpty(value)) continue;

    const current = existingDoc?.[key];
    const isSame = JSON.stringify(current) === JSON.stringify(value);
    if (isSame) continue;

    if (isAdminModified(existingDoc, key)) {
      reviewChanges[key] = value;
    } else {
      directUpdates[key] = value;
    }
  }

  return { directUpdates, reviewChanges, scopeFields };
}

function buildAdminModifiedFlagObject(fields) {
  return fields.reduce((acc, field) => {
    acc[field] = true;
    return acc;
  }, {});
}

function buildAdminModifiedSet(fields) {
  return fields.reduce((acc, field) => {
    acc[`adminModified.${field}`] = true;
    return acc;
  }, {});
}

function buildAdminModifiedUnset(fields) {
  return fields.reduce((acc, field) => {
    acc[`adminModified.${field}`] = '';
    return acc;
  }, {});
}

async function replaceReviewItems(SyncReview, items, scopes = []) {
  const orFilters = scopes.flatMap(({ entityId, fields }) =>
    (fields || []).map((field) => ({ entityId, field, status: 'pending' }))
  );

  if (orFilters.length > 0) {
    await SyncReview.deleteMany({ $or: orFilters });
  }

  if (!items || items.length === 0) return 0;

  const docs = items.map((item) => ({ ...item, status: 'pending', resolvedAt: null }));
  await SyncReview.insertMany(docs, { ordered: false });
  return docs.length;
}

module.exports = {
  buildAdminModifiedFlagObject,
  buildAdminModifiedSet,
  buildAdminModifiedUnset,
  getChangedFields,
  isAdminModified,
  replaceReviewItems,
  splitSyncChanges,
};

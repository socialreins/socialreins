// Server only: the IndexNow key from INDEXNOW_KEY, read at request time. Unset or malformed means off.
// IndexNow keys are 8 to 128 characters of letters, digits and dashes.
export const indexNowKey = (raw = process.env.INDEXNOW_KEY) => (raw && /^[A-Za-z0-9-]{8,128}$/.test(raw) ? raw : null);

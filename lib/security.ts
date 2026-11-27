// Headers shared by every page (next.config.ts) and every redirect (proxy.ts), so neither answers without them.

// Nothing here uses the camera, microphone, location or the Payment Request API. Passkeys (public key
// credentials) and copying an API token or webhook secret to the clipboard are used and stay allowed.
export const permissionsPolicy = () =>
  [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "publickey-credentials-get=(self)",
    "publickey-credentials-create=(self)",
    "clipboard-write=(self)",
  ].join(", ");

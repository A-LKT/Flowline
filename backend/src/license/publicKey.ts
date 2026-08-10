// Bundled Ed25519 PUBLIC key used to verify premium license tokens (license/verify.ts).
// Safe to ship — only the matching private key (held by the vendor, never in this
// repo) can mint licenses. To rotate: `npm run license:keygen`, paste the new public
// key here, and re-issue outstanding licenses.
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjGB46tR96JWdM+C7bKxhpLrQOqI/MkIr4yWrdJBeGrI=
-----END PUBLIC KEY-----`;

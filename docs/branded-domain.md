# Branded application address

Public player address: https://soulrunnerhoops.vercel.app

Vercel project `prj_L4RtfTGFlxQuMUbUBONASl8JHCap` uses a project routing rule to serve the existing Sites application. The Sites Worker and D1 database remain authoritative; no records were copied or reset. Project routing rules precede the old redirect deployment.

The rule is restricted to the exact public hostname and forwards all paths and query strings to `https://soul-runner-pc-scheduler.romanwilliammorse.chatgpt.site`. Origin Cache-Control is respected; API responses specify no-store. No identity or service bypass token is supplied to the proxy.

The API accepts POST requests from its own origin or the exact branded HTTPS origin when served by the known Sites origin. Arbitrary forwarded-host headers, lookalike names, HTTP origins and missing origins cannot authorize writes. Existing player and owner sessions stay host-only, Secure, HttpOnly and SameSite=Strict. Users must sign in separately at the new hostname.

Player and owner password/PIN authentication runs entirely through the branded origin. League administrator ChatGPT authentication remains platform-owned on the original Sites domain. No alternative administrator identity mechanism was introduced.

Validation: added integration coverage for branded-origin registration, player login, cookie flags, availability persistence/reload, logout, rejected owner actions, and rejected foreign/spoofed origins. No database migration.

References: https://vercel.com/docs/routing/rewrites and https://vercel.com/docs/routing/project-routing-rules.

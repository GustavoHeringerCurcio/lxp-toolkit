# Authentication — how to reach the LXP API

## The single most important fact

**The LXP bearer token is single-use and single-page-session.** You cannot save it
(`storageState.json`) and reuse it later — it is dead by the next page load. Every run must do a
**fresh login** through `unifoa.lyceum.com.br`.

## End-to-end flow

```
1. GET https://unifoa.lyceum.com.br/aluno/#/login
     fill #username (RA: REDACTED_RA) and #password
     submit form button[type=submit]
     (reCAPTCHA #g-recaptcha appears only intermittently — often absent)

2. Lyceum logs in DIRECTLY (no Microsoft SAML redirect) and lands on
   https://unifoa.lyceum.com.br/aluno/#/home/avisos
   The Angular app writes the nav menu to sessionStorage["ngStorage-menu"].

3. The menu contains item name === "LXP" with a one-time tokenId:
   { "name": "LXP", "url": "https://unifoa2.grupoa.education/plataforma/?tokenId=<uuid>" }

4. GET that URL (the LXP SPA, Nuxt 3):
     t≈0ms   localStorage["plataforma_accessToken"] = <tokenId>        (raw, temp)
     t≈500ms localStorage["plataforma_accessToken"] = <DIFFERENT uuid> (exchanged token)

   ⚠ The raw tokenId only works for /v2/safea-client/users/me. The academic/content API
   rejects it with 403 safea-client-403_token-expired. You MUST wait for the exchange and
   use the EXCHANGED token.
```

## Required request headers

```
authorization: <exchanged plataforma_accessToken>
accept: application/json
x-user-timezone: America/Sao_Paulo
x-notice-show-modal: false
x-notice-signature: <noticeToken.signature>     # optional, from plataforma_noticeToken
x-notice-expired-at: <noticeToken.expiredAt>    # optional
```

## Token lifecycle (measured)

| Event | Observation |
|---|---|
| tokenId → exchanged token | ~0.5s after the SPA loads |
| token works for | the whole SPA session (client-side navigation) |
| token dies on | a **full page reload** (`page.goto`) → SPA clears it → redirect to `/auth/signin` |
| saved-session reuse | always fails (`safea-client-403_token-expired`) |

**Implications for automation:**

- Do login + all API calls in **one browser session**.
- Navigate the SPA with `$nuxt.$router.push("/course/{id}/content/{itemId}")`, NEVER `page.goto`
  (full reload kills the token).
- Direct JSON calls via native `fetch` work for the life of the session (GETs are not blocked by
  AWS WAF).

## Storage / cookies observed

LXP origin (`unifoa2.grupoa.education`) localStorage:
- `plataforma_accessToken` — the exchanged bearer token (36-char UUID)
- `isSSOAccess` — `"true"` right after SSO handshake
- `awswaf_token_refresh_timestamp`, `awswaf_session_storage` — AWS WAF state

Lyceum cookies (auth only): `JSESSIONID`, `user-data`, `__goc_session__`.

`.unifoa2.grupoa.education` cookie: `aws-waf-token` (long JWT-ish blob). NOT required for the GET
reads observed so far; may be required for writes (POST/PUT).

## Code reference

- `src/session.ts::createSession()` — launches Chromium, ALWAYS fresh-logins, waits for the token
  exchange, returns `{ browser, context, page, client, auth }`.
- `src/client.ts::ApiClient` — authenticated `fetch` wrapper (retry/backoff, exact headers).
- `src/auth.ts::authenticate` / `waitForExchangedToken` — the login + exchange logic.

# Authentication & SSO — Grupoa LXP

> Reverse-engineered from live traffic. This is the **corrected** version of the flow; the
> original `docs/PLAN.md §2.1` guessed a Microsoft SAML redirect that **does not actually happen**
> for this tenant. See "Corrections" at the bottom.

## TL;DR

The LXP access token is **single-use and tied to a single page session**. You **cannot** save it
to `storageState.json` and reuse it later — it is dead by the next page load. Every run must do a
fresh login through `unifoa.lyceum.com.br`.

## The flow (end-to-end)

```
1. GET  https://unifoa.lyceum.com.br/aluno/#/login
        → fill #username (RA), #password
        → submit form button[type=submit]
        → (reCAPTCHA #g-recaptcha only appears intermittently — often absent)

2. Lyceum logs in directly (NO Microsoft SAML redirect) and lands on
        https://unifoa.lyceum.com.br/aluno/#/home/avisos
   The Angular app then fetches:
        GET /aluno/apix/pessoas/menu-aluno-agrupado?aluno={ra}&pessoa={personId}
        GET /aluno/apix/pessoas/codAluno/{ra}/parametros-integracao-sso
   and writes the nav menu into sessionStorage["ngStorage-menu"].

3. The menu contains an item named "LXP" whose url carries a one-time tokenId:
        {
          "name": "LXP",
          "url": "https://unifoa2.grupoa.education/plataforma/?tokenId=<uuid>"
        }
   (Extraction helper: read `ngStorage-menu` from sessionStorage, find item name === "lxp".)

4. GET  https://unifoa2.grupoa.education/plataforma/?tokenId=<uuid>
        → the LXP SPA (Nuxt 3) writes the raw tokenId into
          localStorage["plataforma_accessToken"]  (t=0ms)
        → then exchanges it (t≈500ms) for a NEW token:
          localStorage["plataforma_accessToken"] = <different uuid>

   ⚠ The raw tokenId works only for /v2/safea-client/users/me. The academic/content API rejects
   it with 403 safea-client-403_token-expired. You MUST wait for the exchange and use the
   EXCHANGED token. (Handled by `src/auth.ts::waitForExchangedToken`.)

5. All subsequent API calls use:
        authorization: <exchanged plataforma_accessToken>
        accept: application/json
        x-user-timezone: America/Sao_Paulo
        x-notice-show-modal: false
        (optionally x-notice-signature / x-notice-expired-at from plataforma_noticeToken)
```

## Token lifecycle (measured)

| Event | Observation |
|---|---|
| `tokenId` → `plataforma_accessToken` | exchange happens ~0.5s after the SPA loads |
| token works for | the whole SPA session (client-side navigation) |
| token dies on | a **full page reload** (`page.goto` to a new URL) → SPA clears it and redirects to `/plataforma/auth/signin` |
| saved-session reuse | always fails (`safea-client-403_token-expired`) |

**Implication for scraping:** do login + all API calls in **one browser session**. For the SPA
to keep its token while crawling routes/content, navigate via the SPA router
(`window.$nuxt.$router.push("/course/{id}/content/{itemId}")`) — **not** `page.goto`, which
reloads and kills the token. The direct JSON API (`src/client.ts`) also works for the life of the
session, since the token is valid for native `fetch` too.

## Auth-relevant endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v2/safea-client/settings/applications/plataforma/hostname/unifoa2.grupoa.education` | public app config (theme, logo, tenant) |
| GET | `/v2/safea-client/users/me` | identity + tenant; the tokenId works here pre-exchange |
| GET | `/v1/plataforma/users/roles/me` | role: `{ safeaRole: "student", isStudent: true, ... }` |

## localStorage / cookies observed

**LXP origin (`unifoa2.grupoa.education`)** localStorage:
- `plataforma_accessToken` — the exchanged bearer token (36-char UUID)
- `isSSOAccess` — `"true"` right after SSO handshake
- `awswaf_token_refresh_timestamp`, `awswaf_session_storage` — AWS WAF challenge state

**Lyceum origin (`unifoa.lyceum.com.br`)** cookies (auth only, out of scope to crawl):
- `JSESSIONID`, `user-data`, `__goc_session__`

**`.unifoa2.grupoa.education`** cookie:
- `aws-waf-token` — AWS WAF token (a long base64 JWT-like blob). Not required for the GET API
  calls observed so far; may be required for write/POST operations.

## Corrections to PLAN.md §2.1

1. **No Microsoft SAML redirect** for this tenant — Lyceum authenticates username/password
   directly and lands on `#/home/avisos`.
2. The LXP deep-link is in `sessionStorage["ngStorage-menu"]` (item `name === "LXP"`), **not**
   in a random storage scan.
3. The `plataforma_accessToken` goes through a **two-phase** value (raw `tokenId` then exchanged
   token); using the raw value fails the academic API.
4. The token is **single page-session**; `storageState.json` reuse is pointless. This is why
   `src/session.ts::createSession` now always performs a fresh login.

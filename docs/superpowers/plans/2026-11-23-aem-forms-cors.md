# AEM Forms CORS for DA site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `da-demo-site-milan-v2` pages read AEM Forms `.model.json` from publish and submit to publish.

**Architecture:** OSGi CORS policy on publish, plus dispatcher changes (pass CORS request headers, don't cache
forms model JSON) in the `mobile-app` AEM repo. The da-demo form block points submit at the publish origin.

**Tech Stack:** AEM as a Cloud Service (OSGi `.cfg.json`, Dispatcher `.any`), EDS vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-23-aem-forms-cors-design.md`

## Global Constraints

- AEM repo: `D:\Adobe-EDS Migration\aem-page-to-json\workdpace\mobile-app`, branch `dispatcher-cors-da-preview` from `adobe/develop-v2`.
- Origins: regex `https://[a-z0-9-]+--da-demo-site-milan-v2--milandevnath-aem\.aem\.(page|live)` + `http://localhost:3000`. Never `*`, `supportscredentials: false`.
- CORS paths only: `/content/forms/af/.*\.model\.json`, `/adobe/forms/af/submit/.*`. Publish run mode only.
- Don't edit immutable dispatcher files (`default_*.any`, `default.vhost`).
- Deviation from spec: §2.4 (`Vary: Origin` vhost) is deferred until post-deploy check V2 shows CDN cross-origin caching.

## Review Focus

1. `.aem.live` request after a `.aem.page` request still gets its own ACAO (dispatcher/CDN cache) → V2.
2. Unknown origin gets no ACAO → V3.
3. Submit preflight with `content-type, x-adobe-form-hostname` → V4.
4. Sheet forms and aem.page HTML-link forms on da-demo are unaffected by the submit base change → Task 3 check.
5. Author UE unaffected (config is publish-only) → V7.

---

### Task 1: Publish CORS policy (mobile-app)

**Files:**
- Create: `ui.config/src/main/content/jcr_root/apps/EdsMobileApp/osgiconfig/config.publish/com.adobe.granite.cors.impl.CORSPolicyImpl~da-demo-forms.cfg.json`

- [ ] Create branch `dispatcher-cors-da-preview` from `adobe/develop-v2`.
- [ ] Write the config with the spec §1 values exactly.
- [ ] Verify: `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"` exits 0; regex tests: matches `https://main--da-demo-site-milan-v2--milandevnath-aem.aem.page`, `https://feat-x--da-demo-site-milan-v2--milandevnath-aem.aem.live`; rejects `https://evil.example`, `https://main--other--milandevnath-aem.aem.page`.
- [ ] Commit.

### Task 2: Dispatcher headers + cache (mobile-app)

**Files:**
- Modify: `dispatcher/src/conf.dispatcher.d/clientheaders/clientheaders.any` (append `"Origin"`, `"Access-Control-Request-Method"`, `"Access-Control-Request-Headers"` after the `$include`)
- Modify: `dispatcher/src/conf.dispatcher.d/cache/rules.any` (append `/0100 { /glob "/content/forms/af/*.model.json" /type "deny" }`)

- [ ] Edit both files.
- [ ] Verify: run `dispatcher/bin/validate.sh src` if the SDK is present; otherwise note that the Cloud Manager build validates.
- [ ] Commit; push branch to `adobe` remote (needs Milan's Cloud Manager git credentials).

### Task 3: Submit to publish (da-demo)

**Files:**
- Modify: `blocks/form/form.js` `decorate()`

- [ ] When the resolved `href` is an absolute URL on another origin and its path ends with `.model.json`, call `setSubmitBaseUrl(new URL(href).origin)` (import from `./constant.js`) before `setupForm`.
- [ ] Verify: locally on `form-test`, both the person-details block (aem.page link) and the sheet test path keep `getSubmitBaseUrl() === ''`; lint passes.
- [ ] Commit (push after the CORS deploy passes V1–V4).

### Deploy + verification (after Milan runs the dev pipeline)

| # | Check | Pass |
|---|---|---|
| V1 | GET model.json, `Origin: …aem.page` | ACAO echoes the origin |
| V2 | Then the same with `Origin: …aem.live` | ACAO echoes `.aem.live` (else add §2.4 vhost) |
| V3 | `Origin: https://evil.example` | no ACAO |
| V4 | OPTIONS submit, method POST, headers `content-type,x-adobe-form-hostname` | allowed |
| V5 | Browser `form-test` | Contact Us renders, no console errors |
| V6 | Submit | publish 200 |
| V7 | Author UE contact-us-form-test, public-bodea | unchanged |

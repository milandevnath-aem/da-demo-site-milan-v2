# Render AEM Forms (headless JSON) on the DA site — CORS design

Date: 2026-11-23
Status: draft, awaiting approval

## Intent

Learn the standard AEM Forms way: a form is authored once in the AEM Forms console
(`/content/dam/formsanddocuments`) and rendered on the DA site
(`milandevnath-aem/da-demo-site-milan-v2`) by reading the form's **JSON model from AEM publish**,
with no Edge Delivery page for the form and no HTML scraping.

Working example: `contact-us-form-test`
- JSON: `https://publish-p35437-e2207568.adobeaemcloud.com/content/forms/af/contact-us-form-test/jcr:content/root/section/form.model.json`
- DA page: `form-test` (second Form block links to that URL; previewed)

## Current state (verified 2026-11-23)

| Check | Result |
|---|---|
| GET `.model.json` on publish, anonymous | 200, `application/json`, 6 items |
| `Access-Control-Allow-Origin` for any origin (da-demo page/live, localhost, da.live, author) | none |
| OPTIONS preflight | 200, no CORS headers |
| Browser on `form-test` | `blocked by CORS policy: No 'Access-Control-Allow-Origin' header` → block shows only the link |
| Submit URL in JSON | relative `/adobe/forms/af/submit/<base64 form path>` → would POST to the DA site origin |

Browser requests the DA page makes to publish:
1. `GET …/form.model.json` — simple request, needs `Access-Control-Allow-Origin`.
2. `POST /adobe/forms/af/submit/<id>` — sends `Content-Type: application/json` and custom header
   `x-adobe-form-hostname` (`blocks/form/submit.js`), so the browser sends an **OPTIONS preflight** first.
3. `GET /adobe/forms/af/data/<id>` — only if prefill (`fd:formDataEnabled`) is on. It's off for this form.

## Goals

- Contact Us form renders on `form-test` from publish JSON, on `.aem.page`, `.aem.live` and `localhost:3000`.
- Submit reaches AEM Forms on publish and runs the form's configured submit action.
- CORS is opened **only** for the da-demo origins and **only** for forms paths.

## Non-goals

- Changing how forms authored as Sites pages (public-bodea) render.
- Prefill, reCAPTCHA, custom functions served from AEM.
- Production / custom domain origins (add later to the same config).

## Anti-goals (failure even if it "works")

- `Access-Control-Allow-Origin: *` or credentials allowed: this AEM environment is shared (Adobe LiveEx 3).
- CORS headers cached by dispatcher/CDN for one origin and served to another (breaks `.aem.live` after `.aem.page` warmed the cache, or the reverse).
- Opening CORS on author.

## Approaches considered

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | **OSGi CORS policy on publish** (`com.adobe.granite.cors.impl.CORSPolicyImpl`), plus dispatcher passes CORS request headers and keeps CORS responses origin-safe | Adobe's documented way; per-origin and per-path; needs Cloud Manager deploy | **Chosen** |
| A′ | Apache `Header set Access-Control-*` in dispatcher vhost | Works, but duplicates what AEM does natively; hard to get per-origin echo and preflight right | Rejected |
| B | Proxy (App Builder / Cloudflare Worker) adding CORS | No AEM deploy; extra service to run; not the standard way | Rejected earlier |

## AEM repo facts (verified in `mobile-app`, 2026-11-23)

Repo: `D:\Adobe-EDS Migration\aem-page-to-json\workdpace\mobile-app`. Remote `adobe` points to
`https://git.cloudmanager.adobe.com/adobeliveex3/AdobeLiveEx3Program-p35437/`. App folder is `EdsMobileApp`,
which matches `/apps/EdsMobileApp` on the environment. Work branch: `dispatcher-cors-da-preview`, created from
`adobe/develop-v2` (16357c0), which is the only branch on the Cloud Manager remote.

| Item | Today | Change needed |
|---|---|---|
| `osgiconfig/config.author/…CORSPolicyImpl~EdsMobileApp.cfg.json` | exists (author, localhost:3000, `/(content\|conf)/EdsMobileApp.*`, GET/HEAD) | none, leave as is |
| `osgiconfig/config.publish/` | only `JcrResourceResolverFactoryImpl.cfg.json`, no CORS | **add** CORS policy |
| `filters/default_filters.any` `/0062` | allows `GET\|POST\|OPTIONS` on `/adobe/forms/*` | none: submit preflight and POST already pass |
| `filters/filters.any` `/0101` | allows `.model.json` under `/content/*` | none |
| `clientheaders/default_clientheaders.any` | has **no** `Origin` / `Access-Control-Request-*` | **add** in `clientheaders.any` |
| `cache/default_rules.any` `/0000` | caches everything | **add** deny for forms `.model.json` in `rules.any` |
| farm `/cache /headers` | caches Cache-Control, Content-Type…, **not** `Access-Control-*` | none, but this is why cached hits would lose CORS (see 2.3) |
| Live `.model.json` response | `vary: Accept-Encoding`, no `cache-control`, `x-cache: MISS` | add `Vary: Origin` for CDN safety |

## Design

### 1. AEM publish: OSGi CORS policy (AEM project, `ui.config`)

File: `ui.config/src/main/content/jcr_root/apps/EdsMobileApp/osgiconfig/config.publish/com.adobe.granite.cors.impl.CORSPolicyImpl~da-demo-forms.cfg.json`

```json
{
  "alloworigin": [],
  "alloworiginregexp": [
    "https://[a-z0-9-]+--da-demo-site-milan-v2--milandevnath-aem\\.aem\\.(page|live)",
    "http://localhost:3000"
  ],
  "allowedpaths": [
    "/content/forms/af/.*\\.model\\.json",
    "/adobe/forms/af/submit/.*"
  ],
  "supportedheaders": [
    "Origin", "Accept", "Content-Type", "X-Requested-With",
    "x-adobe-form-hostname",
    "Access-Control-Request-Method", "Access-Control-Request-Headers"
  ],
  "supportedmethods": ["GET", "HEAD", "POST", "OPTIONS"],
  "maxage:Integer": 1800,
  "supportscredentials": false,
  "exposedheaders": [""]
}
```

- `config.publish` only, so author is untouched.
- The origin regex covers every branch (`{branch}--da-demo-site-milan-v2--…`), which PR preview links need.
- `supportscredentials: false` means no cookies are sent cross-site.

### 2. Dispatcher (AEM project, `dispatcher/src`)

**2.1 `conf.dispatcher.d/clientheaders/clientheaders.any`**: pass CORS request headers to AEM. Without them AEM
never sees a CORS request.
```
$include "./default_clientheaders.any"
"Origin"
"Access-Control-Request-Method"
"Access-Control-Request-Headers"
```

**2.2 Filters**: no change. `/0062` already allows `GET|POST|OPTIONS /adobe/forms/*`, and `/0101` allows `*.model.json`.

**2.3 `conf.dispatcher.d/cache/rules.any`**: don't cache forms model JSON. The farm's `/headers` list doesn't store
`Access-Control-*`, so a cached hit would come back **without** CORS headers and break the form at random. Adding
them to `/headers` instead would replay one origin's header to every other origin. Model JSON is small, so skipping
the cache costs little.
```
/0100 { /glob "/content/forms/af/*.model.json" /type "deny" }
```

**2.4 `conf.d/available_vhosts/default.vhost`**: tell the CDN the response depends on `Origin`.
```
<LocationMatch "^/(content/forms/af/.*\.model\.json|adobe/forms/af/.*)$">
  Header merge Vary Origin
</LocationMatch>
```

Validate with the Dispatcher SDK (`cd dispatcher && ./bin/validate.sh src`, per repo AGENTS.md) if the SDK is
installed locally. Otherwise the pipeline's build step validates it.

### 3. DA site form block (`da-demo-site-milan-v2/blocks/form/form.js`)

When the block's link is an absolute URL on another origin ending in `.model.json`, call
`setSubmitBaseUrl(new URL(href).origin)` before `setupForm`. `formDef.action` then becomes
`https://publish-…/adobe/forms/af/submit/<id>` instead of a path on the DA site.
This is a single conditional in `decorate`, and it doesn't affect sheet forms or the aem.page HTML route.

### 4. Form submit action (AEM author, Forms console)

`contact-us-form-test` has no meaningful submit action yet. Pick one in the form's **Submission** properties and
re-publish. See open question 2.

## Rollout

1. Clone the Cloud Manager repo and read its `ui.config` and `dispatcher` layout. Adjust paths and filenames in this doc to match.
2. Commit 1 (AEM repo, branch → PR): OSGi CORS config + dispatcher changes.
   Validate locally with the dispatcher SDK validator (`validate.sh`) if it's available.
3. Deploy with the Cloud Manager **non-prod pipeline** to the dev environment (`p35437-e2207568`).
   Optional and faster: test the OSGi config on an RDE first, if the program has one.
4. Commit 2 (da-demo repo): submit base URL change; push to `main` after the CORS checks pass.
5. Set the submit action on the form and re-publish.

## Verification

| # | Check | Pass |
|---|---|---|
| 1 | `curl -H "Origin: https://main--da-demo-site-milan-v2--milandevnath-aem.aem.page" <model.json>` | `Access-Control-Allow-Origin` echoes that origin |
| 2 | Same with `.aem.live` origin, run **after** #1 | echoes `.aem.live` (proves no cross-origin cache poisoning) |
| 3 | Same with `Origin: https://evil.example` | no ACAO header |
| 4 | `OPTIONS /adobe/forms/af/submit/<id>` with `Access-Control-Request-Method: POST`, `-Headers: content-type,x-adobe-form-hostname` | 200, allows POST + those headers |
| 5 | Browser `form-test` (`.aem.page`) | Contact Us renders (6 items), no console errors |
| 6 | Submit valid data | 200 from publish; the configured action runs |
| 7 | Author UE and public-bodea pages | unchanged |

## Rollback

Revert the AEM repo commit and redeploy the pipeline. CORS headers disappear and the form block falls back to showing
the link. Revert the da-demo commit separately if needed.

## Open questions (owner: Milan)

1. ~~Repo~~ resolved: `mobile-app`, branch `dispatcher-cors-da-preview`. Still open: does the **dev pipeline** deploy
   that branch (or will it be merged into `develop-v2`, which the pipeline deploys)? Who runs the pipeline?
2. What should Submit do for this learning form? Options: **Send email**, **Submit to REST endpoint**,
   **Spreadsheet** (routed to `forms.adobe.com`, which needs no CORS for submit), or a thank-you only.
3. Does the program have an RDE for fast OSGi testing?

## Left to the builder

- Exact file paths and naming conventions from the real AEM repo.
- Whether dispatcher filters for `/adobe/forms/af/submit` already exist (AEM Forms archetype often includes them).

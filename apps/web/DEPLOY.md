# Deploying THE UNSEEN

This file covers the hosted auditor (one Docker image), the always-up replay edition (a static site), the limits you can set, and the egress controls. Nothing here creates an account or deploys for you: the owner runs the steps.

**Security first.** The in-process SSRF guard is one layer. Read "Egress controls" below before you expose the hosted auditor, and keep `UNSEEN_DEV_ALLOW_PRIVATE` unset: the server refuses to start with it when `NODE_ENV=production`.

## The image

`apps/web/Dockerfile` builds from the repository root:

```sh
npm run docker:build -w @the-unseen/web     # docker build -f apps/web/Dockerfile -t unseen-web .
```

- Two stages. The build stage runs `npm ci` and compiles `packages/core`, `packages/mcp` and `apps/web`. The runtime stage installs production dependencies only and copies the compiled output.
- Base image `mcr.microsoft.com/playwright:v1.65.1-noble`, pinned to the Playwright version in `package-lock.json`. Playwright refuses to launch a browser of another version, so change the tag and the lockfile together. The image runs a newer Node than the project's Node 22 target (the build output showed Node 26 when this was written); the code uses no feature newer than Node 22.
- Runs as the non-root `pwuser`, with `NODE_ENV=production`, `PORT=8080` and `UNSEEN_CHROMIUM_CHANNEL=""` (an empty value selects the Chromium that ships in the image).
- `HEALTHCHECK` calls `/api/health`. The server reads `PORT`, so a platform that injects its own works.
- The audits of the Cursed Shop in `apps/web/samples/` are served as files. Nothing re-audits them at start-up.
- Give the container `--ipc=host` when you run it yourself. Chromium otherwise runs out of shared memory (the Playwright image documents this). Fly.io and Render handle shared memory on their side.

Run it and smoke-test it:

```sh
npm run docker:smoke -w @the-unseen/web          # starts the image on localhost:8080, runs the checks, removes the container
SMOKE_HOST_PORT=18080 npm run docker:smoke -w @the-unseen/web   # when port 8080 is taken
node apps/web/scripts/smoke.mjs https://your-app.example.com    # against a deployed URL; add --no-live without outbound internet
```

The smoke test checks, with real requests: `/api/health`; `/` serves the SPA with a `Content-Security-Policy` header; the samples are served and one has a numeric score; `http://169.254.169.254/` is refused with a 4xx `SSRF_BLOCKED` that does not echo the address; and a live audit of `SMOKE_AUDIT_URL` (default `https://example.com/`) finishes with a numeric score.

## Limits (environment variables)

Defaults are the values in `.kiro/steering/security.md`, which is the single source of truth. An invalid value (empty, text, a fraction, out of range) falls back to the default for that variable.

| Variable | Default | Range | What it limits |
|----------|---------|-------|----------------|
| `PORT` | 8080 in the image (3000 otherwise) | 1 to 65535 | Port the server listens on |
| `UNSEEN_MAX_CONCURRENCY` | 2 | 1 to 20 | Audits running at once (one Chromium each). 2 fits a 1 GB instance |
| `UNSEEN_QUEUE_DEPTH` | 20 | 0 to 200 | Audits allowed to wait. The next one gets HTTP 503 |
| `UNSEEN_AUDIT_TIMEOUT_MS` | 60000 | 5000 to 300000 | Full audit (render, AX tree, axe, Tab walk) |
| `UNSEEN_RATE_PER_MINUTE` | 5 | 1 to 1000 | Audits per IP per minute (HTTP 429 with `Retry-After`) |
| `UNSEEN_RATE_PER_HOUR` | 30 | 1 to 10000 | Audits per IP per hour |
| `UNSEEN_MAX_REQUESTS` | 500 | 1 to 5000 | Requests one page may make. Over the limit, the audit stops with `RESOURCE_LIMIT` |
| `UNSEEN_MAX_TOTAL_MB` | 50 | 1 to 500 | Total page weight. Over the limit, the audit stops with `RESOURCE_LIMIT` |
| `UNSEEN_MAX_RESOURCE_MB` | 10 | 1 to 100 | One resource. Over the limit, that request is aborted and the audit goes on |
| `UNSEEN_CHROMIUM_CHANNEL` | empty in the image | | Empty means the bundled Chromium. Set `chromium` on a Windows development host |

The page navigation timeout (30 s) and the DNS timeout (5 s) are fixed. Lowering the limits is safe. Raising concurrency needs memory: about 400 to 500 MB per running audit is a fair planning figure, but measure on your platform.

## Fly.io

`apps/web/fly.toml` is ready: memory 1 GB, one region, one machine that is never auto-stopped (a stopped machine drops queued jobs and finished results, which live in memory), and an HTTP health check on `/api/health`.

1. Install `flyctl` and run `fly auth login`.
2. Change `app` in `apps/web/fly.toml` to a free name and `primary_region` to the region you want.
3. From the repository root: `fly launch --no-deploy --copy-config --config apps/web/fly.toml --dockerfile apps/web/Dockerfile`.
4. `fly deploy --config apps/web/fly.toml .` (the trailing `.` is the build context, the repository root).
5. `node apps/web/scripts/smoke.mjs https://<app>.fly.dev`.
6. Apply the egress rules for Fly.io below, or accept that the in-process proxy is the only layer.

Not verified here: no Fly.io account was used to write this file. If `fly launch` rewrites the file, keep the `[[vm]]` memory at 1 GB or more and `auto_stop_machines = "off"`.

## Render

`render.yaml` (repository root, where Render looks for it) describes one Docker web service in one region with the health check on `/api/health`.

1. Push the repository to GitHub or GitLab.
2. In the Render dashboard choose New > Blueprint, pick the repository and apply `render.yaml`.
3. Render has no 1 GB plan. `standard` (2 GB) is the smallest plan that clears the 1 GB minimum; check the current plan names and prices before applying.
4. Leave `numInstances` at 1: jobs and results are in memory and do not move between instances.
5. `node apps/web/scripts/smoke.mjs https://<service>.onrender.com`.

Not verified here: no Render account was used to write this file.

## Replay edition on GitHub Pages

The replay edition is the always-up fallback: the same React app as a fully static site, with the pre-recorded Cursed Shop audits, their screenshots, thumbnails and speech tracks bundled as files. Every view works (Spirit Sight, keyboard walk, whisper walk, Daylight, export, the haunting dialog and Takes Form). The URL form is disabled and a note says so. The page makes no request to `/api`; the replay e2e checks that.

Build and look at it locally:

```sh
npm run build:replay -w @the-unseen/web      # writes apps/web/dist-replay/
npm run serve:replay -w @the-unseen/web      # serves it like GitHub Pages at http://127.0.0.1:4173/unseen/
npm run e2e:replay -w @the-unseen/web        # the replay e2e, including the self-audit
```

Build-time settings:

| Variable | Default | Meaning |
|----------|---------|---------|
| `UNSEEN_REPLAY_BASE` | `/unseen/` | Sub-path the site is served under. `/unseen/` is right for the repository `PRIEST099/unseen` |
| `UNSEEN_LIVE_URL` | empty | Address of the live auditor, shown in the notice. When empty, the second sentence is left out. Only an `http(s)` URL is accepted |

To turn it on (the workflow `.github/workflows/replay-pages.yml` never enables Pages itself):

1. In the GitHub repository open Settings > Pages and set Source to "GitHub Actions".
2. Optional: under Settings > Secrets and variables > Actions > Variables, add `UNSEEN_LIVE_URL` with the live auditor's address.
3. Push to `main` (or run the workflow by hand). The site appears at `https://priest099.github.io/unseen/`.

Unknown paths load `404.html`, a copy of the app, so deep links such as `/unseen/sample/cursed-shop-index/daylight` work. GitHub Pages sends that page with status 404. Browsers show it normally, but some link checkers will report it.

## Refreshing the sample audits

The files in `apps/web/samples/` are committed. The server and the replay build only read them. To record new ones (a rule changed, a new Chromium or axe-core version), run locally with a browser available:

```sh
npm run build -w @the-unseen/core
npm run build-samples -w @the-unseen/web    # on Windows set UNSEEN_CHROMIUM_CHANNEL=chromium first
```

Commit the changed files. The audits record the tool versions they ran with, and the Daylight "Scan record" shows them.

# Egress controls

The in-process SSRF guard (`packages/core/src/runner/ssrf-guard-proxy.ts`) is the primary defence. Every audit starts its own proxy, and Chromium reaches the network only through it. An egress firewall is a second layer for the case where that guard has a bug. It does not replace the guard, and the guard does not replace it.

The hosted auditor must not be exposed publicly on a platform where neither layer is active.

## What to block

Block outbound traffic **from the container** to the ranges in `.kiro/steering/security.md` ("Blocked address ranges") and `packages/core/src/runner/ip-classifier.ts`:

- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`
- `169.254.0.0/16` (includes the AWS, GCP and Azure metadata address `169.254.169.254`)
- `127.0.0.0/8` on every interface except `lo`
- `0.0.0.0/8`, `192.0.0.0/24`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`
- IPv6: `fc00::/7`, `fe80::/10`, `fd00:ec2::254`, and anything that is not global unicast (`2000::/3`)

Two things must stay open or the auditor stops working:

1. **Loopback (`lo`).** Chromium talks to the per-audit proxy on `127.0.0.1:<random port>`, and the Fastify server listens locally. Do not drop traffic on the `lo` interface.
2. **Your DNS resolver.** On many platforms it has a private address (Docker's embedded resolver is `127.0.0.11`; AWS VPC DNS is `169.254.169.253` or the VPC base +2). Allow it before the drop rules.

The proxy's own upstream connections go to validated public addresses only, so blocking private ranges never affects them.

## Docker (self-hosted)

Rules in the host's `OUTPUT` chain do **not** filter container traffic: container packets are forwarded, not locally generated. Use the `DOCKER-USER` chain, which Docker evaluates before its own forwarding rules and does not overwrite.

```sh
# Replace 172.17.0.0/16 with the auditor's network (docker network inspect <name>).
SRC=172.17.0.0/16
iptables -I DOCKER-USER -s $SRC -d <dns-resolver-ip> -p udp --dport 53 -j ACCEPT
iptables -I DOCKER-USER -s $SRC -d <dns-resolver-ip> -p tcp --dport 53 -j ACCEPT
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 \
           0.0.0.0/8 192.0.0.0/24 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4; do
  iptables -A DOCKER-USER -s $SRC -d $net -j DROP
done
```

Add the IPv6 equivalents with `ip6tables -A DOCKER-USER` for `fc00::/7`, `fe80::/10` and `ff00::/8` if the Docker network has IPv6 enabled. Rules inserted with `-I` go above the drops, so the resolver allow-rules win.

Check the rule order with `iptables -S DOCKER-USER`. The auditor's own network traffic to other containers on the same bridge is also dropped by these rules (the bridge is inside `172.16.0.0/12`). If the auditor must reach another container, add an `ACCEPT` for that single address above the drops.

## Kubernetes

Use a `NetworkPolicy` with an egress allow-list. This requires a CNI that enforces policies (Calico, Cilium); on a cluster without one the object is accepted and does nothing.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: unseen-egress
spec:
  podSelector:
    matchLabels: { app: unseen-web }
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels: { k8s-app: kube-dns }
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
              - 100.64.0.0/10
              - 169.254.0.0/16
              - 0.0.0.0/8
              - 192.0.0.0/24
              - 198.18.0.0/15
              - 224.0.0.0/4
              - 240.0.0.0/4
```

Pod-internal loopback traffic is not subject to NetworkPolicy. Pod and service CIDRs often sit inside the `10.0.0.0/8` exception, so the policy also isolates the auditor from the rest of the cluster, which is the intent.

## AWS (ECS, EC2)

Security groups only **allow**; they cannot express "everything except these ranges" without enumerating the public space. Use one of:

- A network ACL on the subnet with deny rules for the private and link-local ranges, evaluated before an allow-all rule.
- A subnet route table with no route to internal networks, plus a NAT gateway for the internet.
- On EC2, require IMDSv2 and set the instance metadata hop limit to 1, so a process in a container cannot reach `169.254.169.254` even if a request leaks through. This is a separate control from the firewall and is recommended in addition.

## Fly.io, Render, Railway

| Platform | State of knowledge | What to do |
|----------|--------------------|-----------|
| Fly.io | Machines are Firecracker microVMs, so `iptables` inside the VM filters that machine's own traffic. This has not been verified for this project. | Apply the Docker rules above to `OUTPUT` (not `DOCKER-USER`) from an entrypoint script, and confirm with the test below. Needs the `NET_ADMIN` capability. |
| Render | No user-configurable egress filtering was found in its documentation when this was written. | The in-process proxy is the only layer. Check the current documentation before relying on this. |
| Railway | Same as Render. | The in-process proxy is the only layer. Check the current documentation before relying on this. |

When a platform cannot enforce egress rules, say so in the runbook and treat the in-process proxy as the single control. Do not describe that deployment as defended in depth.

## Verify the rules are active

Run these inside the running container (or `docker exec` into it). Each must fail or time out:

```sh
curl -m 5 http://169.254.169.254/latest/meta-data/   # cloud metadata
curl -m 5 http://10.0.0.1/                           # RFC 1918
curl -m 5 http://192.168.0.1/
```

This must still succeed, to show the firewall is not blocking everything:

```sh
curl -m 10 -I https://example.com/
```

The in-process guard has its own end-to-end check in `packages/core/tests/safe-fetch-loopback.int.spec.ts`: a page `fetch()`es `127.0.0.1`, `localhost`, `[::1]` and `169.254.169.254`, all four land in `blockedRequests`, and the live server records no hits.

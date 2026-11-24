# Deploying the hosted auditor: egress controls

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

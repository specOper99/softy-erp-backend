# Kubernetes Manifests — Reference Only

> **Production deployments use [Coolify](https://coolify.io) via `backend/docker-compose.coolify.yml`.**
> These manifests are **not maintained for active production rollout**.

## Purpose

Keep historical K8s configuration for:

- Resource limit and probe tuning ideas (see comments in `deployment.yaml`)
- Network policy patterns
- HPA / canary examples

## Do not

- Apply these manifests to production without a dedicated K8s migration project
- Expect Flagger/Argo rollouts to be configured or supported
- Use `backend/deploy.sh --kubernetes` for new environments

## Production path

See [RUNBOOK.md](../../RUNBOOK.md) and [docs/COOLIFY_DEPLOYMENT_GUIDE.md](../docs/COOLIFY_DEPLOYMENT_GUIDE.md).

## Files

| File | Notes |
|------|-------|
| `deployment.yaml` | App deployment, probes, resources |
| `ingress.yaml` | Ingress routing |
| `hpa.yaml` | Horizontal pod autoscaler |
| `networkpolicy.yaml` | Network isolation |
| `prometheus-configmap.yaml` | Scraping config |
| `canary-deployment.yaml` | Canary pattern (not wired) |

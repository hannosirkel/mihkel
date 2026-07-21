# Decisions

## 2026-07-21 — VM as sandbox

Mihkel receives broad autonomy inside a disposable VM. Network isolation,
scoped credentials, GitHub review, and the deployment pipeline constrain
effects outside it.

## 2026-07-21 — Reviewed production changes

Mihkel develops Servitium on branches. One human review is required before
Mihkel merges; automation then builds and deploys the approved commit.

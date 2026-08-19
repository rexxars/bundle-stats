---
'@rexxars/bundle-stats': major
---

Rewrite bundle-stats around an ESM-only config and scenario API. Measurement now uses Rolldown with bounded concurrency, supports named consumer entries, separates measurement from comparison, and keeps insignificant changes in collapsed report details.

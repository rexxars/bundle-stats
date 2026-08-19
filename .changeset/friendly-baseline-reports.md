---
'@rexxars/bundle-stats': patch
---

Treat consumer entries that are absent from the baseline as added scenarios. Their change columns now show `N/A` instead of `None`, and reports no longer show the missing baseline file as a measurement error.

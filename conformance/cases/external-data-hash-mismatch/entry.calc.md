---
title: Conformance — External data hash mismatch
calcdown: 0.7
---

# External data hash mismatch

This case MUST fail: `data.source` is present but the declared `hash` is intentionally wrong.

``` data
name: items
primaryKey: id
columns:
  id: string
  qty: integer
source: data.csv
format: csv
hash: sha256:0000000000000000000000000000000000000000000000000000000000000000
---
```


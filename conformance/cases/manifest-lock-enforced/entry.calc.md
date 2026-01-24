---
title: Conformance — Manifest lock enforcement
calcdown: 0.7
---

# Manifest lock enforcement

This case MUST fail: the manifest declares a lockfile with an intentionally wrong document hash.

``` inputs
x : number = 1
```

``` calc
const y = x + 1;
```

``` view
{
  "id": "summary",
  "library": "calcdown",
  "type": "cards",
  "spec": { "items": [{ "key": "y", "label": "y" }] }
}
```


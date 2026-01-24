---
title: Conformance — YAML view blocks
calcdown: 0.7
---

# YAML view blocks

Engines SHOULD accept YAML view blocks as a convenience, even though JSON is recommended.

``` calc
const total = 42;
```

``` view
- id: summary
  library: calcdown
  type: cards
  spec:
    title: Summary
    items:
      - key: total
        label: Total
```


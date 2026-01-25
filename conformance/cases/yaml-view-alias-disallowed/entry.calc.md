---
calcdown: 0.8
title: YAML aliases disallowed (conformance)
---

# YAML aliases are not allowed

This case ensures view-block YAML anchors/aliases are rejected deterministically.

```view
- &v
  id: one
  library: calcdown
  type: cards
  spec:
    title: One
    items:
      - key: x
- *v
```


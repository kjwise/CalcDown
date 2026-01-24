---
title: Conformance — View unknown source
calcdown: 0.7
---

# View unknown source

This case MUST fail: the view references a non-existent `source`.

``` inputs
x : number = 1
```

``` calc
const y = x + 1;
```

``` view
{
  "id": "bad_table",
  "library": "calcdown",
  "type": "table",
  "source": "missing_table_or_node",
  "spec": { "title": "Bad", "editable": false }
}
```


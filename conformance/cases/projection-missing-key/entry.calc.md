---
title: Conformance — Projection missing key
calcdown: 0.7
---

# Projection missing key

``` data
name: items
primaryKey: id
columns:
  id: string
  qty: integer
  unit_price: number
---
{"id":"a","qty":2,"unit_price":10}
{"id":"b","qty":1}
```

``` calc
const bad = items.unit_price;
```


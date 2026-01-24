---
title: Conformance — Vectorization + Projection
calcdown: 0.7
---

# Vectorization + projection

## Inputs

``` inputs
tax_rate : percent = 20.0
```

## Data

``` data
name: items
primaryKey: id
sortBy: id
columns:
  id: string
  qty: integer
  unit_price: number
---
{"id":"b","qty":1,"unit_price":5}
{"id":"a","qty":2,"unit_price":10}
```

## Calc

``` calc
const qty = items.qty;
const prices = items.unit_price;
const line_total = qty * prices;
const tax = line_total * (tax_rate / 100);
const total = line_total + tax;

const subtotal = std.math.sum(line_total);
const labels = std.text.concat("ID-", items.id);
```

## View

``` view
[
  {
    "id": "summary",
    "type": "cards",
    "spec": { "items": [{ "key": "subtotal" }] }
  }
]
```


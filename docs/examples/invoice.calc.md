---
title: Invoice (CalcDown demo3)
calcdown: 0.7
---

# Invoice

This example demonstrates **tabular input** (a `data` table) and **tabular output** (a computed table node), rendered via standardized `view` objects.

## Inputs

``` inputs
tax_rate : percent = 24.0
```

## Data

``` data
name: items
primaryKey: id
sortBy: name
columns:
  id: string
  name: string
  qty: integer
  unit_price: number
---
{"id":"i1","name":"Coffee beans","qty":2,"unit_price":18.5}
{"id":"i2","name":"Milk","qty":1,"unit_price":2.25}
{"id":"i3","name":"Croissant","qty":3,"unit_price":3.1}
```

## Calc

``` calc
const lines = std.table.map(items, (row) => ({
  id: row.id,
  name: row.name,
  qty: row.qty,
  unit_price: row.unit_price,
  line_total: row.qty * row.unit_price,
}));

const subtotal = std.math.sum(items.qty * items.unit_price);
const tax = subtotal * (tax_rate / 100);
const total = subtotal + tax;
```

## View

``` view
[
  {
    "id": "items",
    "library": "calcdown",
    "source": "items",
    "spec": {
      "columns": [
        {
          "key": "name",
          "label": "Name"
        },
        {
          "format": "integer",
          "key": "qty",
          "label": "Qty"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "unit_price",
          "label": "Unit price"
        }
      ],
      "editable": true,
      "title": "Items (editable)"
    },
    "type": "table"
  },
  {
    "id": "lines",
    "library": "calcdown",
    "source": "lines",
    "spec": {
      "columns": [
        {
          "key": "name",
          "label": "Name"
        },
        {
          "format": "integer",
          "key": "qty",
          "label": "Qty"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "unit_price",
          "label": "Unit price"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "line_total",
          "label": "Total"
        }
      ],
      "title": "Computed lines"
    },
    "type": "table"
  },
  {
    "id": "summary",
    "library": "calcdown",
    "spec": {
      "items": [
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "subtotal",
          "label": "Subtotal"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "tax",
          "label": "Tax"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "total",
          "label": "Total"
        }
      ],
      "title": "Summary"
    },
    "type": "cards"
  },
  {
    "id": "main",
    "library": "calcdown",
    "spec": {
      "direction": "column",
      "items": [
        {
          "ref": "summary"
        },
        {
          "ref": "items"
        },
        {
          "ref": "lines"
        }
      ],
      "title": "Invoice"
    },
    "type": "layout"
  }
]
```

---
title: Invoice (external data table)
calcdown: 0.5
---

# Invoice (external data)

This example is the same as `invoice.calc.md`, but the `items` table is loaded from an external CSV file.

## Inputs

``` inputs
tax_rate : percent = 24.0
```

## Data

``` data
name: items
primaryKey: id
source: ./data/items.csv
format: csv
hash: sha256:88fe3eb07c4a121919e4b28588abf0bde8d97cb45e63c0903d4126dafb797fec
columns:
  id: string
  name: string
  qty: integer
  unit_price: number
---
# External data source: docs/examples/data/items.csv
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

const subtotal = std.table.sum(lines, "line_total");
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
      "editable": false,
      "title": "Items (CSV)"
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
  }
]
```

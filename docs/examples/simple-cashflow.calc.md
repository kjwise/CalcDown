---
title: Simple cashflow (CalcDown example)
calcdown: 0.7
---

# Simple cashflow

This example demonstrates:

- **Tabular input** via a `data` table (`cashflow`)
- **Tabular output** via a computed table node (`schedule`)
- A running balance computed with `std.data.scan`

## Inputs

``` inputs
starting_balance : number = 2500
```

## Data

``` data
name: cashflow
primaryKey: id
sortBy: month
columns:
  id: string
  month: date
  inflow: number
  outflow: number
---
{"id":"m1","inflow":3200,"month":"2024-01-01","outflow":2800}
{"id":"m2","inflow":3200,"month":"2024-02-01","outflow":2950}
{"id":"m3","inflow":3200,"month":"2024-03-01","outflow":3100}
```

## Calc

``` calc
const months = cashflow.length;
const total_inflow = std.table.sum(cashflow, "inflow");
const total_outflow = std.table.sum(cashflow, "outflow");
const net_total = total_inflow - total_outflow;

const schedule = std.data.scan(
  cashflow,
  (state, row) => ({
    id: row.id,
    month: row.month,
    inflow: row.inflow,
    outflow: row.outflow,
    net: row.inflow - row.outflow,
    opening_balance: state.closing_balance,
    closing_balance: state.closing_balance + (row.inflow - row.outflow),
  }),
  { seed: { closing_balance: starting_balance } }
);

const ending_balance = std.data.last(schedule).closing_balance;
```

## View

``` view
[
  {
    "id": "summary",
    "library": "calcdown",
    "spec": {
      "items": [
        {
          "format": "integer",
          "key": "months",
          "label": "Months"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "total_inflow",
          "label": "Total inflow"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "total_outflow",
          "label": "Total outflow"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "net_total",
          "label": "Net total"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "ending_balance",
          "label": "Ending balance"
        }
      ],
      "title": "Summary"
    },
    "type": "cards"
  },
  {
    "id": "cashflow",
    "library": "calcdown",
    "source": "cashflow",
    "spec": {
      "columns": [
        {
          "format": "date",
          "key": "month",
          "label": "Month"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "inflow",
          "label": "Inflow"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "outflow",
          "label": "Outflow"
        }
      ],
      "editable": true,
      "title": "Cashflow (editable)"
    },
    "type": "table"
  },
  {
    "id": "schedule",
    "library": "calcdown",
    "source": "schedule",
    "spec": {
      "columns": [
        {
          "format": "date",
          "key": "month",
          "label": "Month"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "opening_balance",
          "label": "Open"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "inflow",
          "label": "Inflow"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "outflow",
          "label": "Outflow"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "net",
          "label": "Net"
        },
        {
          "format": {
            "digits": 2,
            "kind": "number"
          },
          "key": "closing_balance",
          "label": "Close"
        }
      ],
      "title": "Schedule (computed)"
    },
    "type": "table"
  }
]
```

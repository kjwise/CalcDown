---
title: Savings growth (CalcDown demo2)
calcdown: 0.7
---

# Savings growth

Play with the inputs to see how contributions and return rate affect the outcome.

## Inputs

``` inputs
initial_balance      : number  = 10000
monthly_contribution : number  = 500
annual_return        : percent = 6.0
years                : integer = 20
```

## Logic

``` calc
const months = years * 12;
const rate_mo = std.finance.toMonthlyRate(annual_return);
const monthly_return_percent = rate_mo * 100;

// Month-by-month compound growth with contributions, using scan (no loops in CalcScript).
// State is just the running balance (number).
const balances = std.data.scan(
  std.data.sequence(months),
  (balance) => (balance * (1 + rate_mo)) + monthly_contribution,
  { seed: initial_balance }
);

const final_balance = std.data.last(balances);
const total_contributions = monthly_contribution * months;
const interest_earned = final_balance - initial_balance - total_contributions;
```

## View

``` view
{
  "id": "summary",
  "library": "calcdown",
  "spec": {
    "items": [
      {
        "format": {
          "kind": "integer"
        },
        "key": "months",
        "label": "Months"
      },
      {
        "format": {
          "digits": 3,
          "kind": "percent"
        },
        "key": "monthly_return_percent",
        "label": "Monthly return"
      },
      {
        "format": {
          "digits": 0,
          "kind": "number"
        },
        "key": "final_balance",
        "label": "Final balance"
      },
      {
        "format": {
          "digits": 0,
          "kind": "number"
        },
        "key": "total_contributions",
        "label": "Total contributions"
      },
      {
        "format": {
          "digits": 0,
          "kind": "number"
        },
        "key": "interest_earned",
        "label": "Interest earned"
      }
    ],
    "title": "Summary"
  },
  "type": "cards"
}
```

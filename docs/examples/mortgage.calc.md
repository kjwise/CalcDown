---
title: Simple Mortgage (CalcDown example)
calcdown: 0.2
---

# Mortgage calculator

## Inputs

```inputs
loan_amount   : currency(USD) = 300000
interest_rate : percent       = 5.0
term_years    : integer       = 30
start_date    : date          = 2024-01-01
```

## Logic

```calc
const total_months = term_years * 12;
const rate_mo = std.finance.toMonthlyRate(interest_rate);
const payment = std.finance.pmt(rate_mo, total_months, -loan_amount);

const total_paid = payment * total_months;
const total_interest = total_paid - loan_amount;

// Amortization schedule without loops via scan (running state).
const schedule = std.data.scan(
  std.data.sequence(total_months, { start: 0 }),
  (state, monthIndex) => ({
    date: std.date.addMonths(start_date, monthIndex),
    opening_balance: state.closing_balance,
    interest_pay: state.closing_balance * rate_mo,
    principal_pay: payment - (state.closing_balance * rate_mo),
    closing_balance: state.closing_balance - (payment - (state.closing_balance * rate_mo)),
  }),
  { seed: { closing_balance: loan_amount } }
);
```

Monthly payment: `{{ payment }}`  
Total interest: `{{ total_interest }}`

## View

```view
{
  "id": "paydown",
  "type": "chart",
  "library": "vega-lite",
  "source": "schedule",
  "spec": {
    "title": "Loan paydown",
    "mark": "line",
    "encoding": {
      "x": { "field": "date", "type": "temporal", "title": "Date" },
      "y": { "field": "closing_balance", "type": "quantitative", "title": "Closing balance" }
    }
  }
}
```

---
title: Conformance — data.sortBy
calcdown: 0.7
---

# sortBy runtime ordering

``` data
name: t
primaryKey: id
sortBy: n
columns:
  id: string
  n: integer
---
{"id":"a","n":2}
{"id":"b","n":1}
{"id":"c","n":2}
```

``` calc
const ids = t.id;
```


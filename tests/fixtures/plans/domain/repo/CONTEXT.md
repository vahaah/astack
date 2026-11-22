# Grant desk

The desk reads a merge request and gives a grant.

## Contexts

```domain
context Desk : src/desk/**
context Kernel shared : src/result.ts
cap  Git [spawn] @ src/ports/git.ts: log(read), push(write)
```

## Language

**Grant**:
The right of one actor to merge one pull request.

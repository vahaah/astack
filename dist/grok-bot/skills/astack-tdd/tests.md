# Good and Bad Tests

## Good Tests

Call real interfaces rather than mock internal parts:

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

A useful test has these properties:

- It verifies behavior that users or callers need.
- It uses only the public API.
- It survives internal refactors.
- It describes the result rather than the mechanism.
- It makes one logical assertion.

## Bad Tests

An implementation-detail test depends on internal structure:

```typescript
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Watch for these patterns:

- Internal collaborators are mocked.
- Tests call private methods.
- Assertions require call counts or ordering.
- A refactor breaks a test without a behavior change.
- The test name describes implementation rather than its result.
- Verification bypasses the interface.

Compare direct database verification with verification through the public interface:

```typescript
// BAD: Bypasses interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

A tautological test repeats production logic to calculate its expectation.
That makes agreement inevitable rather than independent evidence:

```typescript
// BAD: Expected value is recomputed the way the code computes it
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: Expected value is an independent, known literal
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```

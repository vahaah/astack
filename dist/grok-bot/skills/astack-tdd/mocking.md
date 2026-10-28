# When to Mock

Mock only at system edges, for these dependencies:

- External APIs, such as payments and email.
- Time and randomness.

Use a real isolated test database and temporary files.
Do not mock the database or file system.

Do not mock your own classes, modules or internal collaborators.
Do not mock anything you control.

## Designing for Mockability

Give system-edge interfaces explicit dependencies that tests can substitute.

1. Pass dependencies into the function instead of constructing them internally:

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

2. Prefer an SDK-style operation for each action to a generic fetcher with conditional logic:

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

The SDK form gives each mock one result shape.
It removes conditional setup logic and makes exercised endpoints clear.
Each endpoint also has its own type safety.

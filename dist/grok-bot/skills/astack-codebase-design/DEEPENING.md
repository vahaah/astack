# Deepening

Deepen a cluster of shallow modules according to its dependencies.
Use Module, Interface, Seam and Adapter as defined in [SKILL.md](SKILL.md).

## Dependency categories

Classify the candidate's dependencies first.
The category sets the test strategy across its seam.

### 1. In-process

Pure computation and in-memory state have no I/O dependency.
These modules can always be deepened.
Merge them and test directly through the new interface.
No adapter is needed.

### 2. Local-substitutable

Run database checks against a real isolated test database.
Use temporary directories and real file operations for filesystem checks.
Deepen the module when its real dependency can run in the local test setup.
Run that dependency in its test suite.
Keep the seam internal rather than expose a port in the external interface.

### 3. Remote but owned (Ports & Adapters)

These are your own services across a network, such as microservices or internal APIs.
Define a port, or interface, at the seam.
The deep module owns the logic.
Inject transport as an adapter.
Tests use an in-memory adapter.
Production uses an HTTP, gRPC or queue adapter.

Recommend a port with production and test adapters.
This keeps logic in one deep module even when deployment spans a network.

### 4. True external (Mock)

These are third-party services that you do not control, such as Stripe or Twilio.
Inject the dependency through a port.
Use a mock adapter in tests.

## Seam discipline

- Require at least two justified adapters before you add a port. Usually they are production and test adapters. One adapter gives a hypothetical seam and adds indirection.
- Keep internal seams private even when tests use them. A module can have internal seams and a separate external seam at its interface.

## Testing strategy: replace, don't layer

- Delete old shallow-module unit tests once tests at the new interface replace their coverage.
- Write new tests at the deepened module's interface.
- Assert observable results through that interface rather than internal state.
- Keep tests stable through internal refactors. If an internal change alone breaks a test, inspect whether it reaches past the interface.

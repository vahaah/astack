# Swift

Swift expresses most of these rules directly.
An enum with associated values is a sum.
A struct is a product, and `switch` is exhaustive.
Use `@unknown default` only for a system enum.
Prefer `let` and structs.

Represent expected failure with `Result<Success, Failure>` or typed `throws(E)`.
Reserve `fatalError` and `precondition` for defects.
Do not use `!`, `as!` or `try!`.
Use inheritance only when UIKit or another framework requires it.
Write laws as Swift Testing parameterized tests with `@Test(arguments:)`.
Follow the repo's Swift style guide, or an available `write-swift` skill.

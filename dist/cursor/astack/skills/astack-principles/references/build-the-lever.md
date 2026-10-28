# Build the Lever

When the work is not trivial, build the tool that does it instead of doing it by hand.

A codemod, generator, or script does the work the same way every time and reruns for free.
A reviewer can read and rerun that artifact to verify the work.
Manual changes require a reviewer to repeat the work to verify it.
A deterministic script turns "trust me" into "run this".

Build the lever by default.
Skip it only for a couple of obvious edits that you can see at a glance.

- Do the first unit by hand to learn the recipe. Then build the tool. Rerun the tool on that unit. Compare its output with your manual version. Make the lever safe to rerun.
- Use a codemod or script for edits. Use a generator for repetitive files. Use a dump-to-sqlite query for analysis. Use a check that you can rerun for verification.
- A deterministic lever takes priority over delegates. If the tool can process every unit in one pass, run it yourself. Do not assign delegates to apply edits by hand that a script can make.
- When you assign work to subagents, write the lever as a skill that each one reads. Put the recipe, verification contract, and scope fences in that artifact. Keep it outside the delegates' write scope so they cannot quietly edit the contract.
- Applying this principle produces a file. If you cite it, the diff must hold a codemod, script, generator, or delegate skill. Otherwise, you did not apply the principle.
- Commit the lever when the work outlives the session.

The decision depends on whether the work is trivial, not whether it repeats.
A single task still needs a lever when the lever makes the work verifiable.
Follow the [Laziness Protocol](laziness-protocol.md).
Build the smallest script that does or proves the job, never a framework.

[Encode Lessons in Structure](encode-lessons-in-structure.md) turns a recurring instruction into a lasting guard.
This principle improves throughput and review of the current work.
See [Prove It Works](prove-it-works.md) for scripts that verify the work.

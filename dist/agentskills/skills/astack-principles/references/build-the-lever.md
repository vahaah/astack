# Build the Lever

When the work is not trivial, build the tool that does it.

A codemod, generator or script does the work the same way each time, and a new run costs nothing.
A reviewer can read that artifact and run it again.
To examine a manual change, a reviewer must do the work again.
A deterministic script changes "trust me" into "run this".

Build the lever by default.
Skip it only for a few obvious edits.

- Do the first unit by hand to learn the recipe. Then build the tool. Compare its output on that unit with your version.
- A deterministic lever comes before delegates. When the tool can process each unit in one pass, run it yourself.
- When you give work to subagents, write the lever as a skill that each one reads. Keep it outside their write scope.

The decision depends on whether the work is trivial, not on whether it repeats.
Build the smallest script that does or proves the job, never a framework.

You skipped this principle when you cite it and the diff holds no codemod, script, generator or delegate skill.

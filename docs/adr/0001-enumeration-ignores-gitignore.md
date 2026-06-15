# Source enumeration does not read .gitignore

The scan stage's candidate-file enumeration identifies generated/excluded files
structurally — a fixed list of directory segments (`node_modules`, `dist`,
`build`, `coverage`, `out`, `__generated__`), dot-directories, test/config/`.d.ts`
patterns, and the user's config `ignore` globs — and deliberately does **not**
consult `.gitignore`, even though most generated output is gitignored and
globby offers `gitignore: true`.

Why: enumeration defines the **scanned set**, which is the population every score
is percentile-ranked against, so it must be deterministic and reproducible from
a fixture tree alone (a hard acceptance criterion). Reading `.gitignore` would
make the result depend on an external file and globby's gitignore-resolution
quirks, making the centerpiece logic non-deterministic and harder to unit-test.
Project-specific generated paths inside the source root are handled explicitly
via the config `ignore` globs (e.g. `src/generated/**`) — the SPEC's intended
escape hatch — rather than inferred.

## Consequences

A project whose build output lives in an unusual in-`src` directory not on the
default segment list won't be auto-excluded; the user must add an `ignore` glob.
We accept this for determinism. Revisiting later (opt-in `--respect-gitignore`)
is possible but would shift the scanned set and therefore every downstream
percentile rank.

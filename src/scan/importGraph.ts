import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cruise } from 'dependency-cruiser';
import type { ICruiseOptions, IFlattenedRuleSet } from 'dependency-cruiser';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';
import type { ImportEdge } from './fanIn.js';

/**
 * I/O layer for the fan-in signal (SPEC §4.1.3): runs dependency-cruiser over
 * the source root and hands a normalized {@link ImportEdge} list to the pure
 * {@link ./fanIn} core — the same pure-core / thin-walker split as
 * {@link ./candidates} ↔ {@link ./enumerateSources}. All graph extraction and
 * module resolution live here; all counting policy lives in the pure core.
 *
 * `tsPreCompilationDeps: true` makes dependency-cruiser surface `import type`
 * edges (tagged `type-only`) instead of erasing them, so the pure core — not an
 * implicit compiler behaviour — owns the runtime-only decision (docs/adr/0003).
 *
 * A project `tsconfig.json`, when present, is wired in so path aliases (`@/x`)
 * resolve; otherwise their edges would be `couldNotResolve` and silently
 * undercount fan-in. Via the programmatic API this takes BOTH halves: the
 * resolver only reads the config path from `ruleSet.options.tsConfig.fileName`
 * (see dependency-cruiser's resolve-options/normalize), and the parsed config
 * must be handed in as the transpile arg so the correct `baseUrl` reaches the
 * tsconfig-paths plugin (without it, baseUrl defaults to `./` and aliases break).
 * Unresolved/core edges are dropped (the deferred `couldNotResolve` warning
 * would live here).
 */

/** dependency-cruiser reports baseDir-relative, POSIX-ish paths; normalize
 *  separators defensively so keys match the scanned set on every platform. */
const toPosix = (p: string): string => p.split('\\').join('/');

export async function buildImportGraph(
  projectRoot: string,
  sourceRoot: string,
): Promise<ImportEdge[]> {
  const tsConfigPath = join(projectRoot, 'tsconfig.json');
  const hasTsConfig = existsSync(tsConfigPath);

  const options: ICruiseOptions = {
    baseDir: projectRoot,
    // Resolve node_modules so edges into them are classified, but don't crawl in.
    doNotFollow: { path: 'node_modules' },
    // Surface type-only edges so the pure core can apply the runtime-only rule.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
  };

  if (hasTsConfig) {
    // The API's resolver reads the tsconfig path from `ruleSet.options.tsConfig`
    // (see resolve-options/normalize), a field the public IFlattenedRuleSet type
    // doesn't model — hence the cast. A top-level `tsConfig` is ignored here.
    options.ruleSet = {
      options: { tsConfig: { fileName: tsConfigPath } },
    } as unknown as IFlattenedRuleSet;
  }

  const result = await cruise(
    [sourceRoot],
    options,
    undefined,
    // Parsed tsconfig for the transpiler + correct baseUrl for alias resolution.
    hasTsConfig ? { tsConfig: extractTSConfig(tsConfigPath) } : undefined,
  );

  // With no `outputType` the API returns the result object, never a string;
  // the guard keeps TypeScript honest about the union.
  const output = result.output;
  if (typeof output === 'string') return [];

  const edges: ImportEdge[] = [];
  for (const mod of output.modules) {
    const from = toPosix(mod.source);
    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve || dep.coreModule) continue;
      edges.push({ from, to: toPosix(dep.resolved), dependencyTypes: dep.dependencyTypes });
    }
  }
  return edges;
}

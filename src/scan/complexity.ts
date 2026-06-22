import { Project, SyntaxKind, ts, type Node } from 'ts-morph';

/**
 * PURE cyclomatic-complexity core for the scan stage (SPEC §6/§8, §12). No fs,
 * git, or network: the input is source TEXT (the I/O layer reads files and calls
 * here), so every rule is unit-testable with plain string fixtures — mirroring
 * the {@link ./candidates} predicate that backs {@link ./enumerateSources}.
 *
 * Metric (see docs/adr/0002-cyclomatic-complexity-definition.md):
 *   complexity = 1 (file baseline)
 *              + 1 per decision point anywhere in the file (incl. module scope)
 *              + 1 per function unit (its own baseline)
 *
 * Decision points are the ESLint `complexity` rule's set; optional chaining
 * (`?.`) is deliberately NOT one (null-safety idiom, not branching logic). JSX
 * conditional rendering needs no special rule: `{c && …}` and `{c ? … : …}` are
 * already a logical operator and a ternary, and the AST walk descends into JSX
 * expression containers like any other node.
 */

/** Statement/clause kinds that each add one branch. `else if` is a nested
 *  `IfStatement`, so counting `IfStatement` handles chains for free; a plain
 *  `else` is no node and stays free. `DefaultClause` is intentionally absent. */
const DECISION_KINDS = new Set<SyntaxKind>([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression, // ternary ?:
]);

/** Function units that each earn a baseline of 1. A React component is just a
 *  function, so it needs no special case. */
const FUNCTION_KINDS = new Set<SyntaxKind>([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.Constructor,
]);

/** Logical operators that each add one branch when they head a BinaryExpression.
 *  Relational/equality operators (`>`, `===`, …) are not decisions. */
const LOGICAL_TOKENS = new Set<SyntaxKind>([
  SyntaxKind.AmpersandAmpersandToken, // &&
  SyntaxKind.BarBarToken, // ||
  SyntaxKind.QuestionQuestionToken, // ??
]);

/**
 * One in-memory project, reused across calls. Each file is parsed in isolation
 * (no tsconfig, no type-checker, no lib files, no cross-file resolution), so the
 * result is a pure function of the source text. `jsx: Preserve` + a `.tsx` path
 * let the parser accept JSX without needing emit configuration.
 */
const project = new Project({
  useInMemoryFileSystem: true,
  skipLoadingLibFiles: true,
  skipFileDependencyResolution: true,
  compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true },
});

/**
 * Cyclomatic complexity of one source file's text. `filePath` only steers the
 * parser's script kind (`.tsx` → JSX), so the same text scores identically
 * regardless of where it lives on disk.
 */
export function computeComplexity(sourceText: string, filePath: string): number {
  const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
  try {
    let total = 1; // file baseline
    sourceFile.forEachDescendant((node: Node) => {
      const kind = node.getKind();
      if (DECISION_KINDS.has(kind) || FUNCTION_KINDS.has(kind)) {
        total += 1;
      } else if (kind === SyntaxKind.BinaryExpression) {
        const op = node.asKindOrThrow(SyntaxKind.BinaryExpression).getOperatorToken().getKind();
        if (LOGICAL_TOKENS.has(op)) total += 1;
      }
    });
    return total;
  } finally {
    // Keep the shared project from accumulating every scanned file in memory.
    project.removeSourceFile(sourceFile);
  }
}

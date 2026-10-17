import {
  type ModuleExportName,
  type Node,
  type Program,
  parseSync,
  visitorKeys,
} from 'oxc-parser';

/** Parses TS (or TSX when the file name ends in `x`) and fails on syntax errors. */
export function parseTypeScriptModule(
  sourceText: string,
  fileName: string,
): Program {
  const { program, errors } = parseSync(fileName, sourceText, {
    lang: fileName.endsWith('x') ? 'tsx' : 'ts',
    sourceType: 'module',
  });
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${fileName}: ${errors.map((error) => error.message).join('; ')}`,
    );
  }
  return program;
}

/**
 * Depth-first walk. `visit` receives the node and its ancestors (nearest last);
 * returning `false` skips the node's children.
 */
export function walkAst(
  node: Node,
  visit: (node: Node, ancestors: readonly Node[]) => boolean | void,
  ancestors: Node[] = [],
): void {
  if (visit(node, ancestors) === false) {
    return;
  }
  ancestors.push(node);
  for (const key of visitorKeys[node.type] ?? []) {
    const value: unknown = Reflect.get(node, key);
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        walkAst(child, visit, ancestors);
      }
    }
  }
  ancestors.pop();
}

/** The name as written: identifier text, or the value of a string-literal name. */
export function moduleExportNameText(name: ModuleExportName): string {
  return name.type === 'Literal' ? name.value : name.name;
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'type') === 'string'
  );
}

import { resolve as resolvePath } from 'node:path';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve(
      pathToFileURL(resolvePath(process.cwd(), 'tests/next-server-mock.mjs')).href,
      context,
    );
  }

  if (specifier.startsWith('@/')) {
    const candidate = pathToFileURL(
      resolvePath(process.cwd(), `${specifier.slice(2)}.ts`),
    ).href;
    return nextResolve(candidate, context);
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !extname(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Let Node report the original resolution error when no TS sibling exists.
    }
  }

  return nextResolve(specifier, context);
}

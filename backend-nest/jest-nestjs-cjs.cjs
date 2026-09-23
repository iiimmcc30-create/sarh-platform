const ts = require('typescript');

/**
 * Nest 12 ships ESM-only packages (`import.meta`, `import`/`export`).
 * Jest 30 + ts-jest still run in CJS, so we downlevel those files.
 */
module.exports = {
  process(sourceText, sourcePath) {
    const rewritten = String(sourceText)
      .replaceAll('createRequire(import.meta.url)', 'require')
      .replace(/const require\s*=\s*require\s*;/g, '')
      .replaceAll('import.meta.url', '__filename');
    const { outputText } = ts.transpileModule(rewritten, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        allowJs: true,
      },
      fileName: sourcePath,
    });
    const code = outputText.replace(/^\s*const require = [^;]+;/m, '');
    return { code };
  },
};

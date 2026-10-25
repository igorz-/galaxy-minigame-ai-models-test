import { build, context, transform } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  outfile: 'game.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  banner: { js: '// Generated from src/ by npm run bundle. Commit this file for no-build hosting.' },
  logLevel: 'info',
};

if (process.argv.includes('--dev')) {
  // Rebuild the classic script when any imported source module changes.
  const bundler = await context(options);
  await bundler.rebuild();
  await bundler.watch();
  const { createServer } = await import('vite');
  const server = await createServer({ root, server: { host: '0.0.0.0' } });
  await server.listen();
  server.printUrls();
  const stop = async () => {
    await Promise.all([bundler.dispose(), server.close()]);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  await build(options);
  if (process.argv.includes('--dist')) {
    const destination = join(root, 'dist');
    await rm(destination, { recursive: true, force: true });
    for (const file of ['index.html', 'src/style.css', 'src/favicon.svg']) {
      const output = join(destination, file);
      await mkdir(dirname(output), { recursive: true });
      await copyFile(join(root, file), output);
    }
    await build({ ...options, outfile: join(destination, 'game.js'), minify: true });
    const css = await transform(await readFile(join(root, 'src/style.css'), 'utf8'), { loader: 'css', minify: true });
    await writeFile(join(destination, 'src/style.css'), css.code);
    await writeFile(join(destination, '.nojekyll'), '');
    console.log('Static release written to dist/ (also opens directly from disk).');
  }
}

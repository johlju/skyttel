// Include production build and runtime configuration, excluding devcontainer inputs.
export const productionInputs = [
  'src/**',
  'migrations/**',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  '.dockerignore',
  'compose.yaml',
  '.npmrc',
  '.node-version',
  'scripts/install-repository-npm.mjs',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'index.html',
];

export function isProductionInput(path) {
  return productionInputs.some((input) =>
    input.endsWith('/**') ? path.startsWith(input.slice(0, -2)) : path === input,
  );
}

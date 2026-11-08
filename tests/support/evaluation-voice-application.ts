import { execFileSync } from 'node:child_process';
import { mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Real committed application whose public voice poll identifies the selected
 * server. No voice/browser/provider implementation is replaced. */
export async function evaluationVoiceApplication(id: string) {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-voice-application-'));
  try {
    const archive = execFileSync(
      'git',
      [
        'archive',
        'HEAD',
        '.gitignore',
        'package.json',
        'src',
        'migrations',
        'scripts/seeds',
        'tests/support',
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    execFileSync('tar', ['-x', '-C', directory], { input: archive });
    await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    await rename(
      join(directory, 'src/server/app.ts'),
      join(directory, 'src/server/evaluation-original-app.ts'),
    );
    await writeFile(
      join(directory, 'src/server/app.ts'),
      `
import { createApp as original } from './evaluation-original-app.js';
export function createApp(options: Parameters<typeof original>[0]) {
  const app = original(options);
  const fetch = app.fetch.bind(app);
  app.fetch = (async (request: Request) => {
    const response = await fetch(request);
    if (request.method === 'POST' && /\\/voice\\/[^/]+\\/poll$/.test(new URL(request.url).pathname)) {
      const body = await response.clone().json();
      if (body.assistant) {
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        return Response.json({ ...body, assistant: { ...body.assistant,
          modelReply: ${JSON.stringify(id)} + ' ' + (body.assistant.modelReply ?? body.assistant.reply ?? '')
        } }, { status: response.status, headers });
      }
    }
    return response;
  }) as typeof app.fetch;
  return app;
}
`,
    );
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Evaluation',
      '-c',
      'user.email=evaluation@example.test',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-qm',
      'Controlled voice application',
    );
    return { id, directory, commit: git('rev-parse', 'HEAD') };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

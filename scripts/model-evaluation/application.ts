import { execFileSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { approvedForVisit } from '../../tests/support/conversation.js';
import { createInstallation } from '../../tests/support/installation.js';

export type ApplicationVersion = {
  id: string;
  directory: string;
  commit: string;
  conversationWorkMode?: 'sequential' | 'overlap';
};
export const validApplicationIdentity = ({
  id,
  commit,
  conversationWorkMode,
}: ApplicationVersion) =>
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id) &&
  /^[a-f0-9]{40}$/.test(commit) &&
  (conversationWorkMode === undefined || ['sequential', 'overlap'].includes(conversationWorkMode));
const loadedApplications = new Map<string, string>();
const evaluatorDirectory = fileURLToPath(new URL('../../', import.meta.url));
const loadedEvaluator = (() => {
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', evaluatorDirectory, ...args], { encoding: 'utf8' }).trim();
    return {
      commit: git('rev-parse', 'HEAD'),
      clean: !git('status', '--porcelain=v1', '--untracked-files=normal'),
    };
  } catch {
    return undefined;
  }
})();

/** Identify the evaluator actually loaded by this process, never a supplied
 * checkout with an unrelated clean commit. */
export async function evaluatorVersion(commit: string) {
  if (!loadedEvaluator?.clean || loadedEvaluator.commit !== commit)
    throw new Error('evaluation_application_unverified:evaluator');
  await verifiedDirectory({ id: 'evaluator', directory: evaluatorDirectory, commit });
  return { commit, contract: 'committed-evaluator-v1' };
}

async function verifiedDirectory(selected: ApplicationVersion) {
  if (!validApplicationIdentity(selected))
    throw new Error('evaluation_application_version_invalid');
  try {
    const directory = await realpath(selected.directory);
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
    if ((await realpath(git('rev-parse', '--show-toplevel'))) !== directory)
      throw new Error('not_worktree_root');
    if (git('rev-parse', 'HEAD') !== selected.commit) throw new Error('commit_mismatch');
    if (git('status', '--porcelain=v1', '--untracked-files=normal')) throw new Error('dirty');
    // Ignored build outputs are allowed, but ignored source cannot silently
    // become executable code absent from the recorded commit.
    if (git('ls-files', '--others', '--', 'src', 'migrations', 'scripts', 'tests/support'))
      throw new Error('untracked_application_source');
    return directory;
  } catch {
    throw new Error(`evaluation_application_unverified:${selected.id}`);
  }
}

/** Load the selected committed application, while the common evaluator owns
 * scenarios, synthetic start data and provider/judge configuration. */
export async function applicationAdapter(selected?: ApplicationVersion) {
  if (!selected)
    return {
      version: undefined,
      approval: approvedForVisit,
      create: (options: Parameters<typeof createInstallation>[1]) =>
        createInstallation(undefined, options),
    };
  const directory = await verifiedDirectory(selected);
  const loadedCommit = loadedApplications.get(directory);
  if (loadedCommit && loadedCommit !== selected.commit)
    throw new Error(`evaluation_application_path_reused:${selected.id}`);
  loadedApplications.set(directory, selected.commit);
  const implementation = await import(
    /* @vite-ignore */ pathToFileURL(join(directory, 'tests/support/installation.ts')).href
  );
  const consent = await import(
    /* @vite-ignore */ pathToFileURL(join(directory, 'src/shared/conversation-consent.ts')).href
  );
  if (
    typeof implementation.createInstallation !== 'function' ||
    !Number.isSafeInteger(consent.conversationConsentTextVersion) ||
    consent.conversationConsentTextVersion <= 0
  )
    throw new Error(`evaluation_application_incompatible:${selected.id}`);
  if (
    selected.conversationWorkMode === 'overlap' &&
    !implementation.supportedConversationWorkModes?.includes('overlap')
  )
    throw new Error(`evaluation_application_incompatible:${selected.id}`);
  const create = implementation.createInstallation as typeof createInstallation;
  return {
    version: { ...selected, directory },
    approval: { consent: { textVersion: consent.conversationConsentTextVersion as number } },
    create: (options: Parameters<typeof createInstallation>[1]) =>
      create(undefined, {
        ...options,
        conversationWorkMode: selected.conversationWorkMode ?? 'sequential',
        migrationsDirectory: join(directory, 'migrations'),
      }),
  };
}

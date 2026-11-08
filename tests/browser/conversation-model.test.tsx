import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ConversationModel } from '../../src/client/ConversationModel.js';
import {
  ConversationNoticeAnnouncements,
  ConversationNoticeCard,
  useConversationNotice,
} from '../../src/client/ConversationNotice.js';
import type { ConversationModelChoice } from '../../src/shared/conversation-model.js';
import { supportedConversationChoices } from '../../src/shared/conversation-model.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import '../../src/client/styles.css';

const initial: TextAssistantView = {
  id: 'model-choice',
  revision: 0,
  phase: 'ready',
  operations: [],
  modelChoice: { model: 'gpt-6.1-terra', effort: 'high' },
  enabledModelChoices: [...supportedConversationChoices],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
    readyToSave: false,
  },
};

afterEach(cleanup);

test.each([
  { saved: true, expected: 'Valet är sparat. Det gäller när nästa begäran börjar behandlas.' },
  { saved: false, expected: 'Valet kunde inte sparas. Försök igen.' },
])(
  'announces a delayed model save after closing its dialog (saved=$saved)',
  { tags: ['technical'] },
  async ({ saved, expected }) => {
    let complete!: (saved: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      complete = resolve;
    });
    render(
      <ConversationModel conversation={{ session: initial, configureModel: () => pending }} />,
    );
    await page.getByRole('button', { name: /^Modell och resonemang:/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Resonemangsnivå', exact: true });
    await dialog.getByRole('button', { name: 'Låg', exact: true }).click();
    await expect
      .element(dialog.getByRole('button', { name: 'Låg', exact: true }))
      .toHaveAttribute('aria-disabled', 'true');
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
    complete(saved);
    await expect.element(page.getByRole('status')).toHaveTextContent(expected);
    await expect
      .element(page.getByRole('button', { name: /^Modell och resonemang:/ }))
      .toHaveFocus();
  },
);

test('Escape closes the model dialog without reaching conversation shortcuts', {
  tags: ['technical'],
}, async () => {
  let shortcuts = 0;
  render(
    <section
      aria-label="Samtalsarbete"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          shortcuts++;
          event.preventDefault();
        }
      }}
    >
      <ConversationModel conversation={{ session: initial, configureModel: async () => true }} />
    </section>,
  );
  const opener = page.getByRole('button', { name: /^Modell och resonemang:/ });
  await opener.click();
  await userEvent.keyboard('{Escape}');
  await expect.element(page.getByRole('dialog'), { timeout: 1000 }).not.toBeInTheDocument();
  await expect.element(opener).toHaveFocus();
  expect(shortcuts).toBe(0);
});

test.each([
  ['assistant_model_access', 'Installationens konto saknar åtkomst. Välj en annan modell.'],
  ['assistant_model_unsupported', 'Modellen och nivån stöds inte. Välj ett aktiverat alternativ.'],
  [
    'assistant_model_temporary',
    'Modellen är tillfälligt otillgänglig. Försök igen genom en egen handling.',
  ],
])(
  'a summary notice displays and announces %s distinctly',
  { tags: ['technical'] },
  async (code, message) => {
    function Failure() {
      const state = useConversationNotice({
        conditions: { contextFull: true },
        ongoing: true,
        requested: 0,
        eventKey: 'summary-failure',
        contextSummaryFailure: { code, message },
      });
      return (
        <>
          {state.notice && (
            <ConversationNoticeCard
              notice={state.notice}
              closable={false}
              onDismiss={() => {}}
              focusAfterRemoval={() => null}
            />
          )}
          <ConversationNoticeAnnouncements announcement={state.announcement} />
        </>
      );
    }
    render(<Failure />);
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await expect
      .element(
        notice.getByText(
          `Skyttel kunde inte sammanfatta samtalet. ${message} Samtalstexten och utkastet ligger kvar. Ett nytt samtal tömmer samtalstexten och kontexten och använder ditt senaste personliga modellval. Det löser inte modellfelet och ändrar inte kontots åtkomst.`,
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect.element(notice).not.toMatchTextContent('Kontexten är full');
    await expect
      .element(notice.getByRole('button', { name: 'Nytt samtal', exact: true }))
      .toBeVisible();
    await expect
      .poll(() => document.querySelector('[aria-live="assertive"]')?.textContent)
      .toContain(message);
  },
);

test('an available choice can reach an enabled pair with no enabled intermediate', {
  tags: ['technical'],
}, async () => {
  function Choices() {
    const [choice, setChoice] = useState<ConversationModelChoice>({
      model: 'gpt-6.1-terra',
      effort: 'high',
    });
    return (
      <ConversationModel
        conversation={{
          session: {
            ...initial,
            modelChoice: choice,
            enabledModelChoices: [
              { model: 'gpt-6.1-terra', effort: 'high' },
              { model: 'gpt-6.1-sol', effort: 'low' },
            ],
          },
          configureModel: async (next) => {
            setChoice(next);
            return true;
          },
        }}
      />
    );
  }
  render(<Choices />);
  await page.getByRole('button', { name: /^Modell och resonemang:/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'GPT-6.1 Terra', exact: true })
    .click();
  const alternative = page.getByRole('button', { name: 'Välj GPT-6.1 Sol, Låg', exact: true });
  await expect.element(alternative, { timeout: 1000 }).toBeVisible();
  await alternative.click();
  await expect.element(page.getByRole('radio', { name: 'GPT-6.1 Sol', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Välj GPT-6.1 Terra, Hög', exact: true }).click();
  await expect
    .element(page.getByRole('radio', { name: 'GPT-6.1 Terra', exact: true }))
    .toBeChecked();
});

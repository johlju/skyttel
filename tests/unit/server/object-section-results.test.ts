import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelTool, textModel } from '../../support/text-model.js';

test.each(['draft', 'latest_save'])(
  'the public assistant explains %s section names, order and hidden placement',
  async (source) => {
    const model = textModel(() => [modelTool('report_result', { source })]);
    const app = await createInstallation(undefined, { modelFetch: model.provider });
    const browser = await request.newContext();
    try {
      await signIn(browser, app.origin);
      const { household } = await (await createHousehold(browser, app.origin)).json();
      const path = `${app.origin}/api/households/${household.id}`;
      const post = async (route: string, data: unknown) => {
        const response = await browser.post(`${path}/${route}`, {
          headers: { origin: app.origin },
          data,
        });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
      };
      const fields = [
        { id: 'note', name: 'Anteckning', description: '', kind: 'text', sectionId: 'facts' },
        { id: 'power', name: 'Effekt', description: '', kind: 'number', sectionId: 'facts' },
      ];
      const definition = {
        name: 'Solkraft',
        description: '',
        sections: [
          { id: 'facts', name: 'Uppgifter' },
          { id: 'service', name: 'Service' },
        ],
        fields,
        builtins: [{ key: 'debt', name: 'Skuld', sectionId: 'facts' }],
        propertyOrder: ['field:note', 'builtin:debt', 'field:power'],
      };
      await post('map/object-type', {
        version: 0,
        id: 'solar',
        baseRevision: null,
        value: definition,
      });
      await post('map/save', { version: 1, operationId: 'initial' });
      await post('map/object-type', {
        version: 2,
        id: 'solar',
        baseRevision: 1,
        value: {
          ...definition,
          builtins: [{ key: 'debt', name: 'Återstående skuld', sectionId: '' }],
          propertyOrder: ['builtin:debt', 'field:power', 'field:note'],
          sections: [
            { id: 'service', name: 'Underhåll' },
            { id: 'facts', name: 'Fakta' },
          ],
          fields: [
            { ...fields[1], sectionId: 'service' },
            { ...fields[0], sectionId: '' },
          ],
        },
      });
      if (source === 'latest_save')
        await post('map/save', { version: 3, operationId: 'presentation' });
      const session = await post('text-assistant', approvedForVisit);
      let view = await post(`text-assistant/${session.id}/messages`, {
        revision: session.revision,
        requestId: crypto.randomUUID(),
        text: 'Beskriv typändringen.',
        draftVersion: session.review.version,
        contentVersion: session.review.contentVersion,
      });
      await expect
        .poll(async () => {
          view = await (await browser.get(`${path}/text-assistant/${session.id}`)).json();
          return view.phase;
        })
        .toBe('ready');
      expect(view.reply).toContain('Avsnitt: Uppgifter → Fakta');
      expect(view.reply).toContain('Avsnitt: Service → Underhåll');
      expect(view.reply).toContain('Avsnittens ordning: Uppgifter, Service → Underhåll, Fakta');
      expect(view.reply).toContain('Placering av Anteckning: Uppgifter → Dold, behåll värden');
      expect(view.reply).toContain('Placering av Effekt: Uppgifter → Underhåll');
      expect(view.reply).toContain('Fältordning: Anteckning, Effekt → Effekt, Anteckning');
      expect(view.reply).toContain(
        'Placering av gemensam egenskap Senast uppgiven skuld: Skuld · Uppgifter → Återstående skuld · Dold, behåll värden',
      );
      expect(view.reply).toContain(
        'Egenskapernas ordning: Anteckning, Skuld, Effekt → Återstående skuld, Effekt, Anteckning',
      );
      expect(view.receipt).toBeUndefined();
    } finally {
      await browser.dispose();
      await app.close();
    }
  },
);

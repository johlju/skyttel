import { signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('KAK-35: the installation operator publishes a policy contact and the public policy shows it', async ({
  page,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await signIn(page.request, origin);
    await page.goto(`${origin}/costs`);
    await page.getByRole('link', { name: 'Policykontakt', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Policykontakt saknas.');
    await page
      .getByRole('textbox', { name: 'Kontaktadress för kakpolicyn', exact: true })
      .fill('privacy@example.test');
    await page.getByRole('button', { name: 'Spara policykontakt', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Policykontakten är sparad.');
    await page.goto(`${origin}/cookies`);
    await expect(
      page.getByRole('link', { name: 'privacy@example.test', exact: true }),
    ).toHaveAttribute('href', 'mailto:privacy@example.test');
  } finally {
    await installation.close();
  }
});

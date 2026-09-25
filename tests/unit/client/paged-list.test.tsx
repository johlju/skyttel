import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { PagedList } from '../../../src/client/PagedList.js';

afterEach(cleanup);
const items = Array.from({ length: 121 }, (_, index) => ({
  id: `object-${index}`,
  name: `Objekt ${index}`,
}));
const renderItem = (item: (typeof items)[number]) => (
  <li key={item.id}>
    <button type="button">{item.name}</button>
  </li>
);

test('list navigation reaches every page and returns to selected content without replacing it', async () => {
  const user = userEvent.setup();
  const view = render(
    <PagedList label="Objekt" items={items} selectedId="object-120" renderItem={renderItem} />,
  );
  const list = screen.getByRole('list', { name: 'Objekt' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(50);
  expect(
    (screen.getByRole('button', { name: 'Föregående sida' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Nästa sida' }));
  expect(within(list).getByRole('button', { name: 'Objekt 50' })).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Föregående sida' }));
  expect(within(list).getByRole('button', { name: 'Objekt 0' })).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Visa valt innehåll i listan' }));
  expect(within(list).getByRole('button', { name: 'Objekt 120' })).toBeDefined();
  expect((screen.getByRole('button', { name: 'Nästa sida' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Visa valt innehåll i listan' })).toBeNull();
  await user.selectOptions(screen.getByLabelText('Sida för objekt'), '2');
  expect(within(list).getByRole('button', { name: 'Objekt 50' })).toBeDefined();
  view.rerender(<PagedList label="Objekt" items={items.slice(0, 12)} renderItem={renderItem} />);
  expect(within(list).getAllByRole('listitem')).toHaveLength(12);
  expect(screen.queryByRole('navigation')).toBeNull();
  view.rerender(<PagedList label="Objekt" items={[]} renderItem={renderItem} />);
  expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
});

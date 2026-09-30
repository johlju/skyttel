import { expect, type Locator } from '@playwright/test';

export async function expectContentOwnerReview(owners: Locator, identity: string, member: string) {
  const review = owners.getByLabel('Vald innehållskoppling', { exact: true });
  await expect(review).toBeVisible();
  const values = review.getByRole('definition');
  await expect(values).toHaveText([identity, member]);
  for (const value of await values.all()) {
    await value.scrollIntoViewIfNeeded();
    expect(
      await value.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = [...range.getClientRects()];
        return (
          lines.length > 0 &&
          lines.every(
            (line) =>
              line.left >= Math.max(0, box.left) &&
              line.right <= Math.min(innerWidth, box.right) &&
              line.top >= Math.max(0, box.top) &&
              line.bottom <= Math.min(innerHeight, box.bottom) &&
              element.contains(
                document.elementFromPoint(line.x + line.width / 2, line.y + line.height / 2),
              ),
          )
        );
      }),
    ).toBe(true);
  }
}

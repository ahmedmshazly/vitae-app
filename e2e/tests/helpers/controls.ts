import { expect, type Page } from '@playwright/test';

/**
 * The app's Select is a Radix listbox, not a native `<select>`, so
 * `selectOption` has nothing to act on: the trigger is a button and the
 * options only exist once it is open. Open it, pick by the option's visible
 * word, and wait for the trigger to say it.
 */
export async function chooseOption(page: Page, label: string | RegExp, option: string | RegExp) {
  const trigger = page.getByRole('combobox', { name: label });
  await trigger.click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
  await expect(trigger).toContainText(option);
}

/** What the trigger currently reads, which is where a Radix select keeps the
 * value a native one would put in `value`. */
export async function chosenOption(page: Page, label: string | RegExp): Promise<string> {
  return (await page.getByRole('combobox', { name: label }).innerText()).trim();
}

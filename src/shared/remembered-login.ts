/** Frozen information and flow for this information version. A new purpose
 * requires a new active choice; the storage structure has its own version. */
export const rememberedLoginInformation = {
  version: 1,
  purpose: 'browser-login',
  label: 'Kom ihåg mig',
  text: 'Behåll inloggningen i den här webbläsaren i högst sju dygn. Välj bara detta på en egen enhet. Inloggningen förlängs inte automatiskt. Logga ut på en delad dator.',
  flow: 'Valet börjar avmarkerat vid varje ny inloggning och görs innan du fortsätter till Google eller Microsoft.',
} as const;

export const loginConfirmationFailure =
  'Inloggningen kunde inte bekräftas. Försök logga in igen. Kontrollera att webbläsaren tillåter kakor för Skyttel om problemet kvarstår.';

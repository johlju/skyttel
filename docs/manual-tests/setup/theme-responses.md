# Kontrollerade temasvar

Använd bara en separat provinstallation och påhittade konton enligt
[testguidens enhetsförberedelse](../../development/testing.md#physical-device-manual-preparation).
Öppna Skyttel och logga in innan kontrollen installeras. Kontrollera att
ett vanligt temabyte fungerar. Inga modell- eller röstanrop behövs.

Klistra in följande i webbläsarens utvecklarkonsol i den flik som provas.
Kontrollen ersätter bara leveransen av temasvar i denna flik. Den ändrar
inte serverns autentisering eller databas. Ladda om efter varje fall för
att ta bort kontrollen.

```js
const originalThemeFetch = window.fetch.bind(window);
window.themeRule = null;
window.themeRelease = () => {};
window.fetch = async (...args) => {
  const [input, options] = args;
  const path = new URL(String(input), location.href).pathname;
  const method = options?.method ?? 'GET';
  const rule = window.themeRule;
  if (path !== '/api/theme-preference' || rule?.method !== method)
    return originalThemeFetch(...args);
  window.themeRule = null;
  if (rule.action === 'reject')
    return Response.json({ error: 'forbidden' }, { status: 403 });
  const response = await originalThemeFetch(...args);
  console.info('Temasvaret har mottagits:', response.status);
  if (rule.action === 'lose') throw new TypeError('Kontrollerat förlorat svar');
  await new Promise((resolve) => { window.themeRelease = resolve; });
  return response;
};
```

Aktivera exakt en kommande leverans med ett av följande kommandon:

```js
window.themeRule = { method: 'POST', action: 'reject' };
window.themeRule = { method: 'POST', action: 'lose' };
window.themeRule = { method: 'GET', action: 'hold' };
window.themeRule = { method: 'POST', action: 'hold' };
```

Kör bara det kommando som fallet anger. `reject` ger kontrollerad
avvisning före servern. `lose` förlorar svaret efter verkligt serversvar.
`hold` håller ett verkligt svar tills provledaren kör
`window.themeRelease()`. Vänta på konsolens status 200 innan utloggning
eller kontobyte i fallen med sena svar. Kontrollen skriver aldrig ut
autentiseringsuppgifter eller svarets innehåll.

För kontobyte: använd en annan flik i samma webbläsarprofil för den nya
inloggningen, så att den första flikens dokument och hållna svar finns
kvar. Återvänd till första fliken och invänta att den nya användarens namn
visas innan svaret släpps. Töm provinstallationens webbplatsdata och
avsluta provinstallationens vanliga process efter avslutad granskning.

# Manuella testfall för textvyn

Fallen provar **Skriv till Skyttel**: textvyn öppnas och stängs utan att
samtalet avslutas, samtalstexten visar vem som skriver, raden
**Skyttel arbetar…** står sist och **Nytt samtal** tömmer samtalet men
behåller utkast, mikrofon och oskickad text. De provar också textvyn på
mobil enhet och smal skärm. Den slutliga utformningen på mobil enhet har
egna testfall senare.
Anteckna commit, webbläsare, enhet och godkänt eller underkänt resultat
vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Textprov och
  loggar in med Google i den kontrollerade installationen.

## Allmän förberedelse

1. Starta den
   [kontrollerade installationen för text](text-assistant.md#controlled-text-fixture).
   Den håller varje modellsvar tills du släpper det i terminalen.
2. Skapa hushållet Textprov. Skapa **Lo Exempel** av typen **Person** med
   beskrivningen **Påhittad uppgift** genom Lista och välj
   **Lägg i mitt utkast**. Lämna förslaget osparat.
3. Ladda om sidan före varje fall, så att inget medgivande gäller för
   besöket. Behåll hushållet och förslaget mellan fallen.

## Textvyn

### TEXTVY-01: Skriv till Skyttel öppnar och stänger textvyn utan att avsluta samtalet

**Syfte:** Öppna och stänga textvyn med samma knapp, utan att samtalet,
mikrofonen eller den oskickade texten går förlorade.

**Användare:** Alex.

**Förutsättningar:** Ett datorfönster bredare än 700 px. Inget
medgivande gäller.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-01: Skriv till Skyttel öppnar och stänger textvyn utan att
avsluta samtalet”.

**Steg:**

1. Välj **Skriv till Skyttel** i **Kartans verktyg**. Välj
   **Godkänn och starta** i medgivanderutan.
2. Läs textvyn: rubriken **Skriv till Skyttel** med **Nytt samtal** och
   stängknappen **Stäng textvyn**, samtalstexten och meddelandefältet.
3. Skriv **Oskickat** i fältet utan att skicka. Välj **Stäng textvyn**.
4. Välj **Skriv till Skyttel** två gånger.
5. Gå med Tab från sidans början till snabblänken
   **Till samtalet med Skyttel** och välj den med Enter.

**Förväntat resultat:**

- Textvyn är ett sidofält vid högerkanten, 400 px brett. Kartan knuffas
  undan och syns bredvid. Uppe till höger är en rad fri ovanför textvyn.
- Meddelandefältet **Meddelande till Skyttel** har fokus när textvyn
  öppnas och platshållaren **Berätta vad du vill göra…**.
- Textvyn har inga **Samtalskontroller**, **Öppna samtalet**,
  **Tala eller skriv**, **Fortsätt skriva** eller **Avsluta samtalet**,
  och inget förbehåll om att samtalstexten kan innehålla fel.
- **Stäng textvyn** ger fokus till **Skriv till Skyttel**. Kartan får hela
  bredden igen. Samtalet fortsätter, och **Oskickat** står kvar när
  textvyn öppnas igen. Det andra trycket stänger textvyn.
- Snabblänken öppnar textvyn som knappen, med **Oskickat** kvar.

### TEXTVY-02: samtalstexten visar vem som skriver och raden Skyttel arbetar sist

**Syfte:** Läsa samtalet utan namn och se när Skyttel arbetar.

**Användare:** Alex.

**Förutsättningar:** Ett datorfönster bredare än 700 px. Inget
medgivande gäller.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-02: samtalstexten visar vem som skriver och raden
Skyttel arbetar sist”.

**Steg:**

1. Välj **Skriv** i kartans vägledning och **Godkänn och starta**.
2. Läs den tomma samtalstexten. Skriv **Vem betalar musiken?** och klicka
   på **Skicka**.
3. Medan terminalen håller svaret: läs samtalstextens sista rad. Släpp
   sedan svaret med `reply NUMMER Kim betalar musiken.`.
4. Skriv **Rad ett**, tryck Skift+Retur, skriv **rad två** och tryck Retur.
   Släpp svaret.
5. Med en skärmläsare: läs raderna i samtalstexten.

**Förväntat resultat:**

- Den tomma samtalstexten visar
  **Här visas det du och Skyttel säger och skriver.**
- **Skicka** står i höjd med fältets mitt. Fältet behåller fokus efter
  klicket på **Skicka** och efter Retur.
- Raden **Skyttel arbetar…** står sist medan Skyttel arbetar. Ingen
  tidräknare visas.
- Samtalstexten har liten text med täta rader och inga synliga namn. Din
  text står i en tonad ruta till höger, och Skyttels text står utan ruta.
  Skift+Retur ger en ny rad i samma meddelande.
- Skärmläsaren läser **Du:** före dina rader och **Skyttel:** före
  Skyttels rader.

### TEXTVY-03: Nytt samtal tömmer samtalet och behåller utkast och mikrofon

**Syfte:** Börja om samtalet utan att förlora utkast, mikrofonläge eller
oskickad text och utan att frågas om medgivande igen.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. En mikrofon
är ansluten, eller den kontrollerade mikrofonen i den kontrollerade
röstinstallationen används. Inget medgivande gäller.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-03: Nytt samtal tömmer samtalet och behåller utkast och
mikrofon”.

**Steg:**

1. Välj **Prata med Skyttel** och **Godkänn och starta**. Öppna textvyn
   med **Skriv till Skyttel**.
2. Skicka **Rätta namnet.**. Medan terminalen håller svaret, skriv
   **Oskickat** i fältet utan att skicka.
3. Välj **Nytt samtal**.
4. Släpp det hållna svaret med ett förslag som byter Lo:s namn.
5. Skicka **Vad finns i utkastet?** och läs nästa `held` i terminalen.

**Förväntat resultat:**

- Samtalstexten töms och visar bara
  **Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.**
  Med mikrofonen på säger Skyttel samma sak.
- Ingen medgivanderuta visas. Mikrofonen är fortfarande på.
- **Oskickat** står kvar i fältet. Lo-förslaget är oförändrat, också
  efter att det stoppade svaret har släppts.
- Nästa uppdrag bär inget av det som sades före **Nytt samtal**.

### TEXTVY-04: textvyn går att använda på mobil enhet och smal skärm

**Syfte:** Skriva till Skyttel på pekskärm och smal skärm utan att
skärmtangentbordet kommer upp av sig självt.

**Användare:** Alex.

**Förutsättningar:** En iPad eller ett pekskärmsfönster bredare än
700 px, och en telefon eller ett fönster som är högst 700 px brett. Inget
medgivande gäller.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-04: textvyn går att använda på mobil enhet och smal
skärm”.

**Steg:**

1. På iPad: tryck på **Skriv till Skyttel** och **Godkänn och starta**.
2. Tryck i meddelandefältet, skriv **Hej Skyttel.** och tryck på
   **Skicka**.
3. På telefon eller i ett smalt fönster: öppna textvyn, läs den och stäng
   den med **Skriv till Skyttel**. Öppna den igen och välj sedan **Lista**.

**Förväntat resultat:**

- På iPad är textvyn ett sidofält vid högerkanten och kartan syns bredvid.
  Fältet får inte fokus av sig självt, och tangentbordet kommer upp först
  när du trycker i fältet. Fältet behåller fokus efter **Skicka**.
- På smal skärm fyller textvyn skärmen under verktygsraden. Rubriken,
  **Nytt samtal**, fältet och **Skicka** syns utan horisontell rullning.
  Fältet får inte fokus av sig självt.
- När textvyn stängs syns kartan igen. **Lista** ersätter textvyn på smal
  skärm, och samtalet och den oskickade texten finns kvar.

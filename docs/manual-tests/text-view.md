# Manuella testfall för textvyn

Fallen provar **Skriv till Skyttel**: textvyn öppnas och stängs utan att
samtalet avslutas, samtalstexten visar vem som skriver, raden
**Skyttel arbetar…** står sist och **Nytt samtal** tömmer samtalet men
behåller utkast, mikrofon och oskickad text. De provar också att textvyn
går att använda på mobil enhet och smal skärm. Placering, bredd och mått
kontrolleras av integrationstesterna.
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

- Textvyn står vid högerkanten, och kartan syns bredvid.
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
- Fältet behåller fokus efter klicket på **Skicka** och efter Retur.
- Raden **Skyttel arbetar…** står sist medan Skyttel arbetar. Ingen
  tidräknare visas.
- Samtalstexten visar inga namn. Din text och Skyttels text går att
  skilja åt utan namn. Skift+Retur ger en ny rad i samma meddelande.
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

## Bedömning och återstående manuella prov

Flödet är utformat mot WCAG 2.2 nivå AA. Kraven nedan är designmål, och
automationen visar bara det som anges. Ingen skärmläsare och ingen fysisk
enhet är provad, och fullständig överensstämmelse intygas inte.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning | Automatisk kontroll | Återstår att prova manuellt |
| --- | --- | --- | --- |
| 1.3.1, 4.1.2 Namn, roll och relationer | Textvyn är en region med rubriken **Skriv till Skyttel** som namn. Samtalstexten är en logg med namnet **Samtalstext**. Varje rad börjar med en dold talare, **Du:** eller **Skyttel:**. **Skriv till Skyttel** säger med sitt utfällda läge om textvyn är öppen. | Namn på region, logg, fält och knappar, dolda talare och knappens läge. | Uppläsning med NVDA och VoiceOver, och hur loggens nya rader läses upp. |
| 1.3.2, 2.4.3 Ordning och fokus | Rubriken, **Nytt samtal** och **Stäng textvyn** står först, samtalstexten därefter och fältet sist. På dator får fältet fokus när textvyn öppnas, och **Stäng textvyn** ger fokus till **Skriv till Skyttel**. På mobil enhet och smal skärm stannar fokus i verktygsraden eller går till rubriken. | Fokus vid öppning på dator och pekskärm, efter **Skicka** och efter stängning. | Fokusordning med skärmläsare och på fysisk pekskärm. |
| 1.4.1 Färg | Din text står i en tonad ruta med kant. Talaren finns också i text för hjälpmedel. | Rutan och den dolda talaren. | – |
| 1.4.3, 1.4.11 Kontrast | Textvyn använder kartans färger för text, ytor, kanter och fokus i ljust och mörkt tema. | Ingen. | Kontrast för samtalstexten, platshållaren och den tonade rutan i båda teman. |
| 1.4.4, 1.4.10 Förstoring och omflöde | På smal skärm fyller textvyn skärmen under verktygsraden, och bara samtalstexten rullar. | Textvyn ryms på 390 px utan rullning i sidled, med rubrik, fält och **Skicka** synliga. | Verklig webbläsarzoom och textförstoring. |
| 2.1.1 Tangentbord | Alla kontroller nås med Tab. Retur skickar, och Skift+Retur ger en ny rad. | Skicka med Retur och ny rad med Skift+Retur. | Hjälpmedlens egna tangentkommandon. |
| 2.5.8 Pekmål | **Stäng textvyn** är 44 px. **Nytt samtal** och **Skicka** är minst 36 px höga. | Tryck på fältet och **Skicka** på pekskärm. | Träffsäkerhet på fysisk pekskärm. |
| 3.3.2 Etiketter | Fältet har den synliga etiketten **Meddelande till Skyttel**. | Fältets namn och platshållare. | – |
<!-- markdownlint-enable MD013 -->

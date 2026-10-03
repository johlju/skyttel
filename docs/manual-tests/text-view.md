# Manuella testfall för textvyn

Fallen provar **Skriv till Skyttel**: textvyn öppnas och stängs utan att
samtalet avslutas, samtalstexten visar vem som skriver, raden
**Skyttel arbetar…** står sist och **Nytt samtal** tömmer samtalet men
behåller utkast, mikrofon och oskickad text. De provar också att textvyn
går att använda på mobil enhet och smal skärm samt personliga bredder på
dator. Placering, bredd och mått
kontrolleras av integrationstesterna.
Anteckna commit, webbläsare, enhet och godkänt eller underkänt resultat
vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Textprov och
  loggar in med Google i den kontrollerade installationen.

## Allmän förberedelse

1. För TEXTVY-01, TEXTVY-02 och TEXTVY-04: starta den
   [kontrollerade installationen för text](text-assistant.md#controlled-text-fixture).
   För TEXTVY-03, TEXTMOBIL-01–04 och TEXTBREDD-01–05: starta i stället
   [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture)
   med `node --import tsx scripts/manual-voice.ts` efter bygget. Följ guidens
   privata portvidarebefordran och inloggning. Kör inte `seed-family`;
   hushållet och det enda förslaget skapas i nästa steg. Båda installationerna
   håller varje modellsvar tills du släpper det i terminalen.
2. Skapa hushållet Textprov. Skapa **Lo Exempel** av typen **Person** med
   beskrivningen **Påhittad uppgift** genom Lista och välj
   **Lägg i mitt utkast**. Lämna förslaget osparat.
3. Ladda om sidan före varje fall, så att inget medgivande gäller för
   besöket. Behåll hushållet och förslaget mellan fallen.
4. Avsluta respektive installation med `quit` och kontrollera att dess
   tillfälliga katalog försvinner enligt startguiden. Röstinstallationen
   använder tysta mediespår. Den provar kommentarspaket och mikrofonläge;
   faktiskt hört tal redovisas separat i TEXTVY-03.

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
  tidräknare visas. Raden visar **0 meddelanden väntar. Tryck på Escape
  för att avbryta.** på dator.
- Samtalstexten visar inga namn. Din text och Skyttels text går att
  skilja åt utan namn. Skift+Retur ger en ny rad i samma meddelande.
- Skärmläsaren läser **Du:** före dina rader och **Skyttel:** före
  Skyttels rader.

### TEXTVY-03: Nytt samtal tömmer samtalet och behåller utkast och mikrofon

**Syfte:** Börja om samtalet utan att förlora utkast, mikrofonläge eller
oskickad text och utan att frågas om medgivande igen.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen är igång med
Textprov och Lo-förslaget osparat i utkastet. Inget medgivande gäller.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-03: Nytt samtal tömmer samtalet och behåller utkast och
mikrofon”.

**Steg:**

1. Välj **Prata med Skyttel** och **Godkänn och starta**. Öppna textvyn
   med **Skriv till Skyttel**.
2. Skicka **Rätta namnet.**. Medan terminalen håller svaret, skriv
   **Oskickat** i fältet utan att skicka. Anteckna anropets `id`, utkastets
   `version` och `contentVersion` samt Lo-förslagets `id` och hela `after`
   från `held.draft`.
3. Välj **Nytt samtal**.
   Kör `sessions` i terminalen. Det senaste paketet av typen
   `session.commentary.append` ska ha `content` lika med
   **Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.**
4. Släpp det gamla hållna anropet med `tool REQUEST propose_object`
   följt av ett JSON-objekt på samma terminalrad. Ersätt `REQUEST` med
   antecknat anrops-ID. Argumentet ska ha antecknad `version`,
   `contentVersion`, Lo-förslagets `id`, `baseRevision:null` och `value`
   lika med kopierat `after`, men ändrat `name` till **För sent**.
   Ta bort eventuella servermetadata som `id`, `householdId` och `revision`
   ur `value`. Kontrollera oförändrat Lo-förslag i utkastet.
5. Skicka **Vad finns i utkastet?**. Nästa `held.input` ska innehålla
   bara det nya uppdraget utan **Rätta namnet.** Släpp svaret med
   `reply REQUEST Lo Exempel.`, där `REQUEST` är det nya anropets ID.
6. Stäng av mikrofonen. Skriv **Oskickat vid omstart** utan att skicka.
   Aktivera långsam nätverksanslutning i webbläsarens utvecklarverktyg
   och dubbelklicka **Nytt samtal** medan omstarten väntar på svar.
   Vänta på beskedet och återställ normal anslutning.
   Kontrollera i nätverkspanelen att bara ett anrop till `/new` skickas.
   Kör `window.skyttelVoiceFixture.stats()` i webbläsarkonsolen.

**Förväntat resultat:**

- Samtalstexten töms och visar bara
  **Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.**
  Samma verifierbara besked skickas i kommentarspaketet.
  Paketet och de tysta spåren bevisar inte att tal hörs.
- Ingen medgivanderuta visas. Mikrofonen är fortfarande på.
- **Oskickat** står kvar i fältet. Lo-förslaget är oförändrat, också
  efter att det stoppade svaret har släppts.
- Nästa uppdrag bär inget av det som sades före **Nytt samtal**.
- När mikrofonen är av förblir den av efter **Nytt samtal**.
  Även ett dubbelklick med fördröjt svar bevarar läget, Lo-förslaget och
  **Oskickat vid omstart**. `stats()` visar `microphoneRequests: 1`,
  `openPeers: 1` och ett mikrofonspår med `enabled:false`, `state:'live'`.

**Separat prov med faktiskt hört tal:**

1. Följ [förberedelsen med verklig röst](../development/devcontainer.md#optional-assistant-access)
   i en isolerad installation med konfigurerad privat leverantörsnyckel
   och påhittade data. Skapa Textprov och samma osparade Lo-förslag.
2. Anslut fysisk mikrofon och ljudutgång. Välj **Prata med Skyttel**,
   godkänn samtalet och tillåt mikrofonen. Öppna textvyn och välj
   **Nytt samtal**. Använd **Spela upp ljud** om uppspelning blockeras.
3. Kontrollera att Skyttel hörbart säger att ett nytt samtal börjar och
   att en osparad ändring ligger kvar i utkastet. Kontrollera samtidigt
   samma besked i samtalstexten och kvarvarande Lo-förslag.
4. Anteckna faktiskt hört resultat, mikrofon, ljudutgång och webbläsare
   separat från det kontrollerade provet. Detta lyssningsprov återstår
   tills en människa har utfört det; integrationstestet provar inte ljudet.

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
  Sidofältet är 400 px brett även på en liggande telefon.
  Fältet får inte fokus av sig självt, och tangentbordet kommer upp först
  när du trycker i fältet. Fältet behåller fokus efter **Skicka**.
- På smal skärm fyller textvyn skärmen under verktygsraden. Rubriken,
  **Nytt samtal**, fältet och **Skicka** syns utan horisontell rullning.
  Fältet får inte fokus av sig självt.
- När textvyn stängs syns kartan igen. **Lista** ersätter textvyn på smal
  skärm, och samtalet och den oskickade texten finns kvar.

## Textvyn på mobil enhet

### TEXTMOBIL-01: samma lägesregel ger rätt bredd och kompakt rad

**Syfte:** Läsa, skriva och öppna utkastet på telefon, surfplatta och dator.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen med Textprov
och det osparade Lo-förslaget. Börja utan öppet samtal. Prova Chrome på
Windows, macOS, iPhone och iPad; anteckna varje verklig enhet separat.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-01: samma lägesregel ger rätt bredd och kompakt rad”,
i grupperna för 390×844, 375×667, 844×390, 820×1180, 1180×820,
320×250, 700×500 och 1280×900.

**Steg:**

1. På stående iPhone: välj **Skriv till Skyttel** och godkänn. Kräv att
   textvyn börjar under verktygsraden och fyller resten av den synliga
   skärmen. Tangentbordet ska inte öppnas av sig självt.
2. Tryck i **Meddelande till Skyttel**, skriv **Ett vanligt uppdrag.** och
   välj **Skicka**. Släpp det hållna modellsvaret i terminalen med
   `reply ANROP Ett synligt provsvar.`, där `ANROP` är ID från `held`.
   Fältet ska behålla fokus. Rulla för att läsa kartans utkaståterkoppling.
3. Välj **Visa utkastet**. Kräv Lo Exempel och knappens nya namn
   **Dölj utkastet (1)**. Stäng utkastet igen.
4. Upprepa på iPad stående och liggande samt iPhone liggande. Kräv ett
   sidofält till höger med kartan synlig bredvid. Sidofältets fasta bredd
   på 400 px mäts i automationen.
5. På dator: minska fönstret till högst 700 px. Kräv samma fyllda textvy
   som på stående telefon. Minska höjden under 520 px. Kräv en enda rad
   med mätaren, **Utkast (1)**, **Nytt samtal** och stängknappen.
6. Läs med VoiceOver eller NVDA. Rubriken **Skriv till Skyttel**,
   mätarens namn **Kontext** och fältets etikett ska finnas även när de
   inte syns. Utkastknappen ska heta **Visa utkastet (1)** eller
   **Dölj utkastet (1)**. På bred dator med mus ska rubriken synas även
   om höjden är kort. En bärbar dator med både mus och pekskärm följer
   sin främsta pekare, inte bara förekomsten av pekstöd.

**Förväntat resultat:**

- Bredd och främsta pekare ger samma läge genom hela samtalsflödet.
  Ett smalt datorfönster fungerar som smal skärm.
- Under 520 px synlig höjd på mobil enhet eller smal skärm används
  den kompakta raden och ett meddelandefält på en rad. Alla kontroller
  är nåbara utan rullning i sidled. Fältets och mätarens namn bevaras.
- Automationen kontrollerar mått, knappnamn, utkastets innehåll och att
  **Skicka** verkligen kan tryckas utan att kartans återkoppling täcker det.

### TEXTMOBIL-02: synlig höjd följs utan att fält eller fokus byts

**Syfte:** Fortsätta skriva när ett verkligt skärmtangentbord tar plats.

**Användare:** Alex.

**Förutsättningar:** Samma installation. På fysisk iPhone eller iPad
får tangentbordet själv bestämma höjden; de automatiserade höjderna är
kontrollerade exempel, inte uppmätta tangentbord.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-02: synlig höjd följs utan att fält eller fokus byts”,
i grupperna för 508, 407, 420 och 190 px synlig höjd.

**Steg:**

1. Öppna textvyn och godkänn. Kräv att tangentbordet är dolt. Slå på
   **Prata med Skyttel**; den kontrollerade rösten använder tysta spår.
2. Tryck i fältet och skriv **Ett vanligt uppdrag.**. Kräv att textvyn
   följer den yta som tangentbordet lämnar, med fältet synligt.
3. Vrid telefonen till liggande medan tangentbordet är öppet. Kräv den
   kompakta raden, minst en läsbar samtalsrad och fältet. Röstrutan står
   ovanför sidofältet på bred pekskärm, med samma höjd som tidigare.
   På smal skärm står den direkt ovanför fältet i textvyn.
4. Välj **Skicka** och släpp svaret med `reply ANROP Ett synligt provsvar.`.
   Kräv fokus kvar i fältet, kvarvarande tangentbord och läsbart svar.
5. Dölj tangentbordet och öppna det igen. Kräv samma pågående samtal,
   oskickad text och mikrofon på. Upprepa på iPad i båda riktningarna.

**Förväntat resultat:**

- Ingen ombyggnad av fältet tappar text eller fokus. Tangentbordet
  öppnas bara när användaren väljer fältet och står kvar efter **Skicka**.
- Automationen använder webbläsarens verkliga ändring av synlig höjd.
  Vid 844×190 px mäts sidofältet till 134 px med kompakt rad, samtalsyta
  och fält synliga och mikrofonen på. Röstrutan är fortfarande 36 px hög.
- Verkligt tangentbord, rotation, synlig fokusmarkering och VoiceOver
  återstår att kontrollera manuellt på iPhone och iPad.

### TEXTMOBIL-03: röstrutan och notisen lämnar kartans nederkant fri

**Syfte:** Nå kartans kontroller och samtalets kontroller utan överlapp.

**Användare:** Alex.

**Förutsättningar:** Samma installation på stående telefon. Lo-förslaget
är osparat. Textvyn är öppen och mikrofonen på.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-03: röstrutan och notisen lämnar kartans nederkant fri”.

**Steg:**

1. Stäng textvyn. Läs röstrutan, kartans återkoppling och raden med
   **Återställ vy**. Kräv att ingen av dem täcker den andra.
2. Kör `window.skyttelVoiceFixture.setSound('remote', true)` i
   webbläsarkonsolen för att låta den externa provkällan visa **Skyttel
   talar**. Tryck på **Avbryt**, även nära den synliga ikonens kant.
   Kräv att rösten tystnar och utkastet ligger kvar.
3. Öppna textvyn igen. Skicka **Ett kontrollerat fel.** och kör
   `fail ANROP` i terminalen, med anrops-ID från `held`.
4. Läs **Skyttel kunde inte slutföra uppdraget. Försök igen.** ovanför
   fältet. Välj **Stäng notisen**. Kräv att notisen försvinner och
   att samtalet och utkastet finns kvar.

**Förväntat resultat:**

- Röstrutan står ovanför kartans nedersta synliga kontroller och
  återkoppling när textvyn är stängd. Med textvyn öppen står röstrutan
  ovanför fältet, utan att täcka notisens stängknapp.
- Stoppikonens tryckyta och notisens stängknapp är 44×44 px på mobil
  enhet. Stoppikonens synliga cirkel behåller sitt utseende.
  Automation mäter tryckytorna och trycker utanför cirkelns synliga kant.

### TEXTMOBIL-04: en lång notis rullar och kan stängas i kort fönster

**Syfte:** Nå notisens innehåll och stängknapp utan att tappa fältet.

**Användare:** Alex.

**Förutsättningar:** Samma installation på liggande telefon med
skärmtangentbordet öppet och textvyn i kort läge.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-04: en lång notis rullar och kan stängas i kort fönster”.

**Steg:**

1. Skicka **Ett kontrollerat fel.** och kör `fail ANROP` i terminalen.
2. Läs notisen ovanför fältet. Om den inte ryms, rulla inne i notisen
   för att läsa resten. Kontrollera att fältet ligger kvar.
3. Flytta fokus till **Stäng notisen** med externt tangentbord eller
   VoiceOver och aktivera knappen. Kräv att den går att nå även efter
   att notisens text har rullats.
4. Skriv ett nytt uppdrag och välj **Skicka**. Kräv fokus kvar i fältet.

**Förväntat resultat:**

- Notisen rullar inom sin begränsade yta och flyttar inte bort fältet.
  Stängknappen går att nå och har kvar sin tryckyta på 44×44 px.
- Automation provar detta vid 844×190 px. Faktisk förstoring, fokus
  och VoiceOver med verkligt tangentbord provas separat.

## Personliga bredder på dator

### TEXTBREDD-01: handtagen ändrar bredderna var för sig utan att avbryta samtalet

**Syfte:** Ändra en bredd med mus eller tangentbord och behålla samtalet.

**Användare:** Alex.

**Förutsättningar:** Röstinstallationen från förberedelsen med det
osparade Lo-förslaget. Ett brett datorfönster med mus, gärna 1600 px.
Börja med grundbredderna genom TEXTBREDD-03 om de tidigare har ändrats.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-01: handtagen ändrar bredderna var för sig utan att
avbryta samtalet”.

**Steg:**

1. Välj **Skriv till Skyttel**, godkänn och välj **Visa utkastet**.
   Slå på **Prata med Skyttel**. Skriv **Oskickat medan bredden ändras**
   utan att skicka.
2. Dra gränsen vid samtalstextens vänsterkant åt vänster och sedan
   gränsen vid utkastets vänsterkant åt vänster. Kontrollera fältet,
   mikrofonläget och Lo-förslaget efter varje dragning.
3. Nå **Ändra samtalstextens bredd** med Tab. Tryck vänsterpil och
   högerpil. Nå **Ändra utkastlistans bredd** och tryck högerpil.
4. Dra vardera gränsen så långt åt höger som möjligt. Dra sedan
   samtalstextens gräns långt åt vänster. Kontrollera att kartan syns.
5. Läs handtagens namn, roll och aktuella värde med NVDA eller VoiceOver.

**Förväntat resultat:**

- Samtalstext och utkast ändras var för sig. Dragning behåller fokus i
  fältet; piltangenter behåller fokus på handtaget. Oskickad text,
  mikrofonläge, samtal och Lo-förslag finns kvar. Ingen ny mikrofon begärs.
- Handtagen heter **Ändra samtalstextens bredd** och
  **Ändra utkastlistans bredd** och har rollen avskiljare med aktuellt,
  minsta och största värde. Piltangenter ger ett alternativ till dragning.
- Automationen mäter grundbredderna 400/340 px, steget 24 px och
  minimibredderna 300/260 px. Största bredd lämnar kartan synlig.
  Den kontrollerar samma fält och oförändrade mikrofonspår under ändring.
- Verklig uppläsning, synligt fokus och kontrast provas separat manuellt.

### TEXTBREDD-02: bredderna följer användaren och skärmens begränsning sparas inte

**Syfte:** Behålla Alex bredder mellan hushåll och enheter utan att ändra
Robins bredder eller skriva över valet på liten skärm.

**Användare:** Alex och Robin.

**Förutsättningar:** Samma röstinstallation, två webbläsarprofiler för
Alex och en för Robin. Skapa extra hushållet med den begränsade
provdatabasförberedelsen i
[SAMTALSUTKAST-02](conversation-draft.md#samtalsutkast-02-valet-följer-användaren-mellan-hushåll-och-enheter).
Använd katalogen från röstinstallationen. Den andra profilen öppnar
`/households/draft-other-household` på installationens utskrivna adress.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-02: bredderna följer användaren och skärmens
begränsning sparas inte”.

**Steg:**

1. I Alex första profil, öppna samtal och utkast och gör båda bredderna
   tydligt större med handtagen.
2. Logga in med Google som Alex i den andra profilen. Öppna andra
   hushållet, starta med text, godkänn och öppna det tomma utkastet.
3. Minska andra fönstrets bredd till cirka 850 px. Kontrollera kartan och
   utkastet. Gör fönstret brett igen utan att använda något handtag.
4. Öka utkastbredden med vänsterpil i andra profilen. Återgå till Alex
   första fönster och kontrollera samma ändring.
5. Kör `identity robin`. Logga in med Microsoft i Robins profil. Bjud in
   Robin till Textprov enligt SAMTALSUTKAST-02. Öppna samtal och utkast
   där. Kör `identity alex`, sedan `restart`, och ladda om Alex sida.

**Förväntat resultat:**

- Alex bredder gäller i båda hushållen och profilerna samt efter omstart.
  När ett redan öppet fönster får fokus läser det in det sparade valet.
- På mindre datorfönster begränsas visningen så att kartan syns och
  utkastet ryms. De större sparade bredderna kommer tillbaka på bred skärm
  utan att användaren behöver ändra dem igen.
- Robin börjar med grundbredderna, oberoende av Alex val.

### TEXTBREDD-03: bredderna återställs i Inställningar även utan tillgängligt samtal

**Syfte:** Återställa båda bredderna utan att ändra valet för utkastet.

**Användare:** Alex.

**Förutsättningar:** Samma installation. Kör `available off` i terminalen
och ladda om sidan. Förbered ändrade bredder med TEXTBREDD-01 innan
samtalet stängs av. Markera gärna utkastets startval i Inställningar.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-03: bredderna återställs i Inställningar även utan
tillgängligt samtal”.

**Steg:**

1. Öppna **Inställningar**, **Samtal med Skyttel**. Läs **Textvyns bredd**.
2. Aktivera offline i webbläsarens utvecklarverktyg. Välj
   **Återställ bredderna** och läs återkopplingen. Återställ anslutningen.
3. Använd Tab och Enter för att välja **Återställ bredderna** igen.
   Kontrollera återkoppling, fokus och utkastets startval.
4. Kör `available on`, återgå till kartan och öppna samtal och utkast.

**Förväntat resultat:**

- Delen säger **Gäller dig i alla dina hushåll.** och visar inga värden.
  Samtalets otillgänglighet hindrar inte återställningen.
- Vid misslyckande står **Bredderna kunde inte sparas. Försök igen.**
  Knappen och tidigare bredder finns kvar och fokus stannar på knappen.
- Vid lyckad återställning står **Bredderna är återställda**. Knappen
  försvinner, **Du har inte ändrat bredderna.** visas och fokus går till
  delens rubrik. Valet **Visa utkastet när ett samtal börjar** ändras inte.
- Samtalstext och utkast har grundbredderna igen. Knappen visas bara när
  minst en sparad bredd skiljer sig från grundvärdet.

### TEXTBREDD-04: mobil enhet och smal skärm har inga breddhandtag

**Syfte:** Behålla mobilens och den smala skärmens layout.

**Användare:** Alex.

**Förutsättningar:** Samma installation, tidigare ändrade bredder och
ett datorfönster högst 700 px brett, stående telefon och bred surfplatta.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-04: mobil enhet och smal skärm har inga breddhandtag”,
i grupperna smal dator, telefon och bred pekskärm.

**Steg:**

1. Öppna textvyn och utkastet på varje skärm. Kontrollera att inga
   breddhandtag finns eller kan nås med Tab.
2. Öppna **Inställningar**, **Samtal med Skyttel** på varje enhet.
3. Återgå till ett brett datorfönster och kontrollera de sparade bredderna.

**Förväntat resultat:**

- Ingen bredd ändras på mobil enhet eller smal skärm. Bred pekskärm har
  fortsatt ett fast sidofält på 400 px; smal skärm fylls som tidigare.
- **Textvyns bredd** saknas på mobil enhet. Delen finns på smal dator
  och kan återställa sparade bredder där.
- Visning på dessa skärmar skriver inte över de sparade datorbredderna.
  Automationen provar emulerade pekare; fysisk enhet provas separat.

### TEXTBREDD-05: äldre hushållsarkiv lämnar personliga samtalsval kvar

**Syfte:** Läsa ett kompatibelt äldre arkiv utan att återställa personliga
bredder, utkastets startval eller medgivande från hushållsfilen.

**Användare:** Alex, administratör i Textprov.

**Förutsättningar:** Samma isolerade röstinstallation och Lo-förslag.
Inga verkliga privata uppgifter används. Det nya personliga lagret ändrar
inte hushållsfilens innehåll; en kopia med schemaversion 23 är därför ett
giltigt kompatibilitetsprov. Ändra aldrig en produktionsfil för detta prov.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-05: äldre hushållsarkiv lämnar personliga samtalsval kvar”.
Aktuell export och återimport täcks även av
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-10: the downloaded current-format archive restores
shared, private and historical content after restart”.

**Steg:**

1. Starta samtalet med text, markera **Fråga inte igen för det här
   hushållet** och godkänn. Öppna utkastet och ändra båda bredderna.
2. Öppna **Inställningar**, **Fullständig export**. Förbered exporten och
   hämta ZIP-filen. Kör kommandot nedan i arbetsytan; ersätt endast
   sökvägen med den hämtade provfilen. Kommandot kontrollerar versionen och
   gör en ny tillfällig kopia utan att ändra hushållsinnehållet.
3. På **Samtal med Skyttel**, återställ bredderna och markera
   **Visa utkastet när ett samtal börjar**.
4. På **Återimportera hushållet**, välj `/tmp/skyttel-schema-23.zip`.
   Välj **Kontrollera importfil**, granska och markera **Jag vill ersätta
   allt hushållsinnehåll**. Välj **Ersätt hushållets innehåll**.
5. Läs **Samtal med Skyttel** igen och kontrollera grundbredderna,
   utkastets markerade startval och det sparade medgivandet. Läs Lo-förslaget.
   Ta bort den tillfälliga provkopian när provet är färdigt.

```sh
TEXTBREDD_ARCHIVE=/absolute/path/skyttel-hushall.zip node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
const parts = unzipSync(readFileSync(process.env.TEXTBREDD_ARCHIVE));
const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
if (manifest.format !== 'skyttel-household' || manifest.schemaVersion !== 24)
  throw Error('En provexport med schemaversion 24 krävs');
manifest.schemaVersion = 23;
parts['manifest.json'] = Buffer.from(JSON.stringify(manifest));
writeFileSync('/tmp/skyttel-schema-23.zip', zipSync(parts), { mode: 0o600 });
JS
```

**Förväntat resultat:**

- Exporten använder schemaversion 24. Personliga samtalsval och medgivande
  ingår inte i hushållsfilen; automationen granskar detta.
- En giltig schemaversion 23 går att kontrollera och återimportera genom
  gränssnittet. Lo-förslaget bevaras. Aktuell version provas också.
- Grundbredderna, det markerade startvalet och det sparade medgivandet
  finns kvar efter import. Hushållsimport skriver inte över personliga val.

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
| 3.3.2 Etiketter | Fältet har etiketten **Meddelande till Skyttel**, dold visuellt i kort läge. | Fältets namn och platshållare även efter ändrad synlig höjd. | Uppläsning i kort läge. |
<!-- markdownlint-enable MD013 -->

Mobilfallen verifierar även omflöde utan horisontell rullning (1.4.10),
namn på dolda etiketter och den kompakta utkastknappen (1.3.1, 4.1.2),
bevarat fokus och nåbar stängknapp efter rullning (2.4.3, 2.4.11) samt
44 px tryckyta utan förändrad symbol (2.5.8). Läsordningen och det
synliga fokuset på verklig iPhone och iPad, kontrast i båda teman och
200/400 procents zoom återstår att kontrollera. Emulerade skärmstorlekar
och en ändring av webbläsarens synliga höjd bevisar inte ett fysiskt
skärmtangentbord eller fullständig överensstämmelse.

Breddhandtagen har namn, avskiljarroll, orientering, styrd region och
aktuellt/minsta/största värde (1.3.1, 4.1.2). Tab och piltangenter ger
tangentbordsåtkomst och ett alternativ till dragning (2.1.1, 2.5.7).
Handtagens träffyta är 24 px bred (2.5.8), och fokus markeras i kartans
accentfärg (2.4.7, 1.4.11). Återställning ger artig återkoppling och
rubrikfokus när knappen försvinner (2.4.3, 4.1.3). Automationen kontrollerar
namn, roller, värden, dragning, piltangenter, bevarat fokus och text samt
återställningens fokus. Verklig skärmläsaruppläsning, kontrast i båda teman
och omflöde vid 200/400 procents zoom återstår. Detta är designmål och
avgränsade kontroller, inte ett intyg om fullständig WCAG-överensstämmelse.

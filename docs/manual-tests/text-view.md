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
   För TEXTVY-03, TEXTMOBIL-01–05 och TEXTBREDD-01–05: starta i stället
   [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture)
   med `npm run test:env -- node --import tsx scripts/manual-voice.ts` efter
   bygget. Följ guidens
   privata portvidarebefordran och inloggning. Kör inte `seed-family`;
   hushållet och det enda förslaget skapas i nästa steg. Båda installationerna
   håller varje modellsvar tills du släpper det i terminalen.
2. Skapa hushållet Textprov. Skapa **Lo Exempel** av typen **Person** med
   beskrivningen **Påhittad uppgift** (för TEXTBREDD-fallen används i stället
   **Osparad breddprovuppgift**) genom **Nytt objekt** och välj
   **Lägg i utkastet och stäng**. Lämna förslaget osparat.
3. Använd en ny installation per fall. Ladda om före samtalsstart; inget
   medgivande gäller för besöket. Behåll samma databas vid omstart.
4. Avsluta respektive installation med `quit` och kontrollera att dess
   tillfälliga katalog försvinner enligt startguiden. Röstinstallationen
   använder tysta mediespår. Den provar kommentarspaket och mikrofonläge;
   faktiskt hört tal redovisas separat i TEXTVY-06.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-view.spec.ts",
    "caseId": "TEXTVY-01"
  },
  "reference": "1280 × 800, mus; öppning, stängning och snabblänk med bevarad oskickad text.",
  "outcomes": [
    "Öppna och stänga textvyn med samma knapp, utan att samtalet, mikrofonen eller den oskickade texten går förlorade."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel** i **Kartans verktyg**. Textvyn öppnas utan
   samtalsstart. Välj **Nytt samtal** och **Godkänn och starta**.
2. Läs textvyn: rubriken **Skriv till Skyttel** med **Nytt samtal** och
   stängknappen **Stäng textvyn**, samtalstexten och meddelandefältet.
3. Skriv **Oskickat** i fältet utan att skicka. Välj **Stäng textvyn**.
4. Välj **Skriv till Skyttel** två gånger.
5. Gå med Tab från sidans början till snabblänken
   **Till samtalet med Skyttel** och välj den med Enter.

**Förväntat resultat:**

- Textvyn står vid högerkanten, och kartan syns bredvid.
- Kontextmätaren står under samtalsrubriken.
  Sparandet nås genom **Rapporter → Ändringshistorik**.
- **Nya förslag är osparade tills du uttryckligen ber om ett samlat sparande.**
  står under hushållets namn, utanför textvyn.
- Fokus efter skickandet och radplacering provas i TEXTVY-02.
- Meddelandefältet **Meddelande till Skyttel** har fokus när textvyn
  öppnas och platshållaren **Berätta vad du vill göra…**.
- **Stäng textvyn** ger fokus till **Skriv till Skyttel**. Kartan får hela
  bredden igen. Samtalet fortsätter, och **Oskickat** står kvar när
  textvyn öppnas igen. Det andra trycket stänger textvyn.
- Snabblänken öppnar textvyn som knappen, med **Oskickat** kvar.

### TEXTVY-02: samtalstexten visar vem som skriver och raden Skyttel arbetar sist

**Syfte:** Skilja din text från Skyttels text och se när Skyttel arbetar.

**Användare:** Alex.

**Förutsättningar:** Ett datorfönster bredare än 700 px. Inget
medgivande gäller.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-02: samtalstexten visar vem som skriver och raden
Skyttel arbetar sist”.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-view.spec.ts",
    "caseId": "TEXTVY-02"
  },
  "reference": "Dator; två hållna svar, klick och Enter samt Shift+Enter.",
  "outcomes": [
    "Skilja din text från Skyttels text och se när Skyttel arbetar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal**, godkänn och läs tom samtalstext.
2. Skriv **Vem betalar musiken?**, klicka Skicka och läs den sista
   arbetsraden medan operatören håller svaret. Fältet har kvar fokus.
3. Låt operatören leverera **Kim betalar musiken.** Läs dina och Skyttels
   olika rader med respektive talarnamn.
4. Skriv **Rad ett**, Skift+Retur, **rad två**, Retur. Läs samma meddelandes
   två rader och arbetsraden sist. Släpp **Klart.** och läs slutraden.

**Förväntat resultat:**

- Den tomma samtalstexten visar
  **Här visas det du och Skyttel säger och skriver.**
- Fältet behåller fokus efter klicket på **Skicka** och efter Retur.
- Raden **Skyttel arbetar…** står sist medan Skyttel arbetar.
  Raden visar **0 meddelanden väntar. Tryck på Escape
  för att avbryta.** på dator.
- Din text och Skyttels text går att skilja åt genom radens utseende.
  Skift+Retur ger en ny rad i samma meddelande.
- De semantiska talarnamnen finns. Faktiskt hörda talare har separat
  mänskligt observationsfall TEXTVY-05.

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

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-view.spec.ts",
    "caseId": "TEXTVY-03"
  },
  "reference": "Dator; ny kontext, sena svar och mikrofon ON/OFF med hållet dubbelklick.",
  "outcomes": [
    "Börja om samtalet utan att förlora utkast, mikrofonläge eller oskickad text och utan att frågas om medgivande igen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta med röst och öppna textvyn. Skicka **Rätta namnet.**, håll svaret
   enligt separat förberedelse och skriv **Oskickat** utan att skicka.
2. Välj **Nytt samtal**. Läs endast det nya beskedet om en osparad ändring,
   kvarvarande Oskickat och mikrofonen på. Ingen ny medgivanderuta behövs.
3. Låt operatören släppa den gamla rättelsen. Läs samma nya samtalsbesked
   och öppna **Visa utkastet → Visa förslaget: Lo Exempel**. Läs Person och
   **Påhittad uppgift**, stäng uppgifterna och dölj utkastet. Skicka därefter
   **Vad finns i utkastet?** och låt operatören leverera **Lo Exempel.**
4. Stäng av mikrofonen och skriv **Oskickat vid omstart** utan att skicka.
   Låt operatören fördröja nystartens svar. Dubbelklicka **Nytt samtal**,
   vänta på beskedet och kontrollera samma text och mikrofon av. Öppna
   samma fullständiga Lo-förslag igen, läs uppgifterna och stäng det.
   Protokoll, spår och gammal kontext granskas separat av operatören.

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
  **Oskickat vid omstart**. Spårjämförelser finns i separat tekniskt underlag.

### TEXTVY-04: textvyn går att använda på mobil enhet och smal skärm

**Syfte:** Skriva till Skyttel på emulerad pekare och smal skärm utan
att fältet får fokus av sig självt.

**Användare:** Alex.

**Förutsättningar:** Emulerad pekare vid 820 × 1180, sedan samma fönster
vid 390 × 844. Inget medgivande gäller. Fysiskt skärmtangentbord provas
separat i TEXTMOBIL-13.

**Integrationstest:**
[text-view.spec.ts](../../tests/integration/text-view.spec.ts),
testfallet “TEXTVY-04: textvyn går att använda på mobil enhet och smal
skärm”.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-view.spec.ts",
    "caseId": "TEXTVY-04"
  },
  "reference": "820 × 1180 emulerad pekare, därefter390 × 844; samma samtal.",
  "outcomes": [
    "Skriva till Skyttel på emulerad pekare och smal skärm utan automatiskt fältfokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Vid 820 × 1180 med emulerad pekare: starta med text och godkänn.
   Fältet ska inte få fokus av sig självt. Aktivera fältet, skriv
   **Hej Skyttel.**, välj Skicka och låt operatören leverera **Ett provsvar.**
2. Ändra samma fönster till 390 × 844. Läs samma svar, rubrik, Nytt samtal,
   fält och Skicka utan horisontell sidrullning.
3. Stäng textvyn och läs kartan. Öppna textvyn igen, kontrollera att den
   inte automatiskt fokuserar fältet och att svaret finns kvar. Välj Tabell.

**Förväntat resultat:**

- På bred emulerad pekare är textvyn ett 400 px sidofält vid högerkanten
  och kartan syns bredvid. Fältet får inte fokus av sig självt och behåller
  fokus efter **Skicka**. Faktiskt OS-tangentbord bedöms i TEXTMOBIL-13.
- På smal skärm fyller textvyn skärmen under verktygsraden. Rubriken,
  **Nytt samtal**, fältet och **Skicka** syns utan horisontell rullning.
  Fältet får inte fokus av sig självt.
- När textvyn stängs syns kartan igen. **Tabell** ersätter textvyn på smal
  skärm, och samtalet och den oskickade texten finns kvar.

## Textvyn på mobil enhet

### TEXTMOBIL-01: samma lägesregel ger rätt bredd och kompakt rad

**Syfte:** Läsa, skriva och öppna utkastet på telefon, surfplatta och dator.

**Användare:** Alex.

**Förutsättningar:** Ny kontrollerad röstinstallation och osparat
Lo-förslag. Använd fallets exakta emulerade konfiguration.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-01: samma lägesregel ger rätt bredd och kompakt rad”.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-01"
  },
  "reference": "1280 × 900, mus; bred datorreferens med sidofält och automatiskt fältfokus.",
  "outcomes": [
    "Läsa, skriva och öppna utkastet på telefon, surfplatta och dator."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 1280 × 900 med mus. Starta med text och godkänn.
   Läs sidofältet till höger och kartan bredvid. Fältet får fokus på bred dator.
2. Skriv **Ett vanligt uppdrag.**, välj Skicka och låt operatören leverera
   **Ett synligt provsvar.** Läs svaret och kvarvarande fokus i fältet.
3. Välj **Visa utkastet (1)**. Läs Lo Exempel, **Dölj utkastet (1)** och
   öppet läge. Öppna **Visa förslaget: Lo Exempel**, läs **Person** och
   **Påhittad uppgift** och stäng uppgifterna. Hela sidan ryms utan
   horisontell sidrullning.

**Förväntat resultat:**

- På bred dator syns sidofält och karta bredvid; fältet får startfokus.
- Skicka behåller fältfokus, svaret syns och hela Lo-utkastet går att öppna.
- Ingen horisontell sidrullning behövs. Kvarvarande smala/pekade/
  korta konfigurationer har egna identiteter nedan.

### TEXTMOBIL-02: synlig höjd följs utan att fält eller fokus byts

**Syfte:** Fortsätta skriva när webbläsarfönstrets synliga höjd minskar.

**Användare:** Alex.

**Förutsättningar:** Ny kontrollerad röstinstallation och osparat
Lo-förslag. Använd fallets exakta emulerade konfiguration.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-02: synlig höjd följs utan att fält eller fokus byts”.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-02"
  },
  "reference": "390 × 844 → 508, emulerad pekare; ändrad synlig höjd i webbläsaren; fysisk tangentbordsfunktion bedöms separat.",
  "outcomes": [
    "Fortsätta skriva vid minskad synlig höjd med text, fokus och mikrofon kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 390 × 844 med emulerad pekare. Starta med text;
   fältet får inte fokus av sig självt. Slå på Prata med Skyttel.
2. Aktivera fältet och skriv **Ett vanligt uppdrag.** utan att skicka.
   Minska samma native webbläsarfönster till 390 × 508. Läs kvarvarande
   oskickad text och fokus i samma fält, kompakt rad, nåbart fält och Skicka.
3. Välj Skicka och släpp **Ett synligt provsvar.** Läs svaret inom den
   synliga samtalsytan, med fokus kvar i fältet och nåbar röstruta.
4. Återställ höjden till 844. Kontrollera samma fältfokus och mikrofon på.
   Detta storleksbyte är ett layoutprov; fysisk tangentbordsfunktion har eget
   fall.

**Förväntat resultat:**

- Samma fältets DOM-nod och oskickade text bevaras genom höjdändringen.
- Fält, Skicka, röstruta och svar är synliga; mikrofonen förblir på.
- Native ändring av synlig höjd bevisar inte fysisk skärmtangentbordsfunktion.

### TEXTMOBIL-03: röstrutan och notisen lämnar kartans nederkant fri

**Syfte:** Nå kartans kontroller och samtalets kontroller utan överlapp.

**Användare:** Alex.

**Förutsättningar:** Ny kontrollerad röstinstallation och osparat
Lo-förslag. Använd fallets exakta emulerade konfiguration.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-03: röstrutan och notisen lämnar kartans nederkant fri”.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-03"
  },
  "reference": "390 × 844 emulerad pekare; hörntryck, stopp och notisstängning utan överlapp.",
  "outcomes": [
    "Nå kartans kontroller och samtalets kontroller utan överlapp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Vid 390 × 844 med emulerad pekare: starta med text, slå på mikrofonen
   och stäng textvyn. Läs röstrutan utan överlapp med kartans verktyg/status.
2. Låt operatören förbereda syntetisk fjärrljudaktivitet. Aktivera Avbryt
   nära stoppikonens övre kant. Stoppkontrollen försvinner.
3. Öppna textvyn, skicka **Ett kontrollerat fel.** och låt operatören ge
   leverantörsfel. Läs felnotisen. Aktivera Stäng notisen nära dess övre kant.
   Notisen stängs och fältet finns kvar.

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

**Förutsättningar:** Ny kontrollerad röstinstallation och osparat
Lo-förslag. Använd fallets exakta emulerade konfiguration.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
testfallet “TEXTMOBIL-04: en lång notis rullar och kan stängas i kort fönster”.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-04"
  },
  "reference": "844 × 190 emulerad pekare; intern notisrullning, tangentbordsstängning och fortsatt text.",
  "outcomes": [
    "Nå notisens innehåll och stängknapp utan att tappa fältet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Vid 844 × 190 med emulerad pekare: starta med text, skicka
   **Ett kontrollerat fel.** och låt operatören ge leverantörsfel.
2. Läs notisen och rulla inuti den till slutet. Nå **Stäng notisen**
   med Tab och välj Enter. Notisen stängs trots rullningen.
3. Skriv **Fortsätt med text.** och välj Skicka. Fältet behåller fokus.

**Förväntat resultat:**

- Notisen rullar inom sin begränsade yta och flyttar inte bort fältet.
  Stängknappen går att nå och har kvar sin tryckyta på 44×44 px.
- Automation provar detta vid 844×190 px. Faktisk förstoring, fokus
  och VoiceOver med verkligt tangentbord provas separat.

### TEXTMOBIL-05: vald röstruta och kompakt textvy använder det riktiga samtalet

**Syfte:** Jämföra det levererade mobila flödet med den valda utformningen,
med samma samtal från röst till text och kort fönster.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen och Lo-förslaget.
Börja vid 390 × 844 px med pekskärmsläge och minskad rörelse. För verkligt
skärmtangentbord används en fysisk telefon; fönsterändring är ett separat
layoutprov.

**Integrationstest:**
[conversation-audit.spec.ts](../../tests/integration/conversation-audit.spec.ts),
testfallet “TEXTMOBIL-05: vald röstruta och kompakt textvy använder det
riktiga samtalet”, i gruppen “valt mobilt samtalsflöde”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-audit.spec.ts",
    "caseId": "TEXTMOBIL-05"
  },
  "reference": "390 × 844 →390 × 508 →844 × 190 →820 × 1180; samma röst-/textsession.",
  "outcomes": [
    "Jämföra det levererade mobila flödet med den valda utformningen, med samma samtal från röst till text och kort fönster."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Prata med Skyttel**, godkänn och invänta **Lyssnar**. Operatören
   levererar det talade uppdraget och håller svaret enligt separat
   förberedelse. Läs
   **Skyttel arbetar**, vågform och **Avbryt** med textvyn stängd.
2. Låt operatören leverera svaret och invänta
   **Lyssnar**. Öppna **Skriv till Skyttel**. Fältet ska inte få fokus
   av sig självt på pekskärm.
3. Tryck i fältet, skriv **Beskriv den senaste ändringen.** och skicka.
   Håll nästa modellsvar. Prova en synlig höjd på 508 px, motsvarande
   prototypens stående telefon med tangentbord. Läs den kompakta raden,
   den tidigare samtalstexten, röstrutan och fältet.
4. Prova 844 × 190 px och därefter 820 × 1180 px. Behåll fältets fokus
   genom ändringarna. Släpp nästa svar och avsluta provmiljön.

**Förväntat resultat:**

- Med textvyn stängd hör röstrutan till kartans verktyg. Röstrutan,
  kartans status och **Återställ vy** är åtkomliga utan överlappning.
  Statusordet och stoppikonen ryms på en rad.
- Vid 508 och 190 px synlig höjd syns kontextmätare, **Utkast (1)**,
  **Nytt samtal** och stängknapp i en kompakt rad. Fältet har en rad,
  behåller fokus och står under samtalstexten. Röstrutan står ovanför
  fältet. Endast fältets **Avbryt** visas under skrivet arbete.
- Vid 820 × 1180 px är textvyn ett 400 px sidofält och kartan syns
  bredvid. Kompakt läge upphör utan att fältet eller samtalet byts ut.
- Automationen fångar appens riktiga ytor efter produktionsbygge, med riktig
  server och tillfällig SQLite. Den ersätter externa modeller och medier.
  Den ritar inget tangentbord och verifierar inte fysisk mikrofon eller
  iOS-tangentbord; dessa prov återstår enligt #220.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-01"
  },
  "reference": "1600 × 900, mus; individuella bredder, dragning och pilar med bevarad native textarea/mikrofon.",
  "outcomes": [
    "Ändra en bredd med mus eller tangentbord och behålla samtalet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**
   och sedan **Visa utkastet**.
   Läs **Visa förslaget: Lo Exempel → Osparad breddprovuppgift**, stäng
   uppgifterna och slå på **Prata med Skyttel**. Skriv
   **Oskickat medan bredden ändras**
   utan att skicka.
2. Dra gränsen vid samtalstextens vänsterkant åt vänster och sedan
   gränsen vid utkastets vänsterkant åt vänster. Kontrollera fältet,
   mikrofonläget och Lo-förslaget efter varje dragning.
3. Nå **Ändra samtalstextens bredd** med Tab. Tryck vänsterpil och
   högerpil. Nå **Ändra utkastlistans bredd** och tryck högerpil.
4. Dra vardera gränsen så långt åt höger som möjligt. Dra sedan
   samtalstextens gräns långt åt vänster. Kontrollera att kartan syns.
5. Läs samma fullständiga Lo-förslag igen och stäng uppgifterna.
   Kontrollera synligt fokus på varje handtag. Faktiskt hörda namn,
   roller och värden bedöms separat i TEXTVY-05.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-02"
  },
  "reference": "1600 →850 →1600 CSS-pixlar; Alex två profiler/hushåll, Robin separat och serveromstart.",
  "outcomes": [
    "Behålla Alex bredder mellan hushåll och enheter utan att ändra Robins bredder eller skriva över valet på liten skärm."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. I Alex första profil, öppna samtal och utkast och gör båda bredderna
   tydligt större med handtagen.
2. Logga in med Google som Alex i den andra profilen. Öppna andra
   hushållet, starta med text, godkänn och öppna det tomma utkastet.
3. Minska andra fönstrets bredd till cirka 850 px. Kontrollera kartan och
   utkastet. Gör fönstret brett igen utan att använda något handtag.
4. Öka utkastbredden med vänsterpil i andra profilen. Återgå till Alex
   första fönster och kontrollera samma ändring.
5. Operatören väljer Robin enligt förberedelsen. Logga in med Microsoft
   i Robins profil. Bjud in
   Robin till Textprov enligt SAMTALSUTKAST-02. Öppna samtal och utkast
   där. Operatören återgår till Alex och startar om samma installation
   enligt förberedelsen. Ladda om Alex sida.

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

**Förutsättningar:** Samma installation. Förbered ändrade bredder med
TEXTBREDD-01 och markera utkastets startval. Operatören följer
[avstängning och återställning](text-conversation-preparation.md#otillgängligt-samtal-och-breddåterställning)
före första läsningen; ladda om sidan.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-03: bredderna återställs i Inställningar även utan
tillgängligt samtal”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-03"
  },
  "reference": "Dator utan tillgängligt samtal; sparfel och lyckad återställning behåller utkastval.",
  "outcomes": [
    "Återställa båda bredderna utan att ändra valet för utkastet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar**, **Samtal med Skyttel**. Läs **Textvyns bredd**.
2. Be operatören förbereda anslutningsfelet och invänta bekräftelse. Välj
   **Återställ bredderna** och läs återkopplingen och knappens fokus.
3. Be operatören återställa anslutningen och invänta bekräftelse.
   Använd Tab och Enter för att välja **Återställ bredderna** igen.
   Kontrollera återkoppling, fokus och utkastets startval.
4. Be operatören återställa tillgängligheten enligt förberedelsen och
   invänta bekräftelse.
   Återgå till kartan, starta med text och öppna utkastet.

**Förväntat resultat:**

- Delen säger **Gäller dig i alla dina hushåll.** och visar inga värden.
  Samtalets otillgänglighet hindrar inte återställningen.
- Vid misslyckande står **Bredderna kunde inte sparas. Försök igen.**
  Knappen och tidigare bredder finns kvar och fokus stannar på knappen.
- Vid lyckad återställning står **Bredderna är återställda**. Knappen
  försvinner, **Du har inte ändrat bredderna.** visas och fokus går till
  delens rubrik. Valet **Visa utkastet när ett samtal börjar** ändras inte.
- Samtalstext och utkast har grundbredderna 400 respektive 340 igen.
  Knappen visas bara när minst en sparad bredd skiljer sig från grundvärdet.

### TEXTBREDD-04: mobil enhet och smal skärm har inga breddhandtag

**Syfte:** Behålla mobilens och den smala skärmens layout.

**Användare:** Alex.

**Förutsättningar:** Samma installation, tidigare ändrade bredder och
ett datorfönster högst 700 px brett, stående telefon och bred surfplatta.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
testfallet “TEXTBREDD-04: mobil enhet och smal skärm har inga breddhandtag”,
referensen smal dator. Pekare har egna fall nedan.

**Separat förberedelse:**
[Hållna svar, syntetiska medier och tekniska jämförelser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-04"
  },
  "reference": "700 × 900, mus; smal datorbehållning och synlig inställningsåterställning.",
  "outcomes": [
    "Behålla mobilens och den smala skärmens layout."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Vid 700 × 900 med mus och sparade bredder 624/460: öppna textvyn
   och utkastet. Inga breddhandtag visas eller kan nås med Tab.
2. Öppna Inställningar → Samtal med Skyttel. Delen Textvyns bredd och
   **Återställ bredderna** finns för denna smala dator.
3. Avsluta utan att återställa valet. De sparade bredderna 624/460
   är oförändrade; separat tekniskt underlag jämför dem.

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
testfallet “TEXTBREDD-05: äldre hushållsarkiv lämnar personliga samtalsval
kvar”.
Aktuell export och återimport täcks även av
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-10: the downloaded current-format archive restores
shared, private and historical content after restart”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-05"
  },
  "reference": "1600 × 900; faktisk browserdownload, kompatibelt schema23 och native läsning av personliga val/private Lo.",
  "outcomes": [
    "Läsa ett kompatibelt äldre arkiv utan att återställa personliga bredder, utkastets startval eller medgivande från hushållsfilen."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/household-export-ui.spec.ts",
      "caseId": "EXPORT-10",
      "purpose": "Aktuellt arkivformat och fullständig återläsning; detta är extra underlag, inte ett andra counterpart."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta samtalet med text, markera **Fråga inte igen för det här
   hushållet** och godkänn. Öppna utkastet och ändra båda bredderna.
2. Öppna **Inställningar**, **Fullständig export**. Förbered exporten och
   hämta ZIP-filen. Låt operatören göra kompatibilitetskopian enligt
   [separat arkivförberedelse](#förbered-äldre-arkiv-vid-den-faktiska-hämtningen).
3. På **Samtal med Skyttel**, återställ bredderna och markera
   **Visa utkastet när ett samtal börjar**.
4. På **Återimportera hushållet**, välj `/tmp/skyttel-schema-23.zip`.
   Välj **Kontrollera importfil**, granska och markera **Jag vill ersätta
   allt hushållsinnehåll**. Välj **Ersätt hushållets innehåll**.
5. Läs **Samtal med Skyttel** igen och kontrollera grundbredderna,
   utkastets markerade startval och statusen **Sparat den** för Medgivande.
   Återgå till kartan, öppna textvyn och läs grundbredderna. Fäll ut Lo
   i Tabell och läs Person samt **Osparad breddprovuppgift**.
   Ta bort den tillfälliga provkopian när provet är färdigt.

**Förväntat resultat:**

- Exporten använder schemaversion 32. Personliga samtalsval och medgivande
  ingår inte i hushållsfilen; automationen granskar detta.
- En giltig schemaversion 23 går att kontrollera och återimportera genom
  gränssnittet. Lo-förslaget bevaras. Aktuell version provas också.
- Grundbredderna, det markerade startvalet och det sparade medgivandet
  finns kvar efter import. Hushållsimport skriver inte över personliga val.

## Separata kvarvarande konfigurationer

### TEXTMOBIL-06: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda smal stående vy.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-01,
vid 390 × 844, emulerad pekare CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-06"
  },
  "reference": "390 × 844, emulerad pekare CSS-pixlar; smal stående vy.",
  "outcomes": [
    "Fältet får inget automatiskt startfokus; textvyn fyller bredden.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-01:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Fältet får inget automatiskt startfokus; textvyn fyller bredden.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Fältet får inget automatiskt startfokus; textvyn fyller bredden.
- Samma synliga svar, fullständiga utkast och fokus efter Skicka bevaras.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTMOBIL-07: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda kort liggande vy.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-01,
vid 844 × 390, emulerad pekare CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-07"
  },
  "reference": "844 × 390, emulerad pekare CSS-pixlar; kort liggande vy.",
  "outcomes": [
    "Kompakt rad och fält på en rad; sidofält med karta bredvid.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-01:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Kompakt rad och fält på en rad; sidofält med karta bredvid.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Kompakt rad och fält på en rad; sidofält med karta bredvid.
- Samma synliga svar, fullständiga utkast och fokus efter Skicka bevaras.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTMOBIL-08: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda bred stående pekare.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-01,
vid 820 × 1180, emulerad pekare CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-08"
  },
  "reference": "820 × 1180, emulerad pekare CSS-pixlar; bred stående pekare.",
  "outcomes": [
    "Fast sidofält och inget automatiskt startfokus.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-01:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Fast sidofält och inget automatiskt startfokus.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Fast sidofält och inget automatiskt startfokus.
- Samma synliga svar, fullständiga utkast och fokus efter Skicka bevaras.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTMOBIL-09: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda ytterst kort smal dator.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-01,
vid 320 × 250, mus CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-09"
  },
  "reference": "320 × 250, mus CSS-pixlar; ytterst kort smal dator.",
  "outcomes": [
    "Kompakt rad och fält på en rad; inget automatiskt startfokus.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-01:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Kompakt rad och fält på en rad; inget automatiskt startfokus.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Kompakt rad och fält på en rad; inget automatiskt startfokus.
- Samma synliga svar, fullständiga utkast och fokus efter Skicka bevaras.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTMOBIL-10: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda smal kort dator.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-01,
vid 700 × 500, mus CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-10"
  },
  "reference": "700 × 500, mus CSS-pixlar; smal kort dator.",
  "outcomes": [
    "Kompakt rad, full bredd och inget automatiskt startfokus.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-01:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Kompakt rad, full bredd och inget automatiskt startfokus.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Kompakt rad, full bredd och inget automatiskt startfokus.
- Samma synliga svar, fullständiga utkast och fokus efter Skicka bevaras.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTMOBIL-11: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda bred kort pekare.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-02,
vid 1180 × 820 → 420, emulerad pekare CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-11"
  },
  "reference": "1180 × 820 → 420, emulerad pekare CSS-pixlar; bred kort pekare.",
  "outcomes": [
    "Röstrutan står ovanför sidofältet; samma nod/fokus/text genom höjdändring.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-02:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Röstrutan står ovanför sidofältet; samma nod/fokus/text genom höjdändring.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Röstrutan står ovanför sidofältet; samma nod/fokus/text genom höjdändring.
- Samma svar/utkast och fokus-/mikrofonbevarande som basfallet gäller.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTMOBIL-12: textarbete i den angivna kvarvarande storleken

**Syfte:** Skydda ytterst kort liggande pekare.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTMOBIL-02,
vid 844 × 390 → 190, emulerad pekare CSS-pixlar.

**Integrationstest:**
[mobile-conversation.spec.ts](../../tests/integration/mobile-conversation.spec.ts),
TEXTMOBIL-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/mobile-conversation.spec.ts",
    "caseId": "TEXTMOBIL-12"
  },
  "reference": "844 × 390 → 190, emulerad pekare CSS-pixlar; ytterst kort liggande pekare.",
  "outcomes": [
    "Kompakt samtalsyta med läsbart svar, fältets DOM-nod/fokus/text och mikrofon på.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTMOBIL-02:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Kompakt samtalsyta med läsbart svar, samma fält, fokus, text och
   påslagen mikrofon.
2. Fortsätt samma basföljd till dess sista steg; börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Kompakt samtalsyta med läsbart svar, fältets DOM-nod/fokus/text och mikrofon på.
- Samma svar/utkast och fokus-/mikrofonbevarande som basfallet gäller.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTBREDD-06: textvyn på den angivna emulerade pekaren

**Syfte:** Skydda smal telefonlayout.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTBREDD-04,
vid 390 × 844, emulerad pekare CSS-pixlar.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
TEXTBREDD-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-06"
  },
  "reference": "390 × 844, emulerad pekare CSS-pixlar; smal telefonlayout.",
  "outcomes": [
    "Inga handtag och ingen Textvyns bredd-inställning; sparade datorbredder ändras inte.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTBREDD-04:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Inga handtag och ingen Textvyns bredd-inställning; sparade datorbredder
   ändras inte.
2. I basfallets steg 2 saknas **Textvyns bredd** på emulerad pekare;
   återställ inget val. Fortsätt samma basföljd till dess sista steg;
   börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Inga handtag och ingen Textvyns bredd-inställning; sparade datorbredder
  ändras inte.
- De sparade datorbredderna 624/460 finns kvar efter inställningsbesöket.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

### TEXTBREDD-07: textvyn på den angivna emulerade pekaren

**Syfte:** Skydda bred pekarlayout.

**Användare:** Alex.

**Förutsättningar:** Ny installation med samma underlag som TEXTBREDD-04,
vid 1180 × 820, emulerad pekare CSS-pixlar.

**Integrationstest:**
[conversation-widths.spec.ts](../../tests/integration/conversation-widths.spec.ts),
TEXTBREDD-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-widths.spec.ts",
    "caseId": "TEXTBREDD-07"
  },
  "reference": "1180 × 820, emulerad pekare CSS-pixlar; bred pekarlayout.",
  "outcomes": [
    "Fast sidofält400, inga handtag eller Textvyns bredd-inställning; sparade datorbredder ändras inte.",
    "Hela den kvarvarande native arbetsföljden genomförs i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTBREDD-04:s steg **en gång** med den angivna konfigurationen.
   Använd denna startsida/starthöjd och, om angivet, denna minskade höjd
   i stället för basfallets. Under öppningen/storleksändringen kontrolleras:
   Fast sidofält 400, inga handtag eller Textvyns bredd-inställning; sparade
   datorbredder ändras inte.
2. I basfallets steg 2 saknas **Textvyns bredd** på emulerad pekare;
   återställ inget val. Fortsätt samma basföljd till dess sista steg;
   börja inte om från ett
   redan avslutat utkast eller en redan öppnad historiksektion.

**Förväntat resultat:**

- Fast sidofält 400, inga handtag eller Textvyns bredd-inställning; sparade
  datorbredder ändras inte.
- De sparade datorbredderna 624/460 finns kvar efter inställningsbesöket.
  Faktisk telefon, tangentbord, uppläsning eller alla storlekar påstås inte.

## Godkända dimensionsförluster

TEXTMOBIL-01 körs vid 1280 × 900 samt separata ID för 700 × 500,320 × 250,
390 × 844,820 × 1180 och 844 × 390. Endast 375 × 667 och 1180 × 820 tas bort
från just denna lägesregel. TEXTMOBIL-02 behåller 390 × 844 →508 och separata
ID för 1180 × 820 →420 och 844 × 390 →190; endast 375 × 667 →407 tas bort.
Hinder, CSS- eller fokusfel specifika för de borttagna dimensionerna kan
undgå referenserna. Detta är inte bevis på alla storlekar eller fysisk
skärmtangentbordsfunktion. Inga pensionerade ID återanvänds.

## Förbered äldre arkiv vid den faktiska hämtningen

Operatören utför följande **efter TEXTBREDD-05 steg 2** och före steg 4.
Indata är den nyss hämtade, fiktiva schema 32-filen, tillgänglig på maskinen
som kör kommandot. Ersätt dess absoluta sökväg. Utdata är en separat
schema 23-kopia; hushållsinnehåll och kontrollsummor ändras inte.

<!-- markdownlint-disable MD013 -->
```sh
TEXTBREDD_ARCHIVE=/absolute/path/skyttel-hushall.zip node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
const parts = unzipSync(readFileSync(process.env.TEXTBREDD_ARCHIVE));
const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
if (manifest.format !== 'skyttel-household' || manifest.schemaVersion !== 32)
  throw Error('En provexport med schemaversion 32 krävs');
manifest.schemaVersion = 23;
parts['manifest.json'] = Buffer.from(JSON.stringify(manifest));
writeFileSync('/tmp/skyttel-schema-23.zip', zipSync(parts), { mode: 0o600 });
JS
```
<!-- markdownlint-enable MD013 -->

Efter sista läsningen tas bara provkopian `/tmp/skyttel-schema-23.zip`
och den nedladdade fiktiva exporten bort. Återställ ingen personinställning
under importkontrollen. Ny installation används inför nästa fall.

## Mänskliga observationer

### TEXTVY-05: hörbara talare, utkast och breddhandtag

**Syfte:** Faktiskt hörda talare, tabellnavigation och handtagsvärden är
begripliga; synligt fokus och zoom bedöms på den verkliga målplattformen.

**Användare:** Alex.

**Förutsättningar:** Desktop med NVDA/Chrome eller VoiceOver/Safari, påhittat
Lo-utkast och vald skärmläsare.

**Kräver mänsklig observation:** Lyssna med NVDA eller VoiceOver efter
Du/Skyttel, utkastets tabellnavigation och handtagens hörbara namn, roller och
värden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna med NVDA eller VoiceOver efter Du/Skyttel, utkastets tabellnavigation och handtagens hörbara namn, roller och värden."
  },
  "reference": "Desktop med NVDA/Chrome eller VoiceOver/Safari, påhittat Lo-utkast och vald skärmläsare.",
  "outcomes": [
    "Faktiskt hörda talare, tabellnavigation och handtagsvärden är begripliga; synligt fokus och zoom bedöms på den verkliga målplattformen."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/text-view.spec.ts",
      "caseId": "TEXTVY-02",
      "purpose": "Semantiska talarnamn och native textarbete; provar ingen skärmläsarutmatning."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/conversation-widths.spec.ts",
      "caseId": "TEXTBREDD-01",
      "purpose": "Native tangentbord och avskiljarsemantik; provar inget hört tal."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXTVY-02 med skärmläsaren. Lyssna efter respektive talare.
2. Öppna utkastet; navigera tabellrubriker och hela ändringsrader.
3. På bred musdator: använd TEXTBREDD-01:s piltangenter på varje handtag
   och lyssna efter namn, avskiljarroll och ändrade aktuella värden.
4. Prova 200/400 procents faktisk zoom med synligt fokus och läsbarhet.

**Förväntat resultat:**

- Faktiskt hörda talare, tabellnavigation och handtagsvärden är begripliga;
  synligt fokus och zoom bedöms på den verkliga målplattformen.
- Anteckna faktiskt utfört prov separat; inga syntetiska resultat påstår
  denna observation.

### TEXTVY-06: hörbart besked vid nytt samtal

**Syfte:** Det faktiska hörbara beskedet motsvarar samtalstexten och
kvarvarande Lo-utkast. Mikrofon, ljudutgång och webbläsare anges i resultatet.

**Användare:** Alex.

**Förutsättningar:** Följ den
[gemensamma fysiska förberedelsen](../development/testing.md#physical-device-manual-preparation)
med vanlig nåbar HTTPS, leverantör och Alex som vanlig medlem. Skapa
Textprov och Lo Exempel, Person, Påhittad uppgift i ett osparat utkast.
Verkliga anrop kräver eget uttryckligt godkännande.

**Kräver mänsklig observation:** Hör Skyttels besked om nytt samtal och
kvarvarande osparad ändring genom fysisk ljudutgång, med faktisk mikrofon.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Hör Skyttels besked om nytt samtal och kvarvarande osparad ändring genom fysisk ljudutgång, med faktisk mikrofon."
  },
  "reference": "Följ den länkade fysiska förberedelsens vanliga HTTPS-/leverantörs-/medlemsingång; skapa Textprov och samma osparade Lo-förslag. Verkliga anrop kräver eget uttryckligt godkännande.",
  "outcomes": [
    "Det faktiska hörbara beskedet motsvarar samtalstexten och kvarvarande Lo-utkast. Mikrofon, ljudutgång och webbläsare anges i resultatet."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/text-view.spec.ts",
      "caseId": "TEXTVY-03",
      "purpose": "Kommentarspaket, mikrofonläge och privat utkast; syntetiska spår bevisar inget hört besked."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ den gemensamma fysiska förberedelsen med vanlig HTTPS-ingång och
   de exakta Lo-uppgifterna ovan.
   [TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
   anger också målplattformarnas ljud- och mikrofonkontroller.
2. Anslut fysisk mikrofon och ljudutgång. Välj **Prata med Skyttel**,
   godkänn samtalet och tillåt mikrofonen. Öppna textvyn och välj
   **Nytt samtal**. Använd **Starta ljudet** om uppspelning blockeras.
3. Kontrollera att Skyttel hörbart säger att ett nytt samtal börjar och
   att en osparad ändring ligger kvar i utkastet. Kontrollera samtidigt
   samma besked i samtalstexten och kvarvarande Lo-förslag.
4. Anteckna faktiskt hört resultat, mikrofon, ljudutgång och webbläsare
   separat från det kontrollerade provet. Detta lyssningsprov återstår
   tills en människa har utfört det; integrationstestet provar inte ljudet.

**Förväntat resultat:**

- Det faktiska hörbara beskedet motsvarar samtalstexten och kvarvarande
  Lo-utkast. Mikrofon, ljudutgång och webbläsare anges i resultatet.
- Anteckna faktiskt utfört prov separat; inga syntetiska resultat påstår
  denna observation.

### TEXTMOBIL-13: fysiskt skärmtangentbord, rotation och tryck

**Syfte:** Fysisk inmatning behåller text/fokus och nåbara kontroller utan
oavsiktlig mikrofonändring; tangentbord, rotation och verkliga tryck bedöms
separat från syntetiska viewports.

**Användare:** Alex.

**Förutsättningar:** Vanlig nåbar HTTPS-installation med konfigurerad
leverantör, vanlig Alex-medlem och exakt fiktivt osparat Lo-förslag enligt den
länkade fysiska förberedelsen.

**Kräver mänsklig observation:** Använd en faktisk iPhone/iPad: öppna och dölj
OS-skärmtangentbordet, rotera enheten och tryck fält, Skicka, Avbryt och Stäng
notisen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Använd en faktisk iPhone/iPad: öppna och dölj OS-skärmtangentbordet, rotera enheten och tryck fält, Skicka, Avbryt och Stäng notisen."
  },
  "reference": "Vanlig nåbar HTTPS-installation med konfigurerad leverantör, vanlig Alex-medlem och exakt fiktivt osparat Lo-förslag enligt den länkade fysiska förberedelsen.",
  "outcomes": [
    "Fysisk inmatning behåller text/fokus och nåbara kontroller utan oavsiktlig mikrofonändring; tangentbord, rotation och verkliga tryck bedöms separat från syntetiska viewports."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/mobile-conversation.spec.ts",
      "caseId": "TEXTMOBIL-02",
      "purpose": "Native viewport/nod/fokus/text och mikrofon; provar inget fysiskt OS-tangentbord."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered enligt
   [vanlig fysisk enhet](../development/testing.md#physical-device-manual-preparation).
   Använd Person Lo Exempel med Påhittad uppgift osparad; noll sparanden.
2. Öppna textvyn. Tangentbordet ska öppnas först vid faktiskt tryck i fältet.
   Skriv Ett vanligt uppdrag. och rotera medan tangentbordet är öppet.
3. Kontrollera oskickad text, faktisk fokusmarkering, nåbart fält/Skicka,
   minst en läsbar samtalsrad och röstrutans placering. Skicka och läs svar.
4. Dölj/öppna tangentbordet, slå på mikrofonen och prova båda riktningarna
   på telefon och surfplatta. Prova stopp-/stängmål nära deras kanter.
5. Bedöm 200/400 procents zoom och, med VoiceOver, den faktiska läsordningen.
   Anteckna varje enhet separat; återställ fiktivt utgångsläge och städa
   enligt samma HTTPS-guide efter varje variant.

**Förväntat resultat:**

- Fysisk inmatning behåller text/fokus och nåbara kontroller utan oavsiktlig
  mikrofonändring; tangentbord, rotation och verkliga tryck bedöms separat
  från syntetiska viewports.
- Anteckna faktiskt utfört prov separat; inga syntetiska resultat påstår
  denna observation.

## Textknappens markeringar

För TEXTBRICKA-01–05 används den kontrollerade röstinstallationen enligt
[röstguiden](voice-assistant.md#controlled-voice-fixture). Skapa ett nytt
hushåll med tomt utkast; kör inte `seed-family`. Välj **Skriv till Skyttel →
Nytt samtal → Godkänn och starta** för besöket. Terminalens `pending` visar
det hållna modellanropet.
Släpp ett vanligt svar med `reply REQUEST TEXT`. Börja med en ny installation
inför varje fall. Fysisk skärmläsare och röststyrning provas separat; de tysta
mediespåren bevisar ingen uppläsning.

### TEXTBRICKA-01: arbete och oläst svar

**Syfte:** Följa ett skrivet uppdrag utan att öppna textvyn.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen, mikrofonen av och svaret hålls.

**Integrationstest:**
[text-button-status.spec.ts](../../tests/integration/text-button-status.spec.ts)
, TEXTBRICKA-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-button-status.spec.ts",
    "caseId": "TEXTBRICKA-01"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller statusförekomst bedöms separat.",
  "outcomes": [
    "Följa ett skrivet uppdrag utan att öppna textvyn."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för TEXTBRICKA-01](voice-controls-preparation.md#tidslinje-textbricka-01)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Beskriv mitt utkast.** och stäng textvyn. Läs arbetsmarkeringen och
   knappens namn.
2. När det förberedda svaret **Det privata utkastet är fortfarande osparat.**
   kommer, läs tre punkter och knappens nya namn. Granska separat DOM-status
   enligt förberedelsen.
3. Öppna **Din profil** och välj **Tillbaka till arbetet**. Kontrollera fokus
   på samma textknapp.
4. Öppna textvyn, läs hela svaret och stäng den. Knappens vanliga namn
   återkommer.

**Förväntat resultat:**

- Verktygsraden och knappens mått flyttas inte. Fokus stannar på knappen.
- Markeringen finns bara med stängd textvy. Ett redan läst svar ger ingen ny
  bricka när textvyn stängs igen.

### TEXTBRICKA-02: oläst fråga med mikrofonen av

**Syfte:** Visa den uttryckliga frågesignalen utan en konkurrerande röstruta.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen och mikrofonen av.

**Integrationstest:**
[text-button-status.spec.ts](../../tests/integration/text-button-status.spec.ts)
, TEXTBRICKA-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-button-status.spec.ts",
    "caseId": "TEXTBRICKA-02"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller statusförekomst bedöms separat.",
  "outcomes": [
    "Visa den uttryckliga frågesignalen utan en konkurrerande röstruta."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för TEXTBRICKA-02](voice-controls-preparation.md#tidslinje-textbricka-02)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Red ut vilken Lo som avses.** och stäng textvyn.
2. När den förberedda frågan **Vilken person avses med Lo?** kommer, läs
   frågetecknet och namnet **Skriv till Skyttel. Skyttel väntar på ditt svar.**
   .
3. Slå på mikrofonen: röstrutan ersätter brickan. Slå av igen: samma olästa
   bricka återkommer. Inga tidigare frågor överförs till rösten igen.
4. Öppna textvyn, läs frågan och stäng den. Den lästa frågan ger ingen bricka.

**Förväntat resultat:**

- Frågesymbolen skiljer sig från tre punkter och arbetsmarkeringen.
- Mikrofonens läge ändrar inte frågan. Lästa frågor ger ingen ny markering.

### TEXTBRICKA-03: röstruta och en enda brickstatusförekomst

**Syfte:** Behålla en oläst förekomst vid byte mellan röst och text.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen, mikrofonen av och svaret hålls.

**Integrationstest:**
[text-button-status.spec.ts](../../tests/integration/text-button-status.spec.ts)
, TEXTBRICKA-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-button-status.spec.ts",
    "caseId": "TEXTBRICKA-03"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller statusförekomst bedöms separat.",
  "outcomes": [
    "Behålla en oläst förekomst vid byte mellan röst och text."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för TEXTBRICKA-03](voice-controls-preparation.md#tidslinje-textbricka-03)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Beskriv mitt utkast.**, stäng textvyn och låt det förberedda
   **Det första svaret.** komma. Läs tre punkter.
2. Slå på och av mikrofonen två gånger. Brickan döljs av röstrutan och
   återkommer utan en ny DOM-status för samma svar.
3. Slå på mikrofonen och låt förberedelsens **Beskriv kartan.** börja arbeta.
   Slå av mikrofonen under arbetet. Läs **Skyttel arbetar** utan
   textarbetsmarkering.
4. Låt **Det talade svaret.** komma, öppna textvyn och läs även den raden.

**Förväntat resultat:**

- Bara skrivet arbete får textknappens arbetsmarkering.
- Röstrutan och svarsbrickan konkurrerar inte. En oläst förekomst annonseras en
  gång även när röstrutan visas och försvinner igen.

### TEXTBRICKA-04: minskad rörelse, teman och knappmått

**Syfte:** Kunna urskilja markeringarna utan färg eller rörelse.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen och ett skrivet svar hålls.

**Integrationstest:**
[text-button-status.spec.ts](../../tests/integration/text-button-status.spec.ts)
, TEXTBRICKA-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-button-status.spec.ts",
    "caseId": "TEXTBRICKA-04"
  },
  "reference": "Chromium 390 × 844, ljust tema; emulerad minskad rörelse och återställd normal rörelse.",
  "outcomes": [
    "Kunna urskilja markeringarna utan färg eller rörelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för TEXTBRICKA-04](voice-controls-preparation.md#tidslinje-textbricka-04)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Välj emulerad minskad rörelse, 390 × 844 och ljust tema före första native
   handlingen.
2. Skicka **Beskriv mitt utkast.**, stäng textvyn och välj
   **Visa verktygens namn**. Läs namnet och den stilla arbetsmarkeringen.
3. Avaktivera minskad rörelse: arbetsmarkeringen roterar. Aktivera igen: den
   står stilla utan övergång.
4. Låt **Ett nytt svar.** komma. Tre punkter ersätter arbetsformen utan att
   flytta verktygen.
5. Granska kontrast och synlig fokusram. Fysisk zoom, rörelsebedömning och
   formigenkänning hör till TEXTBRICKA-10.

**Förväntat resultat:**

- Former och namn skiljer tillstånden åt utan färg. Minskad rörelse följer
  operativsystemet; ingen särskild inställning i Skyttel behövs.
- Markeringarna ändrar inte knappens tryckyta eller verktygsradens geometri.

### TEXTBRICKA-05: köat arbete och avbrott

**Syfte:** Ge pågående textarbete företräde över ett tidigare oläst svar.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen på bred dator och mikrofonen av.

**Integrationstest:**
[text-button-status.spec.ts](../../tests/integration/text-button-status.spec.ts)
, TEXTBRICKA-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-button-status.spec.ts",
    "caseId": "TEXTBRICKA-05"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller statusförekomst bedöms separat.",
  "outcomes": [
    "Ge pågående textarbete företräde över ett tidigare oläst svar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för TEXTBRICKA-05](voice-controls-preparation.md#tidslinje-textbricka-05)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Beskriv mitt utkast.** och **Beskriv sedan kartan.**. Det andra
   meddelandet väntar. Stäng textvyn.
2. Låt **Första svaret är klart.** komma medan det andra anropet hålls.
   Arbetsmarkeringen fortsätter utan svarsbricka.
3. Öppna textvyn, läs första svaret och tryck Escape i meddelandefältet. Läs
   avbrottstexten och stäng vyn.
4. Låt det sena **Det avbrutna svaret.** levereras enligt förberedelsen. Öppna
   textvyn: det sena svaret ska saknas. Stäng igen.

**Förväntat resultat:**

- Arbete går före olästa svar. Ett talat uppdrag får aldrig textarbetsmarkering.
- Avbrott och avslutat arbete tar bort arbetsmarkeringen. Ett sent avbrutet svar
  får ingen bricka, och ett nytt samtal börjar utan gamla markeringar.

## Bedömning och återstående manuella prov

Flödet är utformat mot WCAG 2.2 nivå AA. Kraven nedan är designmål, och
automationen visar bara det som anges. Ingen skärmläsare och ingen fysisk enhet
är provad, och fullständig överensstämmelse intygas inte.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning | Automatisk kontroll | Återstår att prova manuellt |
| --- | --- | --- | --- |
| 1.3.1, 4.1.2 Namn, roll och relationer | Textvyn är en region med rubriken **Skriv till Skyttel** som namn. Samtalstexten är en logg med namnet **Samtalstext**. Varje rad börjar med en dold talare, **Du:** eller **Skyttel:**. **Skriv till Skyttel** säger med sitt utfällda läge om textvyn är öppen. | Namn på region, logg, fält och knappar, dolda talare och knappens läge. | Uppläsning med NVDA och VoiceOver, och hur loggens nya rader erbjuds som DOM-status. |
| 1.3.2, 2.4.3 Ordning och fokus | Rubriken, **Nytt samtal** och **Stäng textvyn** står först, samtalstexten därefter och fältet sist. På dator får fältet fokus när textvyn öppnas, och **Stäng textvyn** ger fokus till **Skriv till Skyttel**. På mobil enhet och smal skärm stannar fokus i verktygsraden eller går till rubriken. | Fokus vid öppning på dator och pekskärm, efter **Skicka** och efter stängning. | Fokusordning med skärmläsare och på fysisk pekskärm. |
| 1.4.1 Färg | Din text står i en tonad ruta med kant. Talaren finns också i text för hjälpmedel. | Rutan och den dolda talaren. | – |
| 1.4.3, 1.4.11 Kontrast | Textvyn använder kartans färger för text, ytor, kanter och fokus i ljust och mörkt tema. | Ingen. | Kontrast för samtalstexten, platshållaren och den tonade rutan i båda teman. |
| 1.4.4, 1.4.10 Förstoring och omflöde | På smal skärm fyller textvyn skärmen under verktygsraden, och bara samtalstexten rullar. | Textvyn ryms på 390 px utan rullning i sidled, med rubrik, fält och **Skicka** synliga. | Verklig webbläsarzoom och textförstoring. |
| 2.1.1 Tangentbord | Alla kontroller nås med Tab. Retur skickar, och Skift+Retur ger en ny rad. | Skicka med Retur och ny rad med Skift+Retur. | Hjälpmedlens egna tangentkommandon. |
| 2.5.8 Pekmål | **Stäng textvyn** är 44 px. **Nytt samtal** och **Skicka** är minst 36 px höga. | Tryck på fältet och **Skicka** på pekskärm. | Träffsäkerhet på fysisk pekskärm. |
| 3.3.2 Etiketter | Fältet har etiketten **Meddelande till Skyttel**, dold visuellt i kort läge. | Fältets namn och platshållare även efter ändrad synlig höjd. | Uppläsning i kort läge. |
<!-- markdownlint-enable MD013 -->

Mobilfallen verifierar även omflöde utan horisontell rullning (1.4.10), namn på
dolda etiketter och den kompakta utkastknappen (1.3.1, 4.1.2), bevarat fokus och
nåbar stängknapp efter rullning (2.4.3, 2.4.11) samt 44 px tryckyta utan
förändrad symbol (2.5.8). Läsordningen och det synliga fokuset på verklig iPhone
och iPad, kontrast i båda teman och 200/400 procents zoom återstår att
kontrollera. Emulerade skärmstorlekar och en ändring av webbläsarens synliga
höjd bevisar inte ett fysiskt skärmtangentbord eller fullständig
överensstämmelse.

Breddhandtagen har namn, avskiljarroll, orientering, styrd region och
aktuellt/minsta/största värde (1.3.1, 4.1.2). Tab och piltangenter ger
tangentbordsåtkomst och ett alternativ till dragning (2.1.1, 2.5.7). Handtagens
träffyta är 24 px bred (2.5.8), och fokus markeras i kartans accentfärg (2.4.7,
1.4.11). Återställning ger artig återkoppling och rubrikfokus när knappen
försvinner (2.4.3, 4.1.3). Automationen kontrollerar namn, roller, värden,
dragning, piltangenter, bevarat fokus och text samt återställningens fokus.
Verklig skärmläsaruppläsning, kontrast i båda teman och omflöde vid 200/400
procents zoom återstår. Detta är designmål och avgränsade kontroller, inte ett
intyg om fullständig WCAG-överensstämmelse.

Textknappens ändrade flöde har följande WCAG 2.2 AA-designmål:

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning och automatiskt prov | Återstående mänsklig verifiering |
| --- | --- | --- |
| 1.1.1, 1.3.1, 1.4.1, 4.1.2 | Dekorativa former är dolda; namnet beskriver arbete, svar eller fråga. Ring, punkter och frågetecken skiljer sig utan färg. | Symbolernas begriplighet och uppläsning på verkliga enheter. |
| 1.4.3, 1.4.11, 1.4.10, 2.5.8 | Brickans textkontrast är minst 4,5:1 i båda teman; verktygsrad och minst 44 px knappmål behåller måtten vid 390 och 1280 px. | Förstoring, kantkontrast och fysisk pekskärm. |
| 2.2.2, 2.3.1 | Arbetsmarkering är framsteg under användarens uppdrag, som kan avbrytas; minskad rörelse gör den stilla. Inga blinkningar. | Verkliga rörelseinställningar och upplevd animation. |
| 2.4.3, 2.4.7, 2.5.3 | Samma synliga prefix och kontroll bevaras; status flyttar inte fokus eller verktyg. | NVDA, VoiceOver, röststyrning och synligt fokus vid zoom. |
| 4.1.3 | En artig region annonserar varje ny oläst förekomst en gång. Inget autonomt arbetsnamn eller svar med stängd textvy. | Faktiskt hörbar turordning och frånvaro av dubbla uppläsningar. |
<!-- markdownlint-enable MD013 -->

Proven använder riktig server och tillfällig SQLite. Kontrollerade modell- och
mediesvar, DOM-uppläsningar och emulerade fönstermått visar inte fullständig
WCAG-överensstämmelse. Fysisk mikrofon, skärmläsare, röststyrning, zoom och
pekskärm återstår enligt #220.

## Separata brickkonfigurationer och observationer

TEXTBRICKA-04 och 08 kör hela flödet mot en verklig kontrollerad server vid
390 px i ljust tema respektive 1280 px i mörkt tema. TEXTBRICKA-06 och 07
behåller sina identiteter för motsvarande presentation i Chromium med
kontrollerade svar vid hushållskartans publika anropsgräns. Dessa två
webbläsarfall visar inte serverns medgivandekontroll, verklig
leverantörskörning eller beständigt sparande. Hela HTTP-flödet körs därmed
inte längre separat vid 390 px mörkt och 1280 px ljust; alla fyra
bredd- och temakombinationer har kvar presentationskontroller.

### TEXTBRICKA-06: minskad rörelse vid 390 i mörkt tema

**Syfte:** Behålla arbets- och svarsmarkeringarnas presentation i denna
konfiguration.

**Användare:** Alex.

**Förutsättningar:** Välj 390 × 844, mörkt tema och minskad rörelse före
första UI-handlingen. Textsvaret kan hållas och släppas separat.

**Automatiskt motsvarande webbläsartest:**
[text-button-status.test.tsx](../../tests/browser/text-button-status.test.tsx)
, TEXTBRICKA-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/text-button-status.test.tsx",
    "caseId": "TEXTBRICKA-06"
  },
  "reference": "Chromium 390 × 844, mörkt tema; verklig hushållskarta och produktionsstilar, kontrollerade textsvar och emulerad minskad/normal rörelse. Ingen verklig HTTP-kontroll av medgivande eller beständigt sparande.",
  "outcomes": [
    "Arbets- och svarsformer ändrar varken knappmått eller verktygsplacering.",
    "Markeringen är läsbar och respekterar den emulerade rörelseinställningen.",
    "Det färdiga svaret går att läsa i textvyn och släcker den olästa markeringen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [TEXTBRICKA-04](#textbricka-04-minskad-rörelse-teman-och-knappmått) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Öppna textvyn och läs **Ett nytt svar.**. Kontrollera att svarsmarkeringen
   försvinner från textknappen.

**Förväntat resultat:**

- Arbets- och svarsformer ändrar varken knappmått eller verktygsplacering.
- Markeringen är läsbar och respekterar den emulerade rörelseinställningen.
- Svaret är läsbart i textvyn. När svaret läses släcks den olästa markeringen.

### TEXTBRICKA-07: minskad rörelse vid 1280 i ljust tema

**Syfte:** Behålla arbets- och svarsmarkeringarnas presentation i denna
konfiguration.

**Användare:** Alex.

**Förutsättningar:** Välj 1280 × 844, ljust tema och minskad rörelse före
första UI-handlingen. Textsvaret kan hållas och släppas separat.

**Automatiskt motsvarande webbläsartest:**
[text-button-status.test.tsx](../../tests/browser/text-button-status.test.tsx)
, TEXTBRICKA-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/text-button-status.test.tsx",
    "caseId": "TEXTBRICKA-07"
  },
  "reference": "Chromium 1280 × 844, ljust tema; verklig hushållskarta och produktionsstilar, kontrollerade textsvar och emulerad minskad/normal rörelse. Ingen verklig HTTP-kontroll av medgivande eller beständigt sparande.",
  "outcomes": [
    "Arbets- och svarsformer ändrar varken knappmått eller verktygsplacering.",
    "Markeringen är läsbar och respekterar den emulerade rörelseinställningen.",
    "Det färdiga svaret går att läsa i textvyn och släcker den olästa markeringen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [TEXTBRICKA-04](#textbricka-04-minskad-rörelse-teman-och-knappmått) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Öppna textvyn och läs **Ett nytt svar.**. Kontrollera att svarsmarkeringen
   försvinner från textknappen.

**Förväntat resultat:**

- Arbets- och svarsformer ändrar varken knappmått eller verktygsplacering.
- Markeringen är läsbar och respekterar den emulerade rörelseinställningen.
- Svaret är läsbart i textvyn. När svaret läses släcks den olästa markeringen.

### TEXTBRICKA-08: minskad rörelse vid 1280 i mörkt tema

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 1280 × 844 och mörkt tema före
första UI-handlingen.

**Integrationstest:**
[text-button-status.spec.ts](../../tests/integration/text-button-status.spec.ts)
, TEXTBRICKA-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-button-status.spec.ts",
    "caseId": "TEXTBRICKA-08"
  },
  "reference": "Chromium 1280 × 844, mörkt tema; emulerad minskad rörelse och normal rörelse.",
  "outcomes": [
    "Arbets- och svarsformer ändrar varken knappmått eller verktygsplacering.",
    "Markeringen är läsbar och respekterar den emulerade rörelseinställningen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [TEXTBRICKA-04](#textbricka-04-minskad-rörelse-teman-och-knappmått) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Arbets- och svarsformer ändrar varken knappmått eller verktygsplacering.
- Markeringen är läsbar och respekterar den emulerade rörelseinställningen.

### TEXTBRICKA-09: faktiskt hörda olästa svar och frågor

**Syfte:** Hör en ny oläst förekomst en gång, utan att själva svaret läses när
textvyn är stängd.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör en ny oläst förekomst en gång, utan att
själva svaret läses när textvyn är stängd.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör en ny oläst förekomst en gång, utan att själva svaret läses när textvyn är stängd."
  },
  "reference": "NVDA/Chrome Windows och VoiceOver/Chrome macOS/iPhone/iPad.",
  "outcomes": [
    "Varje ny oläst förekomst hörs en gång; gamla svar och frågor dubbleras inte.",
    "Svar, fråga och mikrofonläge är begripliga med faktiskt provat hjälpmedel."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett riktigt textsamtal med mikrofonen av. Skicka ett uppdrag och stäng
   textvyn. Hör arbets-/svarsnamn och kontrollera att fokus ligger kvar.
2. Slå på och av mikrofonen två gånger utan att öppna textvyn. Den samma olästa
   förekomsten får inte läsas igen.
3. Öppna textvyn, läs svaret och stäng igen. Upprepa med en nödvändig fråga och
   bedöm rätt turordning.

**Förväntat resultat:**

- Varje ny oläst förekomst hörs en gång; gamla svar och frågor dubbleras inte.
- Svar, fråga och mikrofonläge är begripliga med faktiskt provat hjälpmedel.

### TEXTBRICKA-10: fysisk inmatning zoom och symboler

**Syfte:** Bedöm träffsäkerhet, röststyrning, verklig zoom och minskad rörelse
på faktisk utrustning.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Bedöm träffsäkerhet, röststyrning, verklig zoom
och minskad rörelse på faktisk utrustning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Bedöm träffsäkerhet, röststyrning, verklig zoom och minskad rörelse på faktisk utrustning."
  },
  "reference": "Windows/macOS/iPhone/iPad; båda teman och OS-inställning.",
  "outcomes": [
    "Brickans betydelse och kontroller är begripliga och nåbara på provad enhet.",
    "Faktiskt rörelse-/zoomresultat och röststyrning redovisas separat."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Med fysisk pekning/tangentbord och röststyrning, skicka ett uppdrag med
   stängd textvy och öppna svaret igen.
2. Prova 200/400 procents zoom, båda teman och faktisk minskad rörelse.
   Kontrollera synligt fokus, namn och nåbara knappmål.
3. Jämför ring, tre punkter och frågetecken utan att använda färg som enda
   skillnad.

**Förväntat resultat:**

- Brickans betydelse och kontroller är begripliga och nåbara på provad enhet.
- Faktiskt rörelse-/zoomresultat och röststyrning redovisas separat.

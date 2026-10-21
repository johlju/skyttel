# Manuella testfall för samtal med Skyttel

Fallen provar samlat utkast, rättelse och sparande, sena svar, avbrott,
kvittoåterhämtning, begärda samtalsdetaljer och faktisk markering.
Anteckna commit, webbläsare,
modell eller kontrollerad ersättare samt godkänt eller underkänt resultat.
De länkade integrationstesterna verifierar de kontrollerade flödena.
Stegen här är stöd för felsökning; automatiken kräver ingen manuell upprepning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Textprov.
- I den kontrollerade miljön väljs Google för lokal testinloggning utan
  externa konton. I verkligt modellprov använder Alex sin konfigurerade
  inloggning men enbart påhittat hushållsinnehåll.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Öppna **Tabell → Redigera [objektets namn]** för ett befintligt objekt.
Samband nås genom **Samband för [namn]**. Formulär är modala; oskickade
uppgifter ligger kvar där medan redan startat arbete fortsätter. En ny
interaktion med textvyn kräver att formuläret först lämnas uttryckligen.
Escape visar **Lämna ändrade uppgifter?**. **Fortsätt redigera** behåller
alla värden. **Kasta ändringarna och fortsätt** lämnar bara det oskickade
formuläret; befintliga förslag i utkastet påverkas inte.

1. TEXT-01 använder familjeunderlaget i
   [separat förberedelse](text-conversation-preparation.md#familjerättelsen).
   Övriga fall använder den
   [kontrollerade startguiden](#controlled-text-fixture).
   Den senare håller varje modellsvar tills du släpper det i terminalen.
   Den provar inte en verklig modells svenska språkförståelse.
2. För övriga fall: skapa hushållet Textprov. Skapa objektet **Lo Exempel** av typen
   **Person**, med beskrivningen **Påhittad uppgift**, genom formuläret.
   Välj **Lägg i utkastet och stäng** och lämna förslaget osparat.
3. När fallet inte anger en egen samtalsstart: välj **Skriv till Skyttel →
   Nytt samtal** och **Godkänn och starta**. Övriga fall anger starten i
   sina steg.
   [Samtalsmedgivandet](conversation-consent.md) har egna testfall.
4. Starta en ny tom kontrollerad installation mellan TEXT-02 till TEXT-09.
   Behåll samma databas under ett omstartsprov. Avsluta med `quit` och
   stäng provfönstret enligt startguidens städningssteg.

## Samtal och samlat sparande

### TEXT-01: familjeärendet sparas samlat med bevarad oskickad formulärtext

**Syfte:** Fortsätta ett befintligt utkast och spara en tydlig rättelse
utan extra ja, med ett riktigt kvitto.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Det exakt förberedda familjeunderlaget enligt separat
förberedelse, före inloggning. Ingen verklig API-nyckel krävs.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-01: familjeärendet sparas samlat med bevarad oskickad
formulärtext”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-01"
  },
  "reference": "Kontrollerat familjeunderlag på dator; samtidig konflikt och oskickat objektformulär.",
  "outcomes": [
    "Fortsätta ett befintligt utkast och spara en tydlig rättelse utan extra ja, med ett riktigt kvitto."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Börja med det kontrollerade, fullständiga familjeunderlaget. Öppna textvyn,
   godkänn, öppna utkastet och läs Lo-förslaget med samtidig konflikt.
2. Skicka **Behåll Lo-förslaget, rätta priset till 189 kr och spara.** Håll
   svaret enligt separat förberedelse. Stäng textvyn och välj **Tabell →
   Redigera Kim Exempel**. Skriv **Osänd text som ska finnas kvar** i
   Beskrivning utan att lägga den i utkastet.
3. Låt operatören släppa rättelsen och sparandet. Läs samma oskickade text.
   Tryck Escape, välj **Fortsätt redigera**, läs igen och lämna sedan med
   **Kasta ändringarna och fortsätt**.
4. Läs **Sparat.** i textvyn och det tomma utkastet. Fäll ut
   **Familjens Molnmusik** i Tabell och läs **Familjeabonnemang 189 kr per
   månad.**, pris 189, valuta SEK och intervall månad. Fäll ut **Lo Lind**
   och läs **Spelar piano i musikföreningen.**
5. Öppna **Rapporter → Ändringshistorik**, senaste familjerättelsen och
   **Visa ändringarna**. Läs Lo Lind, 189 SEK per månad och
   `musik@example.test`. De skilda rollerna och kunskapsstatusarna hör till
   det kompletta förberedda familjeunderlaget; tidigare kvitton finns kvar.

**Förväntat resultat:**

- Hela det beständiga utkastet sparas samlat. Ett extra ja krävs inte
  enbart därför att rättelsen ändrar version. Osäker identitet eller
  samtidig konflikt måste däremot redas ut före ett nytt sparbesked.
- Statusen bekräftar ett beständigt kvitto. Pris är 189 kr och de olika
  rollerna samt uppgifternas kunskapsstatus bevaras utan antagna fakta.
- Oskickad formulärtext finns kvar och har inte blivit del av sparandet.
- Dokumentera verklig modellförståelse separat från CI:s deterministiska
  verifiering. Ingen sådan mänsklig körning påstås här vara genomförd.

## Kontrollerade sena svar och fel

### TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte nytt arbete

**Syfte:** Ett äldre uppdrag får inte återinföra ett kastat förslag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Terminalen håller modellsvar.
Datorfönstret är bredare än 700 px.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte
nytt arbete”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-02"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Ett äldre uppdrag får inte återinföra ett kastat förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta med text och skicka **Rätta namnet.** Läs **Skyttel arbetar**.
   Välj **Kasta hela utkastet** medan operatören håller svaret.
2. Låt operatören släppa det gamla förslaget. Läs felnotisen och tomt utkast.
3. Skicka **Skapa ett nytt förslag.** När nästa svar hålls, tryck Escape
   med fokus i meddelandefältet. Släpp det sena svaret. Läs avbrottsbeskedet
   och tomt utkast; inget **För sent** har lagts tillbaka.
4. Fortsätt genom det vanliga objektformuläret med ett nytt förslag och
   kontrollera att endast detta nya arbete läggs i utkastet.

**Förväntat resultat:**

- Pågående status syns medan svaret hålls. Den gamla versionen avvisas
  efter kastandet, och aktuellt underlag visas för nästa besked.
- Det avbrutna uppdraget lägger inte tillbaka något. Nya formulär fungerar.
- Ett avbrott påstås aldrig ångra ett redan genomfört sparande.

### TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet tillgängligt

**Syfte:** Det verkliga meddelandet styr tillåtelsen att spara och ett
leverantörsfel förstör inte utkastet.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns osparat.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet
tillgängligt”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-03"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Det verkliga meddelandet styr tillåtelsen att spara och ett leverantörsfel förstör inte utkastet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Spara inte.**, **Vad händer om vi sparar?**, **Spara ej.**,
   **Spara senare.** och **Skriv ”spara” i beskrivningen.**, ett i taget.
   Låt operatören försöka spara efter varje meddelande. Vänta på den
   uttryckliga felnotisen före nästa meddelande.
2. Skicka **Beskriv mitt utkast.** och låt operatören ge leverantörsfel.
   Läs felnotisen och kvarvarande Lo-förslag.
3. Stäng textvyn, välj **Tabell → Redigera Lo Exempel**, rätta Namn till
   **Lo Lind** och välj **Lägg i utkastet och stäng**. Läs Lo Lind med
   oförändrad **Påhittad uppgift** i utkastets fullständiga uppgifter.

**Förväntat resultat:**

- Ingen av de nekade, hypotetiska, uppskjutna eller citerade begärandena
  sparar kartan, även när ersättaren försöker anropa sparverktyget.
- Modellfelet visas begripligt. Utkastet och vanligt formulärarbete finns
  kvar. Provet är ett kontrollerat verktygsprov, inte bevis på språkförståelse.

## Kvitton och faktisk visning

### TEXT-04: ett tappat sparbesked återfinns efter omstart utan dubbelt sparande

**Syfte:** Återfinna ett genomfört sparande när webbläsaren saknar svaret.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Chrome utvecklarverktyg är öppna.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-04: ett tappat sparbesked återfinns efter omstart utan
dubbelt sparande”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-04"
  },
  "reference": "Dator; faktisk202, native UUID, genomförd transaktion, tappat svar och samma databas efter restart.",
  "outcomes": [
    "Återfinna ett genomfört sparande när webbläsaren saknar svaret."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/text-assistant.spec.ts",
      "title": "manual text launcher public preparation seeded rejects an unaccepted delivery",
      "purpose": "Publik textstart med ett verkligt Lo-förslag: saknad session ger 404/not-accepted, oförändrat utkast, inga sparförsök, återställd leveranskontroll efter omladdning och borttagen provkatalog. Tomt utkast provas inte längre oberoende."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta med text. Låt operatören arma faktisk svarsförlust före
   **Spara hela utkastet nu.** Skicka meddelandet. Låt operatören genomföra
   sparandet och tappa svaret först efter riktig commit. Läs
   **Det är oklart om utkastet sparades. Skyttel kontrollerar det.**
2. Låt operatören starta om samma server och databas. Ladda om sidan och
   öppna textvyn. Gör inget nytt sparförsök.
3. Öppna **Rapporter → Ändringshistorik**, läs det enda sparandet med Lo.
   Öppna **Identifiera sparandet och användaren**. Läs det visade sparandet,
   användaren och tidpunkten. Låt operatören utföra den separata tekniska
   jämförelsen efter denna läsning, före nästa steg.
4. Öppna **Visa ändringarna** och läs **Person**, **Lo Exempel** och
   **Påhittad uppgift** efter sparandet. Återgå till arbetet och kontrollera
   det tomma utkastet.

**Förväntat resultat:**

- Frånkopplingen visas som bruten kontakt eller oklart sparande.
  Det betyder inte att sparandet
  misslyckades. Omstart bevarar det genomförda försöket och dess enda kvitto.
- Den automatiska kontrollen återfinner kvittot med ursprungligt ID.
  Ingen extra kopia eller
  nytt sparande behövs. Den kontrollerade browserleveransen tappar accepterat
  textsvar först
  efter genomfört sparande; offlineläge används inte som ersättning.

**Separat tekniskt underlag:** Den publika textstartens avvisningsprov
behåller ett faktiskt Lo-förslag. Det provar saknad session, oförändrat
utkast, inga sparförsök samt återställning och städning enligt
[förberedelsens avvisningsgräns](text-conversation-preparation.md#avvisad-leverans-med-befintligt-utkast).
Det oberoende avvisningsprovet från tomt utkast ingår inte längre.

### TEXT-05: markering kräver visning och skyddar oskickad text

**Syfte:** Markeringsbesked ska motsvara ett faktiskt visat urval.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och inget formulär har osänd text.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-05: markering kräver visning och skyddar oskickad text”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-05"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Markeringsbesked ska motsvara ett faktiskt visat urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Markera Lo i kartan.** Släpp visningen enligt separat
   förberedelse. Läs Lo markerad, **Påhittad uppgift** i detaljpanelen och
   **Markerat i kartan.** i kartans status. Sluttexten är **Markerat!**.
2. Skicka **Markera Lo igen.** Håll svaret. Stäng textvyn och välj
   **Tabell → Redigera Lo Exempel**. Skriv **Osänd uppgift** i Beskrivning.
3. Släpp det gamla visningsanropet och samma sluttext. Läs kvarvarande
   oskickad beskrivning. Escape, **Fortsätt redigera**, läs igen, sedan
   Escape och **Kasta ändringarna och fortsätt**.
4. Läs den fria sluttexten i textvyn. Återgå till Karta; inget nytt
   **Markerat i kartan.** ska bekräfta den avvisade visningen.

**Förväntat resultat:**

- Första markeringen motsvarar faktisk webbläsarvisning och
  `displayed: true`.
- Det andra försöket ger ingen ny bekräftad markering. Oskickad text
  finns kvar. **Markerat!** visas som obekräftad samtalstext, skild från
  det faktiska urvalet. Modellens text ensam ändrar inte kartans urval.

### TEXT-06: obekräftad samtalstext skiljs från sparande och markering

**Syfte:** Skilja modellens fria svar från bekräftade resultat, även när
svaret påstår att något har utförts med andra ord.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns i utkastet. Anteckna aktuellt urval
i kartan innan du börjar. Inget sparande är genomfört.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
“TEXT-06: obekräftad samtalstext skiljs från sparande och markering”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-06"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Skilja modellens fria svar från bekräftade resultat, även när svaret påstår att något har utförts med andra ord."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Anteckna kartans urval. Skicka **Beskriv mitt utkast.** fyra gånger,
   ett meddelande för varje förberett fritt svar. Läs varje svar i
   Samtalstext. Öppna **Visa utkastet → Visa förslaget: Lo Exempel** och
   läs **Person** och **Påhittad uppgift** efter varje svar; stäng uppgifterna
   och dölj utkastet före nästa meddelande.
2. Kartans urval och utkast är oförändrade. Ingen av de fria texterna
   skapar ett kvitto; historiken är tom.
3. Skicka **Spara hela utkastet nu.** Låt operatören släppa faktiskt
   sparverktyg. Kräv **Sparat.**, tomt utkast och ett enda Lo-sparande
   i **Rapporter → Ändringshistorik**.

**Förväntat resultat:**

- Andra språk och omskrivningar blir inte bevis på sparande eller markering.
  Samtalstexten behålls men dess obekräftade källa framgår.
- Efter de fyra fria svaren är Lo fortfarande osparad, kartans urval är
  oförändrat och inget kvitto finns för dessa svar. Det sista riktiga
  sparanropet ger däremot kvitto, sparad Lo och bekräftad status.
- Användbara frågor försvinner inte genom en lista med förbjudna ord.

### TEXT-08: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skyttels markeringsbesked ska följa synlig karta och rätt
uppgifter i detaljpanelen, även när kartan är stängd eller bortpanorerad
och när skärmen är smal.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Lägg även **Molnmusik**, typ
**Person**, och ett samband **Lo Exempel → Använder → Molnmusik** i
utkastet genom formulären. Stäng formulären utan oskickad text.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts),
testfallet “TEXT-08: markering öppnar och centrerar objekt och samband
före bekräftelsen”, referensen 1440 × 1000 CSS-pixlar. Separata storleksfall
finns nedan.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-08"
  },
  "reference": "1440 × 1000 CSS-pixlar; synlig karta och detaljer, bortpanorerat samband, oskickat sambandsformulär.",
  "outcomes": [
    "Skyttels markeringsbesked ska följa synlig karta och rätt uppgifter i detaljpanelen, även när kartan är stängd eller bortpanorerad och när skärmen är smal."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Visa Lo i kartan.** Låt operatören släppa objektvisningen.
   Läs Lo markerad och **Påhittad uppgift** samtidigt i detaljpanelen.
   Stäng uppgifterna efter sluttexten och öppna textvyn; Lo är fortfarande
   valt och **Markerat i kartan.** står i kartans status.
2. Öppna **Navigera**, panorera vänster tills objekten inte syns. Skicka
   **Visa sambandet mellan Lo och Molnmusik.** Släpp sambandsvisningen.
   Läs båda objekten och det markerade sambandet samtidigt med
   **Lo Exempel → Använder → Molnmusik** i detaljpanelen.
   På smal skärm: använd Tab eller Skift+Tab till **Kartans sammanhang**
   längre ned i arbetsytan. Läs statusen och använd End för att nå
   teckenförklaringens sista rad, **Punkter: etikettens koppling**.
3. Skicka **Visa Lo igen.** Håll svaret, stäng textvyn och välj
   **Redigera valt samband** med tangentbord. Kontrollera Molnmusik i
   **Till objekt** och ändra till Lo utan att lägga ändringen i utkastet.
4. Släpp den gamla visningen. Läs samma oskickade värde Lo i formuläret.
   Ingen ny bekräftad markering tillkommer. Avsluta provet utan att lägga
   formulärändringen i utkastet. Vid hopfällda verktyg används
   **Visa verktygens namn** före skrivandet.

**Förväntat resultat:**

- Markeringsbekräftelsen kommer först efter att det efterfrågade objektet
  eller sambandet visas i kartan och dess uppgifter samtidigt syns i
  detaljpanelen, även på telefon.
- Kamera och vy anpassas till urvalet utan att personliga placeringar
  eller hushållets innehåll ändras.
- Kartans sammanhang och teckenförklaring går att fokusera och läsa med
  tangentbord på smal skärm. Den fokuserade ytan är helt synlig.
- Oskickad formulärtext förhindrar ett nytt urval. Ingen ny bekräftad
  markering påstås, och formulärets uppgifter finns kvar.

### TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto

**Syfte:** Granska verkliga före- och eftervärden i samtalet och få samma
detaljer från kvittot efter ett kort sparbesked.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo och Tonrum (Tjänst, Gäller fortfarande) samt deras
Använder-samband
är samlat sparade. Terminalen håller modellsvar.
Datorfönstret är bredare än 700 px.
Alla uppgifter är påhittade.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-09"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Granska verkliga före- och eftervärden i samtalet och få samma detaljer från kvittot efter ett kort sparbesked."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera det sparade sambandet via **Tabell → Samband för Lo Exempel**.
   Byt Använder till **Betalar**, välj **Lägg i utkastet**, läs bekräftelsen
   och stäng samband. Redigera Tonrum och välj **Upphört** under
   **Objektets status**, sedan **Lägg i utkastet och stäng**.
2. Öppna utkastet och läs båda rättelserna innan något senare uppdrag.
   Skicka **Läs upp hela utkastet.** Låt operatören leverera rapporten.
   Läs **Utkast:**, **Tonrum (Gäller: aktuellt → upphört)** och
   **Lo Exempel Använder Tonrum → Lo Exempel Betalar Tonrum**.
3. Skicka **Spara hela utkastet nu.** Läs **Sparat.** och tomt utkast.
   Öppna **Tabell → Filter**, markera **Ta med upphörda** och stäng
   filtret med Escape. Fäll ut Tonrum och läs **Tjänst** och
   **Manuellt upphört**.
4. Skicka **Vad sparades senast?** Låt operatören leverera kvittorapporten.
   Läs **Sparandet:** med samma före-/eftervärden. Tabell finns kvar och
   inget nytt sparande har tillkommit.

**Förväntat resultat:**

- Både det osparade utkastet och det senaste kvittot beskriver den
  verkliga ändringen från aktuellt till upphört och från Använder till
  Betalar. Förevärdet får inte beskrivas med den nya sambandstypen.
- Begärda detaljer visas som Skyttels svar i samtalstexten. Granskningen kräver
  ingen kartmarkering och ändrar eller sparar inga uppgifter.
- Själva sparandet bekräftas kort. Detaljer ges när de efterfrågas och
  bygger då på det beständiga kvittot.

## Separata kvarvarande kartstorlekar

### TEXT-10: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda kortare datorvy.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 1280 × 720.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-10"
  },
  "reference": "1280 × 720 CSS-pixlar; kortare datorvy.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 1280 × 720. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

### TEXT-11: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda smal karta med samtidig detaljläsning.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 390 × 844.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-11"
  },
  "reference": "390 × 844 CSS-pixlar; smal karta med samtidig detaljläsning.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Kartans sammanhang och teckenförklaring går att läsa med tangentbord efter ett nytt urval.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 390 × 844. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

### TEXT-12: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda kort smal karta.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 640 × 500.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-12"
  },
  "reference": "640 × 500 CSS-pixlar; kort smal karta.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Kartans sammanhang och teckenförklaring går att läsa med tangentbord efter ett nytt urval.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 640 × 500. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

### TEXT-13: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda ytterst kort karta och nåbara detaljer.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 320 × 250.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-13"
  },
  "reference": "320 × 250 CSS-pixlar; ytterst kort karta och nåbara detaljer.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Kartans sammanhang och teckenförklaring går att läsa med tangentbord efter ett nytt urval.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 320 × 250. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

## Pensionerat ID

TEXT-07 får inte återanvändas. Dess fältvärde 1111 → 2222, nya
sambandstyp och oförändrade sparade värden finns i SAMTALSUTKAST-01.
Den separata generiska granskningen upphör efter demonstrerad överföring.

## Controlled text fixture

Use this launcher for reproducible provider failures and delayed replies.
It runs the actual application, browser authentication, OAuth/MCP and SQLite
against a fresh temporary database. Only the external identity and model
providers are substitutes. It makes no real Google, Microsoft or OpenAI
requests and needs no provider credentials. It never opens your normal
development database or private environment file.

These controls verify application behavior, not a real model's understanding
of Swedish. Keep real-model results separate. Integration tests cover these
controlled scenarios; manual repetition is optional troubleshooting.

### Start and sign in

From the repository root, with dependencies installed, run:

```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-text-assistant.ts
```

Keep this terminal open. The `ready` event prints an `origin` such as
`http://127.0.0.1:43127`. In VS Code's **Ports** panel, forward that printed
port to the same host port, keeping it private. Open the exact printed
origin in a new private browser window. Use `127.0.0.1`, not `localhost`:
authentication and same-origin checks use the printed address.

Choose Google sign-in. The substitute provider signs in **Alex Exempel**
without an external account or password. Complete the normal first-household
form with the name **Textprov**. Create only made-up content. Choose
**Skriv till Skyttel → Nytt samtal** and select **Godkänn och starta**.
The substitute uses that same application consent flow.

Enter the scenario's message and press **Skicka**. Each provider request
stops at the external boundary and prints a `held` event in the terminal.
Its increasing `id` identifies that exact request. The event includes the
synthetic message, draft versions, latest tool result, and available tool
names. The browser must continue showing ongoing work until you release a
response or cancel the task.

### Terminal commands

Enter commands in the launcher terminal, one line at a time. These are
launcher commands, not shell commands. Tool arguments must be one JSON
object using the tool's documented schema. The actual MCP entrance still
validates scope, permissions, versions and domain rules.

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `pending` | Display every held provider request and its original context. |
| `tool REQUEST TOOL JSON` | Return one model tool call for that held request. The application processes it through its actual MCP client. |
| `reply REQUEST TEXT` | Return a final plain-text model reply for that held request. |
| `fail REQUEST` | Fail that held provider request at the external boundary. |
| `restart` | Reject outstanding provider responses, restart the application with the same temporary database and origin, and release old assistant sessions. |
| `quit` | Stop the installation and delete its temporary database. |
<!-- markdownlint-enable MD013 -->

Replace `REQUEST` with the numeric `id` from the relevant `held` event.
For example, when request `1` is held, enter:

```text
tool 1 read_type_catalog {}
```

This releases request `1`. The application runs `read_type_catalog` through
MCP and asks the substitute model what to do next. A new `held` event, `2`,
contains the actual catalog under `lastToolResult`. To finish this simple
read without making a proposal, enter:

```text
reply 2 Typkatalogen är läst. Inget förslag har ändrats.
```

For a proposal, use the exact tool name and JSON arguments specified by the
manual case. Copy type/object IDs from the tool result and use the draft
`version` and `contentVersion` shown when the request was held. The launcher
does not repair, refresh or replace those arguments. A released tool call
does not itself prove that a proposal or save succeeded: inspect the next
`lastToolResult`, browser draft and any durable receipt.

### Delay, failure and restart

For a delayed response, leave the request held while performing the manual
case's browser edit, discard, cancellation or new instruction. Release the
original request by its original ID with its original arguments. Releasing
an old request must not replace newer work. Cancellation may cause the SDK
to ignore the released provider response entirely; confirm the actual
browser and saved/private map state, not just the terminal's `released`
event. `pending` can still show that intentionally retained old response.

For a provider failure, enter `fail` followed by the current held ID. Check
the browser error and preserved draft. Continue ordinary manual map editing
to confirm that it remains available. A new assistant message produces a
new held request that can be answered normally. No real network outage or
API charge is involved.

For restart recovery, enter `restart` and wait for `restarted`. Reload the
browser and start a new assistant session through its normal consent box.
The database and browser login remain, while old conversation memory and
assistant grants are closed. The application reads durable proposals and
operation results through a new ordinary MCP connection. `restart` does
not simulate a missing post-commit response: use the manual case's stated
response-loss control when that fault is required.

### Cleanup

Enter `quit`, or press Ctrl+C. Wait for `closed`, which confirms deletion
of this launcher's temporary database. Close the private browser window
and remove its port-forward entry. Each new launcher process starts empty.
If the process is forcibly killed, stop any remaining process before
deleting only the temporary `directory` printed by its `ready` event.

Do not reuse this fixture for real household data. Terminal output includes
synthetic task context intentionally; do not publish terminal recordings.
No production endpoint, provider-address override or authentication bypass
is added by this development launcher.

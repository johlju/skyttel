# Förbered historiska definitioner och fria egenskaper

Använd en isolerad provinstallation med påhittade uppgifter. Förberedaren
skapar ett hushåll och två inloggade sessioner. Robin arbetar i det synliga
fönstret; Alex förbereder de äldre ägda förslagen i en separat session.
Inga AI-anrop eller direkta databasändringar behövs.

Kör från repositoryts rot, efter en aktuell byggning:

```bash
npm run build
npm run test:env -- tsx scripts/manual-conflict-continuity.ts
```

För automatiserad kontroll kan förberedaren använda en redan startad
Chromium genom `--browser-ws WS_ADRESS`, där WS_ADRESS ersätts med den
browserns faktiska DevTools-adress som börjar med `ws://`. Argumentet
ändrar endast anslutningen till browsern; samma förberedelser, HTTP-anrop
och databas används. Utan argumentet startar kommandot sitt eget synliga
fönster. Integrationsprovet nedan använder det dokumenterade argumentet
med `--headless` och provar riktiga UI-val och kommandoloopen.

Välj ett av kommandona nedan i terminalen. Invänta `Ready:` med vald
förberedelse och den nya adressen innan UI-fallet börjar. Förberedaren
exporterar giltiga tidigare privata förslag, sparar de nyare gemensamma
definitionerna och återimporterar de ägda förslagen med kontrollerade
arkivdelar. Varje `new-…` skapar en ny installation och tar bort den förra.
Kör därför aldrig ett nytt sådant kommando mitt i ett återhämtningsförlopp.

<!-- markdownlint-disable MD013 -->
| Fall | Förberedelse | Faktiskt underlag |
| --- | --- | --- |
| UTKAST-64, 72 | `new-missing-object-type` | Borttagen Solcellsanläggning; ägt objekt med textsvaret Våren 2021. |
| UTKAST-66 | `new-missing-relationship-type` | Borttagen Förvaras i; äldre samband Lo Exempel till Molnmusik med textsvaret. |
| UTKAST-75 | `new-multiple-blockers` | Både sambandets målobjekt och dess typ saknas. |
| UTKAST-67, 70, 71 | `new-object-restoration` | Faktiskt borttagen objekttyp och ägd definitionsändring. |
| UTKAST-140, 69 | `new-relationship-restoration` | Faktiskt borttagen sambandstyp och ägd definitionsändring. |
| UTKAST-68 | `new-restoration-two` | Båda användarna har egna äldre definitionsförslag. |
| UTKAST-76, 139 | `new-no-removed-object-definition`, `new-no-removed-relationship-definition` | Ägt definitionsförslag i en innehållsgeneration utan någon faktisk borttagningsrevision. |
| UTKAST-141 | `new-object-restoration` | Samma underlag som UTKAST-70; användaren väljer Tabell. |
<!-- markdownlint-enable MD013 -->

Det oberoende objektet **Oberoende förslag** finns i Robins utkast i samtliga
förberedelser. **Installationsår** är en fri textegenskap på objektet eller
sambandet. Gamla
egenskapsidentiteter, typidentiteter, revisioner och arkivkontrollsummor är
tekniskt underlag, inte uppgifter som användaren ska läsa i UI-fallet.

## Tidsordning för operatörens kontroller

`result` skriver den faktiska kartan och hela Robins privata utkast via
hans session samt historiken via Alex befintliga administratörssession.
Historiken kräver administratör; Robins session används fortfarande för
alla egna privata val. Kör det före och efter de gränser nedan som
ska vara oförändrade. Jämför hela resultatet; vid ett bekräftat privat val
får bara det uttryckligen berörda förslaget ändras. Vanlig historikläsning,
Escape och nekade begäranden ändrar inte den gemensamma kartan eller historiken.

- UTKAST-64 och 75: kör `result` före öppningen, efter Escape och efter
  det riktade kastandet. Det oberoende förslaget består; bara målobjektets
  eller målsambandets privata förslag försvinner.
- UTKAST-66 och 72: kör `result` före rättningen och efter att den vanliga
  dialogen lägger rättningen i utkastet. Den nya typdefinitionen har en egen
  identitet. Valet av den typen ska bevara de individuella fria egenskapernas
  identiteter, ordning, datatyper och värden. Kontrollera karta och historik
  innan det separata sparandet.
- UTKAST-67 och 140: kör `result` före granskningen och efter bekräftelsen.
  Den historiska typidentiteten och nästa revision finns i det privata
  förslaget. Typen är fortfarande borttagen gemensamt. Efter separat
  sparande finns den återställda definitionen, men ingen privat
  återställningsbehörighet i sparkvittot eller historiken.
- UTKAST-68: kör `probe-definition-guards` före Robins första granskning.
  Det prövar felaktigt jämförelseunderlag och den andra privata ägaren;
  båda ska ge HTTP 409 utan ändring. Efter Robins bekräftelse kör
  `probe-reused-definition`; samma gamla jämförelse ska avvisas.
  Kör sedan `newer-definition` innan UI-fallet försöker spara. Kommandot
  granskar Alex eget förslag, sparar det, prövar typborttagning medan
  Robins beständiga återställningsförslag finns kvar och kräver HTTP 409
  utan ändring av bådas privata arbete, kartan eller historiken.
  Alex sparar därefter **Ny gemensam typbenämning**. Robins gamla förslag
  får inte sparas mot denna nyare definition. `try-restoration-save`
  prövar även samma gräns via HTTP; användaren provar det synliga avvisade
  sparandet enligt UI-fallet. Bevara samma installation under ny granskning.
- UTKAST-69: kör `reimport-restoration` efter första bekräftelsen och före
  omladdningen. Exporten bevarar det privata förslaget; importen ökar
  innehållsgenerationen och tar bort den gamla återställningsbehörigheten.
  Kör `try-restoration-save` före ny granskning och kräv HTTP 409 samt
  oförändrat utkast. Bevara samma användare och installation.
- UTKAST-71: kör `forge-restoration` efter det uttryckliga kastvalet, före
  skapandet av den nya vanliga typen. Kräv HTTP 409 utan ändrat utkast,
  gemensamma typer, objekt eller historik. Begäran anger det gamla ID:t
  och påstådd återställningsbehörighet. Vanligt nyskapande får en ny
  identitet och ingen sådan behörighet.
- UTKAST-76 och 139: kör `probe-unavailable-restoration` före öppningen.
  Utan faktisk borttagningsrevision krävs HTTP 409 utan ändring. Efter
  kastvalet jämför `result`: bara det ägda definitionsförslaget försvinner.

## Starta om samma installation

Använd `restart` i förberedarens terminal när UI-fallet anger serveromstart.
Kommandot stoppar och startar den aktiva servern med samma databas, adress
och båda inloggade sessioner. Det ändrar inte förberedelse, privat utkast,
historik eller transportinställning. Invänta avslutade begäranden; om du
använder `hold`, kör `release` och invänta resultatet först.

I UTKAST-66, 67, 68, 69, 71, 72 och 140:

1. Slutför det separata sparandet och läs det bekräftade sparbeskedet.
   Kör `network-ok` om ett transportfel är aktivt. Kör `result` och behåll
   utskriften av kartan, hela utkastet och historiken före omstarten.
2. Skriv `restart` och invänta `Restarted:` med samma förberedelsenamn och
   exakt samma adress som vid `Ready:`. Kör `result` igen; hela resultatet
   ska vara lika med utskriften före omstarten. Kör varken `new-…` eller
   `quit` vid denna gräns; de tar bort den aktiva databasen.
3. Ladda om fönstret på samma adress. Ingen ny inloggning ska behövas.
   Läs de sparade objekt- eller sambandsuppgifterna och det oberoende
   objektet i Tabell enligt fallet. Läs återställda eller nya definitioner
   genom Inställningar enligt fallet. I UTKAST-67, 68 och 140 läser både
   Robin och Alex med sina befintliga sessioner.

För en separat kontroll av ett ännu osparat återställningsförslag, kör
`new-restoration-two`, sedan `probe-definition-guards`. Granska och lägg
Robins definition i utkastet genom UI. Kör `result`, `restart` och `result`
före `probe-reused-definition` och `newer-definition`. Resultaten före och
efter omstarten ska vara lika. Ladda om och läs hela den privata definitionen
och **Oberoende förslag**; definitionen är fortfarande borttagen gemensamt.
Fortsätt därefter UTKAST-68:s befintliga tidsordning i samma installation.

## Tappat svar efter genomfört privat val

UTKAST-70 och 141 använder samma installation under hela kontrollen.
Välj först den föreslagna definitionen. Kör `lose-applied` precis före
**Lägg valen i utkastet**. Förberedaren skickar begäran till den riktiga
servern och tappar sedan svaret; den ersätter inte serverns behandling.
Använd dialogens uppföljning och kör `result` efter kontrollen. Det krävs
ett bekräftat privat resultat och bara en skickad bekräftelse.

`lose-unsent` stoppar begäran före servern och är ett annat fel. Vanligt
offlineläge bevisar inte att ett faktiskt genomfört svar har tappats.
`network-ok` återställer normal leverans. Kör det före fortsatt arbete.
Avsluta med `quit`; förberedaren stänger fönstret och tar bort provdatabasen.
Vid en vanlig installation används
[transportens avstängning](current-conflict-preparation.md): återställ
HTTPS-ingången till den ursprungliga lyssnaren **före** `quit`.

## Kör automatiskt underlag separat

De fullständiga browserfallen behåller ytterligare protokollkontroller:
historiska identiteter, värdeslag, revisioner, felaktigt underlag, privat
ägarskap, arkivinnehåll och oförändrad historik. De är automatiserat
underlag till de synliga scenarierna, inte extra mänskliga UI-steg.

<!-- markdownlint-disable MD013 -->
```bash
npm run build
npm run test:integration -- tests/integration/conflict-external-corrections.spec.ts tests/integration/conflict-definition-restoration.spec.ts tests/integration/definition-removal.spec.ts
```
<!-- markdownlint-enable MD013 -->

Återställ provinstallationerna mellan fall med nästa `new-…`; avsluta med
`quit` efter färdig läsning. Dokumentera manuell körning och automatiserad
körning var för sig.

## Avvecklade förberedelser

UTKAST-65, UTKAST-74 och UTKAST-138 är avvecklade och får inte
återanvändas. Kommandona för oförenliga typfältsdatatyper och ersatta
typfält finns inte längre. Typens ändring styr inga individuella
egenskaper. UTKAST-66 och UTKAST-72 fortsätter vanlig typrättning med
bevarade fria egenskaper; identitetsbesluten står i [utkastfallen](drafts.md).

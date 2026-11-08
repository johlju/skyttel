# Scenarier för modellutvärdering

Den här referensen är till för dem som granskar, utvecklar eller utvärderar
Skyttels samtal. Den beskriver vad varje scenario ber användaren och assistenten
att göra, vilket resultat som förväntas och vad kontrollen utvärderar.

Uppdatera filen när scenarier läggs till, förändras eller tas bort. Körresultat,
kostnader, datum för enskilda försök och arbetsstatus hör till separata
körningsrapporter och ingår inte här.

Den körbara definitionen finns i
[scenariekatalogen](../../scripts/model-evaluation/catalog.json).
[Vardagslistan](../../scripts/model-evaluation/everyday-source.json) knyter
vardagsärendenas nummer till beständiga scenario-ID:n. Här finns alla 70
scenarier: 60 vardagsärenden, åtta avancerade tester och två tester med lång
samtalsbakgrund.

## Så läses flödena

Varje scenario startar i ett eget förberett hushåll med separat utkast. Ärendena
bildar inte ett gemensamt långt samtal. Ordinarie steg körs i angiven ordning i
samma samtal; ett beroende följdmeddelande förutsätter att föregående steg kan
slutföras.

Citerad användartext är katalogens prompt. Förväntade svar beskriver innebörd,
inte en obligatorisk exakt formulering. En kort verifierad utkastbekräftelse är
normalfallet för ändringar; beställda faktasvar, frågor och sammanfattningar
måste fortfarande lämnas. Ett sparbesked förutsätter ett verifierat sparkvitto.

Alla scenarier kräver rätt hushåll, person och utkast, rätt objekttyper och
sambandsriktningar samt bevarade ovidkommande uppgifter. Ingen uppgift får
hittas på. En ändring i utkastet ger inte tillstånd att spara. När inget annat
anges ska nya sparförsök och sparanden utebli.

Ett nödvändigt förtydligande är tillåtet om begäran och kartan inte avgör
frågan. Assistenten ska bevara den oavslutade begärans innebörd och
begränsningar, skilja färdiga delar från väntande arbete och undvika felaktiga
ändringar eller sparbesked. En onödig fråga är fortfarande ett fel.

Villkorade följdsvar nedan är separata från de ordinarie meddelandena. De
skickas bara när frågans innebörd och det säkra vänteläget motsvarar den angivna
grenen. Ett matchande följdsvar gör inte en onödig fråga nödvändig. En korrekt
nödvändig fråga kan sakna förberett svar; hanteringen kan då vara korrekt medan
fortsättningen är oprövad och uppdraget inte är slutfört.

Varje scenario anger sitt relevanta startläge. I de fristående vardagsärendena
finns dessutom Rut med en oförändrad beskrivning som skyddar mot ovidkommande
ändringar. Inga verkliga personuppgifter behövs.

## Gemensamt startläge för återanvända scenarier

Vardagsärende 52–60 samt de avancerade och långa scenarierna använder följande
gemensamma karta, om ingen variant anges. Alla angivna företag, personer och
kontaktuppgifter är testdata.

- Alex Lind (Person).
- Lo Berg (Person).
- Mira Dahl (Person).
- Spotify AB (Företag).
- Microsoft AB (Företag).
- Norrsken Molntjänster AB (Företag).
- Spotify (Tjänst).
- Microsoft 365 (Tjänst).
- Norrsken Molnlagring (Tjänst).
- Tenant Norrsken Bygg (Tjänst).
- Spotify Premium Family (Abonnemang); Pris: 179, Valuta: SEK,
  Betalningsintervall: månad.
- Molnlagring Plus (Abonnemang); Pris: 199, Valuta: SEK, Betalningsintervall:
  månad.
- Netflix Standard (Abonnemang); Pris: 139, Valuta: SEK, Betalningsintervall:
  månad.
- Alex arbete (Tjänstekonto).
- Lo arbete (Tjänstekonto).
- `m365@norrsken.test` (E-postadress).
- `alex@norrsken.test` (E-postadress).
- `lo@norrsken.test` (E-postadress).
- `hushall@norrsken.test` (E-postadress).
- Hushållskortet (Kort).
- Bankkonto Hushåll (Bankkonto).
- Bankkonto Reserv (Bankkonto).

Samband i startläget:

- Spotify AB → Erbjuder → Spotify.
- Microsoft AB → Erbjuder → Microsoft 365.
- Norrsken Molntjänster AB → Erbjuder → Norrsken Molnlagring.
- Spotify Premium Family → Gäller → Spotify.
- Molnlagring Plus → Gäller → Norrsken Molnlagring.
- Alex arbete → Hör till → Microsoft 365.
- Lo arbete → Hör till → Microsoft 365.
- Mira Dahl → Använder → Spotify.
- Lo Berg → Använder → Microsoft 365.
- Spotify Premium Family → Står på avtalet → Alex Lind.
- Mira Dahl → Betalar → Spotify Premium Family.
- Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Molnlagring Plus → Står på avtalet → Mira Dahl.
- Alex Lind → Betalar → Molnlagring Plus.
- Molnlagring Plus → Betalas med → Hushållskortet.
- Alex arbete → Inloggningsadress → `m365@norrsken.test`.
- Alex arbete → Kontaktadress → `m365@norrsken.test`.
- Lo arbete → Inloggningsadress → `m365@norrsken.test`.
- Lo arbete → Kontaktadress → `m365@norrsken.test`.
- Hushållskortet → Kontokoppling → Bankkonto Hushåll.

Utkastet innehåller Lo Bergs beskrivning ”Övar cello på tisdagar.” och Netflix
Standards pris 149 kronor per månad. Sparad karta har Netflix Standard 139
kronor per månad. Övriga beskrivningar och uppgifter ska bevaras. Sambandstypen
Levererar till finns men har inga befintliga samband i startläget.

## Vardagsärenden

Gruppen innehåller både korta instruktioner och sammanhängande vardagsärenden
med flera delar. Nummer 60 är en särskild avbrottskontroll; den bedömer att
Stopp fungerar och ska inte räknas som ett slutfört ändringsuppdrag.

### 1. Lägga till Disney+

Scenario-ID: `everyday-01`.

**Utvärderar:** Tolka ett vardagligt tillägg utan att kräva teknisk
representation eller hitta på fakta.

**Startläge:** Det namngivna nya objektet finns inte i kartan.

**Steg 1:**

> Vi har skaffat Disney+. Lägg till det.

**Förväntat svar och resultat:**

- Disney+ är tillagt som tjänst, som abonnemang eller som en tjänst med ett
  tillhörande abonnemang. Inga andra nya objekt eller påhittade egenskaper är
  tillåtna.

Tillåtet tillståndsalternativ 1:

- Disney+: namn Disney+; typ Tjänst.
- Disney+-abonnemang: namn Disney+-abonnemang; typ Abonnemang.
- Tillagt samband: Disney+-abonnemang → Tillhör tjänsten → Disney+.

Tillåtet tillståndsalternativ 2:

- Disney+: namn Disney+; typ Tjänst.

Tillåtet tillståndsalternativ 3:

- Disney+: namn Disney+; typ Tjänst.
- Disney+-abonnemang: namn Disney+-abonnemang; typ Abonnemang.
- Tillagt samband: Disney+-abonnemang → Gäller → Disney+.

Tillåtet tillståndsalternativ 4:

- Disney+-abonnemang: namn Disney+; typ Abonnemang.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 2. Lägga till sparkonto

Scenario-ID: `everyday-02`.

**Utvärderar:** Skilja bankkonto från bank och skapa den begärda kopplingen till
banken.

**Startläge:** Kartan innehåller Nordea (Företag).

**Steg 1:**

> Lägg till mitt sparkonto hos Nordea.

**Förväntat svar och resultat:**

- Det nya bankkontot är användarens sparkonto hos Nordea.
- Sparkonto hos Nordea: namn Sparkonto hos Nordea; typ Bankkonto.
- Tillagt samband: Sparkonto hos Nordea → Finns hos → Nordea.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 3. Lägga till bil

Scenario-ID: `everyday-03`.

**Utvärderar:** Skapa rätt objekttyp utan påhittad registrering, finansiering
eller ägare.

**Startläge:** Det namngivna nya objektet finns inte i kartan.

**Steg 1:**

> Lägg till vår Volvo V60.

**Förväntat svar och resultat:**

- Det nya fordonets namn identifierar Volvo V60.
- Volvo V60: namn Volvo V60; typ Fordon.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 4. Lägga till person

Scenario-ID: `everyday-04`.

**Utvärderar:** Skapa en person i kartan utan att ge personen användaråtkomst.

**Startläge:** Det namngivna nya objektet finns inte i kartan.

**Steg 1:**

> Lägg till Nora som en person i kartan.

**Förväntat svar och resultat:**

- Det nya personobjektet heter Nora.
- Nora: namn Nora; typ Person.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 5. Ta bort tjänst

Scenario-ID: `everyday-05`.

**Utvärderar:** Avgränsa borttagning till den namngivna tjänsten.

**Startläge:** Kartan innehåller Viaplay (Tjänst).

**Steg 1:**

> Ta bort Viaplay från kartan.

**Förväntat svar och resultat:**

- Viaplay tas bort.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 6. Ta bort tjänstekonto

Scenario-ID: `everyday-06`.

**Utvärderar:** Skilja tjänstekontot från tjänsten och ta bort bara det begärda
kontot.

**Startläge:** Kartan innehåller Dropbox (Tjänst); Mitt gamla Dropbox-konto
(Tjänstekonto).

- Befintligt samband: Mitt gamla Dropbox-konto → Tillhör tjänsten → Dropbox.

**Steg 1:**

> Ta bort mitt gamla Dropbox-konto.

**Förväntat svar och resultat:**

- Mitt gamla Dropbox-konto tas bort.
- Borttaget samband: Mitt gamla Dropbox-konto → Tillhör tjänsten → Dropbox.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 7. Avsluta abonnemang

Scenario-ID: `everyday-07`.

**Utvärderar:** Skilja avslut från borttagning och behålla abonnemangets
uppgifter.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.

**Steg 1:**

> Vi har sagt upp Netflix. Markera abonnemanget som avslutat.

**Förväntat svar och resultat:**

- Netflix-abonnemanget är upphört och finns kvar med sina egenskaper och
  samband. Tjänsten är inte avslutad eller borttagen.
- Netflix-abonnemang: markerat upphört.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 8. Avsluta användning

Scenario-ID: `everyday-08`.

**Utvärderar:** Skilja upphörd användning från avslutad eller borttagen tjänst.

**Startläge:** Kartan innehåller Lo Berg (Person); Spotify (Tjänst).

- Befintligt samband: Lo Berg → Använder → Spotify.

**Steg 1:**

> Lo använder inte Spotify längre.

**Förväntat svar och resultat:**

- Den tidigare användningen är antingen borttagen eller markerad som upphörd på
  samma befintliga samband, med dess identitet och övriga innehåll bevarade.
  Tjänsten finns kvar och är inte upphörd. Ett upphört samband anger inte
  aktuell användning.

Tillåtet tillståndsalternativ 1:

- Den tidigare användningskopplingen för Lo tas bort.

Tillåtet tillståndsalternativ 2:

- Samma befintliga användningssamband för Lo markeras upphört; identitet och
  övrigt innehåll bevaras.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 9. Ange användning

Scenario-ID: `everyday-09`.

**Utvärderar:** Tolka ett vanligt faktapåstående som en begärd uppdatering av
kartan.

**Startläge:** Kartan innehåller Alex Lind (Person); Spotify (Tjänst).

**Steg 1:**

> Alex använder Spotify.

**Förväntat svar och resultat:**

- Tillagt samband: Alex Lind → Använder → Spotify.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 10. Lägga till ytterligare användning

Scenario-ID: `everyday-10`.

**Utvärderar:** Lägga till en användare utan att ta bort den befintliga
användningen.

**Startläge:** Kartan innehåller Mira Dahl (Person); Alex Lind (Person); Netflix
(Tjänst).

- Befintligt samband: Alex Lind → Använder → Netflix.

**Steg 1:**

> Mira använder också Netflix.

**Förväntat svar och resultat:**

- Tillagt samband: Mira Dahl → Använder → Netflix.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 11. Koppla tjänstekonto till tjänst

Scenario-ID: `everyday-11`.

**Utvärderar:** Bevara skillnaden mellan tjänst och tjänstekonto samt sambandets
riktning.

**Startläge:** Kartan innehåller Mitt Spotify-konto (Tjänstekonto); Spotify
(Tjänst).

**Steg 1:**

> Koppla mitt Spotify-konto till Spotify.

**Förväntat svar och resultat:**

- Tillagt samband: Mitt Spotify-konto → Tillhör tjänsten → Spotify.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 12. Koppla abonnemang till tjänst

Scenario-ID: `everyday-12`.

**Utvärderar:** Bevara skillnaden mellan tjänst och abonnemang samt deras
koppling.

**Startläge:** Kartan innehåller Netflix-abonnemang (Abonnemang) med Pris: 149,
Valuta: SEK, Betalningsintervall: månad; Netflix (Tjänst).

**Avgränsning i kontrollen:** Kontrollens tillståndskrav använder sambandstypen
Gäller eller Tillhör tjänsten från abonnemanget till tjänsten. Exakt ett av
sambanden ska läggas till, med rätt riktning och samma befintliga objekt som
ändpunkter.

**Steg 1:**

> Koppla vårt Netflix-abonnemang till Netflix.

**Förväntat svar och resultat:**

- Tillagt samband från Netflix-abonnemang till Netflix, med sambandstypen
  Gäller eller Tillhör tjänsten.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 13. Ange betalare

Scenario-ID: `everyday-13`.

**Utvärderar:** Skilja betalare från användare och avtalspart.

**Startläge:** Kartan innehåller Mira Dahl (Person); Disney+ (Tjänst);
Disney+-abonnemang (Abonnemang) med Pris: 99, Valuta: SEK, Betalningsintervall:
månad.

- Befintligt samband: Disney+-abonnemang → Gäller → Disney+.

**Steg 1:**

> Det är Mira som betalar Disney+.

**Förväntat svar och resultat:**

- Tillagt samband: Mira Dahl → Betalar → Disney+-abonnemang.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 14. Byta betalningsmedel

Scenario-ID: `everyday-14`.

**Utvärderar:** Koppla rätt avtal till rätt betalningsmedel.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad;
Hushållskortet (Kort).

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.

**Steg 1:**

> Netflix ska betalas med Hushållskortet.

**Förväntat svar och resultat:**

- Tillagt samband: Netflix-abonnemang → Betalas med → Hushållskortet.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 15. Koppla kort till bankkonto

Scenario-ID: `everyday-15`.

**Utvärderar:** Skilja kortet från bankkontot som kortet är kopplat till.

**Startläge:** Kartan innehåller Hushållskortet (Kort); Vårt gemensamma
bankkonto (Bankkonto).

**Steg 1:**

> Koppla Hushållskortet till vårt gemensamma bankkonto.

**Förväntat svar och resultat:**

- Tillagt samband: Hushållskortet → Kontokoppling → Vårt gemensamma bankkonto.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 16. Koppla bredband till bostad

Scenario-ID: `everyday-16`.

**Utvärderar:** Tolka vilket befintligt bredband och vilken bostad som avses.

**Startläge:** Kartan innehåller Telias bredband (Abonnemang) med Pris: 399,
Valuta: SEK, Betalningsintervall: månad; Storgatan 12 (Bostad).

**Steg 1:**

> Telias bredband hör till lägenheten på Storgatan 12.

**Förväntat svar och resultat:**

- Tillagt samband: Telias bredband → Hör till → Storgatan 12.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 17. Ange bilägare

Scenario-ID: `everyday-17`.

**Utvärderar:** Använda den befintliga sambandstypen med rätt riktning för
ägande.

**Startläge:** Kartan innehåller Alex Lind (Person); Volvo V60 (Fordon).

**Steg 1:**

> Det är Alex som äger vår Volvo V60.

**Förväntat svar och resultat:**

- Tillagt samband: Volvo V60 → Äger → Alex Lind.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 18. Koppla försäkring till bil

Scenario-ID: `everyday-18`.

**Utvärderar:** Koppla försäkringsavtalet till fordonet utan att ändra ägande
eller användning.

**Startläge:** Kartan innehåller Bilförsäkringen hos Folksam (Försäkringsavtal);
Folksam (Företag); Volvo V60 (Fordon).

- Befintligt samband: Bilförsäkringen hos Folksam → Står på avtalet → Folksam.

**Steg 1:**

> Bilförsäkringen hos Folksam gäller vår Volvo V60.

**Förväntat svar och resultat:**

- Tillagt samband: Bilförsäkringen hos Folksam → Försäkrar → Volvo V60.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 19. Ändra månadspris

Scenario-ID: `everyday-19`.

**Utvärderar:** Bevara belopp, valuta och betalningsintervall vid prisändring.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.

**Steg 1:**

> Ändra priset på Netflix till 179 kronor i månaden.

**Förväntat svar och resultat:**

- Netflix-abonnemang: Pris: 179; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 20. Ange årsbetalning

Scenario-ID: `everyday-20`.

**Utvärderar:** Ändra betalningsintervallet utan att hitta på ett nytt pris.

**Startläge:** Kartan innehåller Disney+ (Tjänst); Disney+-abonnemang
(Abonnemang) med Pris: 99, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Disney+-abonnemang → Gäller → Disney+.

**Steg 1:**

> Disney+ betalas årsvis.

**Förväntat svar och resultat:**

- Betalningsintervallet är år/årsvis. Beloppet 99 ändras inte och får inte
  räknas om till ett påhittat årsbelopp.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 21. Byta namn på kort

Scenario-ID: `everyday-21`.

**Utvärderar:** Byta ett objekts namn utan att skapa ett nytt kort eller ändra
kopplingar.

**Startläge:** Kartan innehåller Hushållskortet (Kort).

**Steg 1:**

> Byt namn på Hushållskortet till Gemensamma kortet.

**Förväntat svar och resultat:**

- Hushållskortet: namn Gemensamma kortet.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 22. Ändra beskrivning

Scenario-ID: `everyday-22`.

**Utvärderar:** Ändra rätt persons beskrivning utan andra ändringar.

**Startläge:** Kartan innehåller Lo Berg (Person).

**Steg 1:**

> Skriv att Lo spelar schack i beskrivningen.

**Förväntat svar och resultat:**

- Lo Bergs enda beskrivning anger att Lo spelar schack. Uppgiften om cello får
  också behållas i beskrivningen. Ingen annan uppgift läggs till.
- Lo Berg: Beskrivning: Lo spelar schack.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 23. Ange slutdatum för bindningstid

Scenario-ID: `everyday-23`.

**Utvärderar:** Bevara exakt datum och vad datumet avser.

**Startläge:** Kartan innehåller Telias bredband (Abonnemang) med Pris: 399,
Valuta: SEK, Betalningsintervall: månad.

**Steg 1:**

> Bindningstiden för Telias bredband går ut den 31 mars 2027.

**Förväntat svar och resultat:**

- Telias bredband har exakt en ny egenskap för bindningstidens slut den 31 mars
  2027. Datumet är 2027-03-31 eller motsvarande skrivet datum; pris och övriga
  egenskaper bevaras.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 24. Ange osäker användning

Scenario-ID: `everyday-24`.

**Utvärderar:** Bevara användarens osäkerhet i själva kartuppgiften.

**Startläge:** Kartan innehåller Mira Dahl (Person); Dropbox (Tjänst).

**Steg 1:**

> Jag tror att Mira använder Dropbox.

**Förväntat svar och resultat:**

- Miras användning av Dropbox måste i själva kartan uttryckligen vara osäkert
  uppgiven: en sann osäkerhetsmarkering eller en tydligt osäker text på
  sambandet, alternativt en enda textuppgift på Dropbox som uttryckligen anger
  att Mira möjligen använder tjänsten utan en säker användningskoppling. En bar
  säker användningskoppling eller bara osäker svarstext räcker inte. Ingen annan
  uppgift läggs till.

Tillåtet tillståndsalternativ 1:

- Mira → Använder → Dropbox läggs till med en sann Ja/nej-markering eller text
  som tydligt anger att just användningen är osäker.

Tillåtet tillståndsalternativ 2:

- Dropbox får en enda textuppgift som uttryckligen anger att Mira möjligen
  använder tjänsten; inget säkert användningssamband läggs till.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 25. Fråga efter pris

Scenario-ID: `everyday-25`.

**Utvärderar:** Besvara en avgränsad faktafråga utifrån rätt underlag utan
ändringar.

**Startläge:** Kartan innehåller Spotify (Tjänst); Spotify-abonnemang
(Abonnemang) med Pris: 119, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Spotify-abonnemang → Gäller → Spotify.

**Steg 1:**

> Vad kostar Spotify?

**Förväntat svar och resultat:**

- Svara att Spotify kostar 119 kronor per månad enligt det enda
  Spotify-abonnemanget i kartan. Ändra eller spara inget.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 26. Fråga efter använda tjänster

Scenario-ID: `everyday-26`.

**Utvärderar:** Läsa användningssamband och avgränsa svaret till personens
tjänster.

**Startläge:** Kartan innehåller Alex Lind (Person); Spotify (Tjänst); Microsoft
365 (Tjänst); Netflix (Tjänst).

- Befintligt samband: Alex Lind → Använder → Spotify.
- Befintligt samband: Alex Lind → Använder → Microsoft 365.

**Avgränsning i kontrollen:** Svaret ska ange båda tjänsterna som Alex använder
enligt kartan. Uppgifter om tjänster utan användningssamband med Alex krävs
inte. Korrekt kompletterande information från kartan är tillåten.

**Steg 1:**

> Vilka tjänster använder Alex?

**Förväntat svar och resultat:**

- Alex använder Spotify och Microsoft 365 enligt kartan. Påstå inte att Alex
  använder andra tjänster.
- Det krävs inget besked om tjänster utan användningssamband med Alex.
  Korrekt kompletterande information från kartan är tillåten.
- Besvara frågan utan att ändra eller spara något och utan påhittade fakta.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 27. Fråga efter abonnemang på ett kort

Scenario-ID: `everyday-27`.

**Utvärderar:** Följa betalningssamband utan att förväxla abonnemang, kort och
bankkonto.

**Startläge:** Kartan innehåller Netflix-abonnemang (Abonnemang) med Pris: 149,
Valuta: SEK, Betalningsintervall: månad; Spotify-abonnemang (Abonnemang) med
Pris: 119, Valuta: SEK, Betalningsintervall: månad; Hushållskortet (Kort); Vårt
gemensamma bankkonto (Bankkonto).

- Befintligt samband: Netflix-abonnemang → Betalas med → Hushållskortet.
- Befintligt samband: Spotify-abonnemang → Betalas med → Vårt gemensamma
  bankkonto.

**Avgränsning i kontrollen:** Svaret ska ange det enda abonnemanget som enligt
kartan betalas med Hushållskortet. Uppgifter om andra betalningsmedel krävs
inte. Korrekt kompletterande information från kartan är tillåten.

**Steg 1:**

> Vilka abonnemang betalas med Hushållskortet?

**Förväntat svar och resultat:**

- Netflix-abonnemanget är det enda abonnemanget som betalas med Hushållskortet.
- Uppgifter om andra betalningsmedel krävs inte. Korrekt kompletterande
  information från kartan är tillåten.
- Ändra eller spara inget och hitta inte på fakta.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 28. Fråga och därefter rätta pris

Scenario-ID: `everyday-28`.

**Utvärderar:** Bevara referensen från föregående prisfråga när användaren
ändrar ”det”.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.

**Steg 1:**

> Vad kostar Netflix?

**Förväntat svar och resultat:**

- Netflix kostar 149 kronor per månad enligt kartan. Ändra eller spara inget.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

**Steg 2 – ordinarie följdmeddelande:**

> Ändra det till 189 kronor.

**Förväntat svar och resultat:**

- Netflix-abonnemang: Pris: 189; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 29. Ångra senaste ändringen

Scenario-ID: `everyday-29`.

**Utvärderar:** Ångra rätt osparade ändring utan att kasta annat utkastarbete.

**Startläge:** Kartan innehåller Netflix-abonnemang (Abonnemang) med Pris: 149,
Valuta: SEK, Betalningsintervall: månad.

- Befintligt utkast för Netflix-abonnemang: Pris: 189; Valuta: SEK;
  Betalningsintervall: månad.

**Steg 1:**

> Ångra den senaste ändringen.

**Förväntat svar och resultat:**

- Netflix-abonnemang: Pris: 149; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 30. Spara befintligt utkast

Scenario-ID: `everyday-30`.

**Utvärderar:** Förstå en naturlig uttrycklig sparbegäran och spara det aktuella
utkastet.

**Startläge:** Kartan innehåller Lo Berg (Person).

- Befintligt utkast för Lo Berg: Beskrivning: Spelar schack.

**Steg 1:**

> Spara mina ändringar.

**Förväntat svar och resultat:**

- Ge ett kort verifierat sparbesked om hela utkastet, utan obegärd uppräkning.
  Ett allmänt besked om att ändringarna är sparade räcker; det måste styrkas av
  observerat tillstånd och sparkvitto.
- 1 verifierat sparande av hela utkastet; även tidigare förslag ingår.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 31. Lägga till tjänst för tre personer

Scenario-ID: `everyday-31`.

**Utvärderar:** Skapa tjänsten och alla tre begärda användningssamband
tillsammans.

**Startläge:** Kartan innehåller Johan (Person); Lo (Person); Sonja (Person).

**Steg 1:**

> Jag vill lägga till tjänsten Spotify som Johan, Lo och Sonja använder.

**Förväntat svar och resultat:**

- Spotify är den nya tjänsten som Johan, Lo och Sonja använder. Inga abonnemang,
  pris eller betalare hittas på.
- Spotify: namn Spotify; typ Tjänst.
- Tillagt samband: Johan → Använder → Spotify.
- Tillagt samband: Lo → Använder → Spotify.
- Tillagt samband: Sonja → Använder → Spotify.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 32. Lägga till abonnemang och betalare

Scenario-ID: `everyday-32`.

**Utvärderar:** Skapa abonnemang med rätt belopp, period och betalare utan att
hitta på tjänsteanvändning.

**Startläge:** Kartan innehåller Disney+ (Tjänst); Sonja (Person).

**Avgränsning i kontrollen:** Kontrollens tillståndskrav använder sambandstypen
Gäller eller Tillhör tjänsten från abonnemanget till Disney+. Exakt ett av
sambanden ska läggas till. Sonjas betalningssamband krävs i båda alternativen.
Belopp, valuta och månad får uttryckas med den avgränsade numeriska eller
textbaserade prisrepresentation som katalogen tillåter.

**Steg 1:**

> Vi har skaffat Disney+ för 99 kronor i månaden. Lägg till abonnemanget och
> ange att Sonja betalar.

**Förväntat svar och resultat:**

- Ett nytt Disney+-abonnemang kostar 99 kronor per månad i SEK. Belopp, valuta
  och intervall ska framgå entydigt av egenskapernas etiketter och värden
  tillsammans, i en eller flera egenskaper. Sonja betalar; hon är inte därmed
  avtalspart eller ägare.
- Disney+-abonnemang: namn Disney+-abonnemang; typ Abonnemang.
- Tillagt samband från Disney+-abonnemang till Disney+, med sambandstypen
  Gäller eller Tillhör tjänsten.
- Tillagt samband: Sonja → Betalar → Disney+-abonnemang.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 33. Uppdatera flera personers användning

Scenario-ID: `everyday-33`.

**Utvärderar:** Hantera flera tillägg och upphörd användning utan att förlora
andra samband.

**Startläge:** Kartan innehåller Johan (Person); Sonja (Person); Lo Berg
(Person); Spotify (Tjänst).

- Befintligt samband: Lo Berg → Använder → Spotify.

**Steg 1:**

> Johan och Sonja använder Spotify, men Lo har slutat. Uppdatera det.

**Förväntat svar och resultat:**

- Den tidigare användningen är antingen borttagen eller markerad som upphörd på
  samma befintliga samband, med dess identitet och övriga innehåll bevarade.
  Tjänsten finns kvar och är inte upphörd. Ett upphört samband anger inte
  aktuell användning.
- Tillagt samband: Johan → Använder → Spotify.
- Tillagt samband: Sonja → Använder → Spotify.

Tillåtet tillståndsalternativ 1:

- Den tidigare användningskopplingen för Lo tas bort.

Tillåtet tillståndsalternativ 2:

- Samma befintliga användningssamband för Lo markeras upphört; identitet och
  övrigt innehåll bevaras.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 34. Lägga till och koppla tjänstekonto

Scenario-ID: `everyday-34`.

**Utvärderar:** Skilja tjänstekonto från person och tjänst samt återge uttrycklig
användning och tjänstetillhörighet med rätt samband.

**Startläge:** Kartan innehåller Johan (Person); Spotify (Tjänst).

**Steg 1:**

> Lägg till Johans Spotify-konto. Johan använder kontot och det hör till Spotify.

**Förväntat svar och resultat:**

- Det nya objektet är Johans Spotify-konto, skilt från Johan och tjänsten
  Spotify.
- Johans Spotify-konto: namn Johans Spotify-konto; typ Tjänstekonto.
- Tillagt samband: Johan → Använder → Johans Spotify-konto.
- Tillagt samband: Johans Spotify-konto → Tillhör tjänsten → Spotify.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 35. Skilja inloggningsadress från kontaktadress

Scenario-ID: `everyday-35`.

**Utvärderar:** Bevara två olika e-postroller som samband till befintliga
e-postobjekt.

**Startläge:** Kartan innehåller Johans Spotify-konto (Tjänstekonto);
`johan@example.com` (E-postadress); `sonja@example.com` (E-postadress).

**Steg 1:**

> På Johans Spotify-konto är `johan@example.com` inloggningsadress och
> `sonja@example.com` kontaktadress.

**Förväntat svar och resultat:**

- Tillagt samband: Johans Spotify-konto → Inloggningsadress → `johan@example.com`.
- Tillagt samband: Johans Spotify-konto → Kontaktadress → `sonja@example.com`.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 36. Lägga till och koppla kort

Scenario-ID: `everyday-36`.

**Utvärderar:** Skapa kort och beroende bankkoppling utan att ändra bankkontot.

**Startläge:** Kartan innehåller Bankkontot hos Nordea (Bankkonto).

**Steg 1:**

> Lägg till vårt nya Visa-kort och koppla det till bankkontot hos Nordea.

**Förväntat svar och resultat:**

- Det nya kortets namn identifierar Visa-kortet. Kopplingen avser bankkontot hos
  Nordea, inte en kortfaktura.
- Visa-kortet: namn Visa-kortet; typ Kort.
- Tillagt samband: Visa-kortet → Kontokoppling → Bankkontot hos Nordea.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 37. Ersätta betalningsmedel

Scenario-ID: `everyday-37`.

**Utvärderar:** Ersätta den gamla kopplingen utan dubbla aktuella
betalningsmedel.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad; Visa-kortet
(Kort); Hushållskortet (Kort).

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.
- Befintligt samband: Netflix-abonnemang → Betalas med → Hushållskortet.

**Steg 1:**

> Netflix betalas numera med Visa-kortet, inte med Hushållskortet. Ändra det.

**Förväntat svar och resultat:**

- Tillagt samband: Netflix-abonnemang → Betalas med → Visa-kortet.
- Borttaget samband: Netflix-abonnemang → Betalas med → Hushållskortet.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 38. Lägga till bil med ägare och försäkring

Scenario-ID: `everyday-38`.

**Utvärderar:** Samordna nya objekt och beroende samband utan påhittat
försäkringsinnehåll.

**Startläge:** Kartan innehåller Johan (Person); Bilförsäkringen hos Folksam
(Försäkringsavtal); Folksam (Företag).

- Befintligt samband: Bilförsäkringen hos Folksam → Står på avtalet → Folksam.

**Steg 1:**

> Lägg till vår Volvo V60. Johan äger den och den är försäkrad hos Folksam.

**Förväntat svar och resultat:**

- Det nya fordonet är Volvo V60. Johan äger det och den befintliga
  bilförsäkringen hos Folksam försäkrar det.
- Volvo V60: namn Volvo V60; typ Fordon.
- Tillagt samband: Volvo V60 → Äger → Johan.
- Tillagt samband: Bilförsäkringen hos Folksam → Försäkrar → Volvo V60.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 39. Lägga till bostad och koppla bredband

Scenario-ID: `everyday-39`.

**Utvärderar:** Skapa bostad och koppla den befintliga anslutningen till den.

**Startläge:** Kartan innehåller Telias bredband (Abonnemang) med Pris: 399,
Valuta: SEK, Betalningsintervall: månad.

**Steg 1:**

> Vi har flyttat till Storgatan 12. Lägg till bostaden och koppla vårt bredband
> från Telia till den.

**Förväntat svar och resultat:**

- Den nya bostaden är Storgatan 12 och det befintliga Telia-bredbandet hör till
  den.
- Storgatan 12: namn Storgatan 12; typ Bostad.
- Tillagt samband: Telias bredband → Hör till → Storgatan 12.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 40. Avsluta gymabonnemang

Scenario-ID: `everyday-40`.

**Utvärderar:** Bevara historiska uppgifter när ett abonnemang markeras upphört.

**Startläge:** Kartan innehåller Johan (Person); Johans gymkort hos Nordic
Wellness (Abonnemang) med Pris: 399, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Johans gymkort hos Nordic Wellness → Står på avtalet →
  Johan.

**Steg 1:**

> Johan har sagt upp sitt gymkort hos Nordic Wellness. Markera abonnemanget som
> avslutat, men behåll uppgifterna om det.

**Förväntat svar och resultat:**

- Johans gymkort hos Nordic Wellness är upphört, finns kvar och behåller alla
  egenskaper och samband.
- Johans gymkort hos Nordic Wellness: markerat upphört.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 41. Ta bort tjänst och tjänstekonto

Scenario-ID: `everyday-41`.

**Utvärderar:** Ta bort flera uttryckligen angivna objekt och deras kopplingar
avgränsat.

**Startläge:** Kartan innehåller NordVPN (Tjänst); Mitt gamla NordVPN-konto
(Tjänstekonto).

- Befintligt samband: Mitt gamla NordVPN-konto → Tillhör tjänsten → NordVPN.

**Steg 1:**

> Ta bort NordVPN och mitt gamla NordVPN-konto. Vi använder dem inte längre.

**Förväntat svar och resultat:**

- NordVPN tas bort.
- Mitt gamla NordVPN-konto tas bort.
- Borttaget samband: Mitt gamla NordVPN-konto → Tillhör tjänsten → NordVPN.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 42. Byta musiktjänst

Scenario-ID: `everyday-42`.

**Utvärderar:** Skilja avslut av gammalt abonnemang från skapande av ny tjänst
och användning.

**Startläge:** Kartan innehåller Johan (Person); Sonja (Person); Spotify
(Tjänst); Spotify-abonnemang (Abonnemang) med Pris: 119, Valuta: SEK,
Betalningsintervall: månad.

- Befintligt samband: Spotify-abonnemang → Gäller → Spotify.

**Steg 1:**

> Markera Spotify-abonnemanget som avslutat. Lägg till tjänsten Apple Music och
> ange att Johan och Sonja använder den.

**Förväntat svar och resultat:**

- Spotify-abonnemanget är avslutat och behålls. Apple Music är en ny tjänst som
  Johan och Sonja använder. Inga priser eller andra uppgifter om Apple Music
  hittas på.
- Spotify-abonnemang: markerat upphört.
- Apple Music: namn Apple Music; typ Tjänst.
- Tillagt samband: Johan → Använder → Apple Music.
- Tillagt samband: Sonja → Använder → Apple Music.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 43. Rätta pris i samma meddelande

Scenario-ID: `everyday-43`.

**Utvärderar:** Låta den sista uttryckliga rättelsen styra belopp och period.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.

**Steg 1:**

> Ändra priset på Netflix till 199 kronor. Nej, jag menar 189 kronor i månaden.

**Förväntat svar och resultat:**

- Netflix-abonnemang: Pris: 189; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 44. Besvara prisfråga före prisändring

Scenario-ID: `everyday-44`.

**Utvärderar:** Besvara frågan från tillståndet före ändringen och därefter göra
rätt ändring.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad.

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.

**Steg 1:**

> Vad kostar Netflix i dag? Ändra sedan priset till 189 kronor i månaden.

**Förväntat svar och resultat:**

- Besvara även prisfrågan: Netflix kostar 149 kronor per månad före ändringen.
  Det nya utkastpriset är 189 kronor per månad.
- Netflix-abonnemang: Pris: 189; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 45. Visa bil och ändra beskrivning

Scenario-ID: `everyday-45`.

**Utvärderar:** Kombinera klientbekräftad markering med en avgränsad
egenskapsändring.

**Startläge:** Kartan innehåller Volvo V60 (Fordon).

**Steg 1:**

> Visa vår Volvo V60 och skriv i beskrivningen att vinterdäcken ligger i
> garaget.

**Förväntat svar och resultat:**

- Volvo V60:s beskrivning anger att vinterdäcken ligger i garaget. Beskrivningen
  får även behålla uppgiften Blå bil. Ingen ytterligare egenskap läggs till.
  Bekräfta bara faktiskt visad markering av Volvo V60.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

**Visning:** Den avsedda markeringen i kartan ska vara bekräftad av klienten,
inte enbart påstådd i assistentens svar.

### 46. Lägga till bredband med okänt pris

Scenario-ID: `everyday-46`.

**Utvärderar:** Skapa en anslutning med bostadskoppling utan att fylla i ett
okänt pris.

**Startläge:** Kartan innehåller Storgatan 12 (Bostad); Bahnhofs bredband
(Tjänst).

**Avgränsning i kontrollen:** Kontrollens tillståndskrav använder sambandstypen
Gäller eller Tillhör tjänsten från abonnemanget till Bahnhofs bredband. Exakt
ett av dessa samband ska läggas till. Båda alternativen kräver dessutom Hör
till från abonnemanget till Storgatan 12; tjänst och bostad är skilda ändpunkter.

**Steg 1:**

> Lägg till vårt nya bredband från Bahnhof och koppla det till Storgatan 12. Jag
> vet inte priset än.

**Förväntat svar och resultat:**

- Det nya bredbandsabonnemanget gäller Bahnhof och Storgatan 12. Priset är
  okänt: det kan saknas, vara tomt eller uttryckligen okänt. Ingen annan ny
  egenskap får läggas till. Priset får inte hittas på eller kopieras från ett
  annat abonnemang. Ingen fråga om pris behövs för att lägga till det.
- Bredband från Bahnhof: namn Bredband från Bahnhof; typ Abonnemang.
- Tillagt samband från Bredband från Bahnhof till Bahnhofs bredband, med
  sambandstypen Gäller eller Tillhör tjänsten.
- Tillagt samband: Bredband från Bahnhof → Hör till → Storgatan 12.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 47. Avsluta en persons användning och ange osäker ny användning

Scenario-ID: `everyday-47`.

**Utvärderar:** Bevara en säker upphörd användning och en uttryckligen osäker ny
uppgift samtidigt.

**Startläge:** Kartan innehåller Alex Lind (Person); Mira Dahl (Person); Dropbox
(Tjänst).

- Befintligt samband: Alex Lind → Använder → Dropbox.

**Steg 1:**

> Alex använder inte Dropbox längre. Jag tror att Mira har tagit över det, men
> jag är inte säker.

**Förväntat svar och resultat:**

- Miras användning av Dropbox måste i själva kartan uttryckligen vara osäkert
  uppgiven: en sann osäkerhetsmarkering eller en tydligt osäker text på
  sambandet, alternativt en enda textuppgift på Dropbox som uttryckligen anger
  att Mira möjligen använder tjänsten utan en säker användningskoppling. En bar
  säker användningskoppling eller bara osäker svarstext räcker inte. Ingen annan
  uppgift läggs till.
- Den tidigare användningen är antingen borttagen eller markerad som upphörd på
  samma befintliga samband, med dess identitet och övriga innehåll bevarade.
  Tjänsten finns kvar och är inte upphörd. Ett upphört samband anger inte
  aktuell användning.

Tillåtet tillståndsalternativ 1:

- Alex tidigare användningskoppling tas bort. Mira får ett Använder-samband till
  Dropbox med uttrycklig osäkerhet om samma uppgift.

Tillåtet tillståndsalternativ 2:

- Alex tidigare användningskoppling tas bort. Dropbox får en enda tydligt osäker
  text om Miras möjliga användning, utan säkert användningssamband.

Tillåtet tillståndsalternativ 3:

- Alex befintliga användningssamband markeras upphört med bibehållen identitet.
  Mira får ett Använder-samband till Dropbox med uttrycklig osäkerhet om samma
  uppgift.

Tillåtet tillståndsalternativ 4:

- Alex befintliga användningssamband markeras upphört med bibehållen identitet.
  Dropbox får en enda tydligt osäker text om Miras möjliga användning, utan
  säkert användningssamband.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 48. Koppla person till befintlig tjänst

Scenario-ID: `everyday-48`.

**Utvärderar:** Använda avsedd person, befintlig tjänst och rätt
användningssamband.

**Startläge:** Kartan innehåller Alex Lind (Person); Alex Berg (Person);
Microsoft 365 (Tjänst).

**Steg 1:**

> Koppla Alex till Microsoft 365.

**Förväntat svar och resultat:**

- Kartan innehåller både Alex Lind och Alex Berg. Fråga vilken Alex användaren
  menar innan någon person kopplas till Microsoft 365. Gissa inte, även om
  gissningen råkar avse Alex Lind. Påstå inte att uppdraget är klart eller
  sparat.
- Tillagt samband: Alex Lind → Använder → Microsoft 365.

**Villkorat extra följdsvar:**

Skickas endast när: Frågan ber användaren skilja Alex Lind från Alex Berg och
får även fråga vilken koppling personen ska ha till Microsoft 365. Svaret
identifierar Alex Lind och anger att han använder tjänsten. Inga andra
obesvarade frågor kräver ett annat svar.

> Jag menar Alex Lind. Han använder Microsoft 365.

I vänteläget gäller:

- Fråga vilken Alex som avses, bevara uppdraget och ändra eller spara inget.
- Steget gör inga ytterligare ändringar och sparar inget; tidigare verifierade
  utkaständringar bevaras.

Efter svaret gäller det ursprungliga målet samt:

- Bekräfta endast verifierade ändringar i utkastet. Påstå inte att något är
  sparat, hitta inte på fakta och ställ ingen obegärd sparfråga.
- Bedöm hela observerade kartan och utkastet, inte bara svarstexten. Bevara alla
  andra objekt, egenskaper och samband. Inga nya fakta utöver begäran får läggas
  till.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 49. Bygga upp tjänst, användning och pris i tre steg

Scenario-ID: `everyday-49`.

**Utvärderar:** Bevara referenser, tidigare ändringar och prisets betydelse
genom ett kort samtal.

**Startläge:** Kartan innehåller Sonja (Person).

**Steg 1:**

> Lägg till Disney+.

**Förväntat svar och resultat:**

- Den nya tjänsten är Disney+.
- Disney+: namn Disney+; typ Tjänst.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

**Steg 2 – ordinarie följdmeddelande:**

> Sonja använder det.

**Förväntat svar och resultat:**

- Tillagt samband: Sonja → Använder → Disney+.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

**Steg 3 – ordinarie följdmeddelande:**

> Det kostar 99 kronor i månaden.

**Förväntat svar och resultat:**

- Disney+ kostar 99 kronor per månad i SEK, på tjänsten eller på ett enda
  kopplat abonnemang. Belopp, valuta och intervall ska framgå entydigt av
  egenskapernas etiketter och värden tillsammans, i en eller flera egenskaper.
  Sonjas användning bevaras och inga övriga fakta läggs till.

Tillåtet tillståndsalternativ 1:

- Priset anges på tjänsten Disney+.

Tillåtet tillståndsalternativ 2:

- Ett enda nytt Disney+-abonnemang innehåller priset och kopplas till Disney+
  med Gäller.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 50. Ändra två priser och därefter rätta ett

Scenario-ID: `everyday-50`.

**Utvärderar:** Rätta bara det sist angivna priset och bevara den andra
prisändringen.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad; Disney+
(Tjänst); Disney+-abonnemang (Abonnemang) med Pris: 99, Valuta: SEK,
Betalningsintervall: månad.

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.
- Befintligt samband: Disney+-abonnemang → Gäller → Disney+.

**Steg 1:**

> Ändra Netflix till 189 kronor och Disney+ till 109 kronor i månaden.

**Förväntat svar och resultat:**

- Netflix-abonnemang: Pris: 189; Valuta: SEK; Betalningsintervall: månad.
- Disney+-abonnemang: Pris: 109; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

**Steg 2 – ordinarie följdmeddelande:**

> Jag menade 119 för Disney+.

**Förväntat svar och resultat:**

- Disney+-abonnemang: Pris: 119; Valuta: SEK; Betalningsintervall: månad.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 51. Ändra pris och spara hela utkastet

Scenario-ID: `everyday-51`.

**Utvärderar:** Genomföra ändring och uttryckligt sparande av hela utkastet med
verifierat sparbesked.

**Startläge:** Kartan innehåller Netflix (Tjänst); Netflix-abonnemang
(Abonnemang) med Pris: 149, Valuta: SEK, Betalningsintervall: månad; Lo Berg
(Person).

- Befintligt samband: Netflix-abonnemang → Gäller → Netflix.
- Befintligt utkast för Lo Berg: Beskrivning: Spelar schack.

**Steg 1:**

> Ändra priset på Netflix till 189 kronor i månaden och spara hela utkastet.

**Förväntat svar och resultat:**

- Ge ett kort verifierat sparbesked om hela utkastet, utan obegärd uppräkning.
  Ett allmänt besked om att ändringarna är sparade räcker; det måste styrkas av
  observerat tillstånd och sparkvitto.
- Netflix-abonnemang: Pris: 189; Valuta: SEK; Betalningsintervall: månad.
- 1 verifierat sparande av hela utkastet; även tidigare förslag ingår.

**Om en annan nödvändig fråga behövs:** Ställ en nödvändig relevant följdfråga
om något som varken begäran eller kartans fakta avgör. Bevara den exakta
oavslutade begäran. Hitta inte på ett svar, ändra inga andra uppgifter och påstå
inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### 52. Kort prisfråga

Scenario-ID: `everyday-question`.

**Utvärderar:** Besvara en kort prisfråga direkt från kartan utan att ändra
eller spara.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Vad kostar Spotify Premium Family?

**Förväntat svar och resultat:**

- Svara att Spotify Premium Family kostar 179 kronor per månad enligt kartan;
  hitta inte på andra uppgifter och ändra eller spara inget.

### 53. En enkel beskrivningsändring

Scenario-ID: `everyday-change`.

**Utvärderar:** Göra en enkel egenskapsändring och respektera förbudet mot
sparande.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Ändra Lo Bergs beskrivning till Spelar schack. Spara inte.

**Förväntat svar och resultat:**

- Bekräfta en verifierad utkaständring utan sparpåstående, sparfråga eller
  obegärd uppräkning.
- Lo Berg: Beskrivning: Spelar schack.

### 54. Kort fråga med enkel följdfråga

Scenario-ID: `everyday-follow-up`.

**Utvärderar:** Bevara referensen ”det” genom en kort informationsdialog.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Vad kostar Molnlagring Plus?

**Förväntat svar och resultat:**

- Svara att Molnlagring Plus kostar 199 kronor per månad enligt kartan. Ändra
  eller spara inget.

**Steg 2 – ordinarie följdmeddelande:**

> Vilket betalningsintervall har det?

**Förväntat svar och resultat:**

- Svara att Molnlagring Plus har betalningsintervallet månad. Bevara
  hänvisningen utan onödig fråga och ändra eller spara inget.

### 55. Läsa pris och beskriva utkastet

Scenario-ID: `read-price-draft`.

**Utvärderar:** Skilja sparad karta från osparade förslag och redovisa båda
rätt.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Vad kostar Spotify Premium Family? Berätta vilka ändringar som ligger i mitt
> utkast.

**Förväntat svar och resultat:**

- Spotify Premium Family kostar 179 kronor per månad enligt sparad karta.
- Redovisa både Lo Bergs beskrivning Övar cello på tisdagar. och Netflix
  Standards pris 149 kronor som utkastförslag.

### 56. Ändra pris och betalningsmedel

Scenario-ID: `change-price-payment`.

**Utvärderar:** Genomföra två oberoende ändringar och ersätta rätt
betalningskoppling.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Ändra priset för Molnlagring Plus till 229 kronor per månad och låt Spotify
> Premium Family betalas med Hushållskortet.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber användaren bekräfta att prisändringen avser det
befintliga abonnemanget Molnlagring Plus. Inga andra obesvarade frågor kräver
ett annat följdsvar.

> Jag menar abonnemanget Molnlagring Plus.

I vänteläget gäller:

- Bekräfta endast verifierade utkaständringar och skilj dem från det som väntar
  på förtydligande. Påstå inte att hela uppdraget är klart eller sparat och
  ställ ingen sparfråga.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.

Efter svaret gäller det ursprungliga målet samt:

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.

### 57. Två oklarheter, följdsvar och sparbesked

Scenario-ID: `two-ambiguities`.

**Utvärderar:** Ställa nödvändiga identitetsfrågor, bevara oberoende arbete och
kräva ny sparbegäran.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

Varianten lägger till personen Alex Berg, låter Lo Berg stå på Spotify Premium
Family och låter det betalas med Hushållskortet. Både Bankkonto Hushåll och
Bankkonto Reserv finns. ”Alex” och ”bankkontot” är därför tvetydiga.

**Steg 1:**

> Lo Berg använder Spotify. Priset för Molnlagring Plus ska vara 229 kronor per
> månad. Alex använder Microsoft 365 och Spotify Premium Family ska betalas från
> bankkontot. Spara hela utkastet.

**Förväntat svar och resultat:**

- Fråga om Alex Lind eller Alex Berg avses.
- Fråga om Bankkonto Hushåll eller Bankkonto Reserv avses.
- Säg att tidigare sparbegäran inte gäller längre och att användaren behöver be
  om sparande igen.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Lo Berg → Använder → Spotify.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber uttryckligen användaren bekräfta att månadspriset
avser det befintliga abonnemanget Molnlagring Plus. Frågan får gälla ett osäkert
uppfattat namn eller skilja abonnemanget från tjänsten. Ett påstående om priset
eller enbart frågor om person och bank uppfyller inte kravet. Övriga obesvarade
frågor gäller endast vilken Alex och vilket bankkonto som avses.

> Jag menar abonnemanget Molnlagring Plus.

I vänteläget gäller:

- Tillagt samband: Lo Berg → Använder → Spotify.

Efter svaret gäller det ursprungliga målet samt:

- Fråga om Alex Lind eller Alex Berg avses.
- Fråga om Bankkonto Hushåll eller Bankkonto Reserv avses.
- Behandla prisets mål som klarlagt och påstå inte att utkastet är sparat.

**Steg 2 – ordinarie följdmeddelande:**

> Jag menar Alex Lind och Bankkonto Reserv.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Tillagt samband: Alex Lind → Använder → Microsoft 365.
- Tillagt samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Spotify Premium Family → Betalas med → Hushållskortet.

**Steg 3 – ordinarie följdmeddelande:**

> Spara hela utkastet.

**Förväntat svar och resultat:**

- Ge ett kort verifierat sparbesked.
- 1 verifierat sparande av hela utkastet; även tidigare förslag ingår.

### 58. Prisändring med hypotetisk sparfråga

Scenario-ID: `hypothetical-save`.

**Utvärderar:** Skilja en fråga om sparandets konsekvenser från tillstånd att
spara.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Ändra priset för Molnlagring Plus till 229 kronor. Vad händer om vi sparar
> hela utkastet?

**Förväntat svar och resultat:**

- Förklara att även tidigare förslag om Lo Berg och Netflix Standard skulle
  sparas tillsammans med prisändringen. Påstå inget faktiskt sparande.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber användaren bekräfta att prisändringen avser det
befintliga abonnemanget Molnlagring Plus. Inga andra obesvarade frågor kräver
ett annat följdsvar.

> Jag menar abonnemanget Molnlagring Plus.

I vänteläget gäller:

- Förklara att ett sparande av hela utkastet även skulle omfatta de tidigare
  förslagen om Lo Bergs beskrivning och Netflix Standards pris. Prisändringen
  väntar på förtydligande. Påstå inget faktiskt sparande och be inte om
  sparande.
- Steget gör inga ytterligare ändringar och sparar inget; tidigare verifierade
  utkaständringar bevaras.

Efter svaret gäller det ursprungliga målet samt:

- Förklara att även tidigare förslag om Lo Berg och Netflix Standard skulle
  sparas tillsammans med prisändringen. Påstå inget faktiskt sparande.

### 59. Ångra senaste osparade prisändringen

Scenario-ID: `undo-price`.

**Utvärderar:** Ångra bara den senaste osparade prisändringen och bevara andra
förslag.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

Varianten har också ett osparat prisförslag på Molnlagring Plus: 229 kronor per
månad. Det är den senaste osparade prisändringen.

**Steg 1:**

> Ångra den senaste osparade prisändringen.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Molnlagring Plus: Pris: 199; Valuta: SEK; Betalningsintervall: månad.

### 60. Avbryta pågående arbete

Scenario-ID: `everyday-stop`.

**Utvärderar:** Stoppa återstående arbete genom den publika avbrottskontrollen
och bevara verkliga delresultat.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Ändra priset för Molnlagring Plus till 229 kronor per månad och låt Spotify
> Premium Family betalas med Hushållskortet.

När arbetet för första gången visar att det pågår trycker testet på den publika
Stopp-kontrollen. Återstående arbete ska avbrytas. Ingen ändring får sparas.
Utgångsläget, redan slutförd prisändring, redan slutförd ändring av
betalningsmedel eller båda slutförda delarna är tillåtna; en tidigare slutförd
självständig del ska bevaras. Kontrollens observationsgräns är 5 000 ms. Detta
är ingen tidsgräns för vanliga modelluppdrag och ger ingen lyckad slutförandetid
för det avbrutna uppdraget.

## Avancerade tester

Gruppen prövar långa instruktioner, många samtidiga krav, egna typer eller
begränsningar i representationen. Korrekthet, åtkomst och sparskydd gäller lika
strikt här. En förklarad säker oförmåga med bevarat underlag och oavslutat
uppdrag är en separat förmågegräns, inte slutfört arbete.

### Längre uppdrag med sen prisrättelse

Scenario-ID: `late-price-correction`.

**Utvärderar:** Bevara många begränsningar och låta en sen rättelse ersätta bara
rätt pris.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Jag vill ordna flera uppgifter om våra tjänster. Alex Lind och Lo Berg
> använder Spotify, men Mira Dahl använder inte den tjänsten. Lägg till
> användningen för Alex och Lo och ta bort den för Mira. Alex Lind använder
> också Microsoft 365. Spotify Premium Family ska betalas med Hushållskortet.
> Det är fortfarande Alex som står på abonnemanget, så ändra inte den uppgiften.
> Tjänstekontot Alex arbete hos Microsoft 365 ska ha `alex@norrsken.test` som
> inloggningsadress och `hushall@norrsken.test` som kontaktadress. Det är två
> olika roller, och du ska inte byta namnet på tjänstekontot. Abonnemanget
> Molnlagring Plus kostar 249 kronor per månad och ska betalas från Bankkonto
> Hushåll. Lo betalar det abonnemanget men Mira använder tjänsten Norrsken
> Molnlagring. Ändra bara de uppgifter som jag har nämnt och lämna våra andra
> abonnemang som de är. Jag rättar en sak: Molnlagring Plus ska kosta 229 kronor
> per månad, inte 249. Allt annat som jag bad om gäller fortfarande.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Alex Lind → Använder → Spotify.
- Tillagt samband: Lo Berg → Använder → Spotify.
- Tillagt samband: Alex Lind → Använder → Microsoft 365.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Tillagt samband: Alex arbete → Inloggningsadress → `alex@norrsken.test`.
- Tillagt samband: Alex arbete → Kontaktadress → `hushall@norrsken.test`.
- Tillagt samband: Molnlagring Plus → Betalas med → Bankkonto Hushåll.
- Tillagt samband: Lo Berg → Betalar → Molnlagring Plus.
- Tillagt samband: Mira Dahl → Använder → Norrsken Molnlagring.
- Borttaget samband: Mira Dahl → Använder → Spotify.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Alex arbete → Inloggningsadress → `m365@norrsken.test`.
- Borttaget samband: Alex arbete → Kontaktadress → `m365@norrsken.test`.
- Borttaget samband: Molnlagring Plus → Betalas med → Hushållskortet.
- Borttaget samband: Alex Lind → Betalar → Molnlagring Plus.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber om bekräftelse av den befintliga personen Mira
Dahl, tjänstekontot Alex arbete och kontaktadressen `hushall@norrsken.test` utan
å. Alla tre frågorna ställs och inga andra obesvarade frågor kräver ett annat
följdsvar.

> Ja, jag menar personen Mira Dahl och tjänstekontot Alex arbete som redan finns
> i kartan. Använd den befintliga kontaktadressen hushall, snabel-a, norrsken,
> punkt test. Hushall stavas med a utan ring.

I vänteläget gäller:

- Bekräfta endast verifierade utkaständringar och skilj dem från det som väntar
  på förtydligande. Påstå inte att hela uppdraget är klart eller sparat och
  ställ ingen sparfråga.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Alex Lind → Använder → Spotify.
- Tillagt samband: Lo Berg → Använder → Spotify.
- Tillagt samband: Alex Lind → Använder → Microsoft 365.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Tillagt samband: Molnlagring Plus → Betalas med → Bankkonto Hushåll.
- Tillagt samband: Lo Berg → Betalar → Molnlagring Plus.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Molnlagring Plus → Betalas med → Hushållskortet.
- Borttaget samband: Alex Lind → Betalar → Molnlagring Plus.

Efter svaret gäller det ursprungliga målet samt:

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

### Längre uppdrag med sparbesked sist

Scenario-ID: `save-last`.

**Utvärderar:** Bevara ett långt uppdrag och dess sparbegäran samt ge besked
först efter verifierat sparande.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Jag vill ordna flera uppgifter om våra tjänster. Alex Lind och Lo Berg
> använder Spotify, men Mira Dahl använder inte den tjänsten. Lägg till
> användningen för Alex och Lo och ta bort den för Mira. Alex Lind använder
> också Microsoft 365. Spotify Premium Family ska betalas med Hushållskortet.
> Det är fortfarande Alex som står på abonnemanget, så ändra inte den uppgiften.
> Tjänstekontot Alex arbete hos Microsoft 365 ska ha `alex@norrsken.test` som
> inloggningsadress och `hushall@norrsken.test` som kontaktadress. Det är två
> olika roller, och du ska inte byta namnet på tjänstekontot. Abonnemanget
> Molnlagring Plus kostar 229 kronor per månad och ska betalas från Bankkonto
> Hushåll. Lo betalar det abonnemanget men Mira använder tjänsten Norrsken
> Molnlagring. Ändra bara de uppgifter som jag har nämnt och lämna våra andra
> abonnemang som de är. Spara nu hela utkastet med alla de här ändringarna.

**Förväntat svar och resultat:**

- Ge ett kort verifierat sparbesked, utan obegärd uppräkning eller
  sammanfattning.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Alex Lind → Använder → Spotify.
- Tillagt samband: Lo Berg → Använder → Spotify.
- Tillagt samband: Alex Lind → Använder → Microsoft 365.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Tillagt samband: Alex arbete → Inloggningsadress → `alex@norrsken.test`.
- Tillagt samband: Alex arbete → Kontaktadress → `hushall@norrsken.test`.
- Tillagt samband: Molnlagring Plus → Betalas med → Bankkonto Hushåll.
- Tillagt samband: Lo Berg → Betalar → Molnlagring Plus.
- Tillagt samband: Mira Dahl → Använder → Norrsken Molnlagring.
- Borttaget samband: Mira Dahl → Använder → Spotify.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Alex arbete → Inloggningsadress → `m365@norrsken.test`.
- Borttaget samband: Alex arbete → Kontaktadress → `m365@norrsken.test`.
- Borttaget samband: Molnlagring Plus → Betalas med → Hushållskortet.
- Borttaget samband: Alex Lind → Betalar → Molnlagring Plus.
- 1 verifierat sparande av hela utkastet; även tidigare förslag ingår.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber om bekräftelse av tjänsten Microsoft 365,
tjänstekontot Alex arbete med inloggningsadressen `alex@norrsken.test` och
kontaktadressen `hushall@norrsken.test` samt tjänsten Norrsken Molnlagring för
Miras användning. Alla dessa frågor ställs och inga andra obesvarade frågor
kräver ett annat följdsvar.

> Ja, jag menar den befintliga tjänsten Microsoft 365 och tjänstekontot Alex
> arbete. Inloggningsadressen är alex, snabel-a, norrsken, punkt test.
> Kontaktadressen är hushall, snabel-a, norrsken, punkt test, med a utan ring i
> hushall. Mira ska använda den befintliga tjänsten Norrsken Molnlagring. Gör
> klart ändringarna. Jag ber nu på nytt: spara hela utkastet.

I vänteläget gäller:

- Bekräfta endast verifierade utkaständringar och skilj dem från det som väntar
  på förtydligande. Påstå inget genomfört sparande.
- Förmedla att den tidigare sparbegäran inte räcker och att användaren behöver
  be om sparande igen när frågorna är lösta. Innebörden får uttryckas
  tillsammans eller med annan formulering.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Alex Lind → Använder → Spotify.
- Tillagt samband: Lo Berg → Använder → Spotify.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Tillagt samband: Molnlagring Plus → Betalas med → Bankkonto Hushåll.
- Tillagt samband: Lo Berg → Betalar → Molnlagring Plus.
- Borttaget samband: Mira Dahl → Använder → Spotify.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Molnlagring Plus → Betalas med → Hushållskortet.
- Borttaget samband: Alex Lind → Betalar → Molnlagring Plus.

Efter svaret gäller det ursprungliga målet samt:

- Ge ett kort verifierat sparbesked, utan obegärd uppräkning eller
  sammanfattning.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

### Samband med oklar riktning

Scenario-ID: `relationship-direction`.

**Utvärderar:** Fråga efter oklar riktning och sedan använda det uttryckliga
följdsvaret.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Skapa ett samband av typen Levererar till mellan Microsoft 365 och Tenant
> Norrsken Bygg.

**Förväntat svar och resultat:**

- Fråga vilken av Microsoft 365 och Tenant Norrsken Bygg som levererar till den
  andra. Fråga inte efter den redan givna typen Levererar till.

**Steg 2 – ordinarie följdmeddelande:**

> Microsoft 365 ska leverera till Tenant Norrsken Bygg.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Tillagt samband: Microsoft 365 → Levererar till → Tenant Norrsken Bygg.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret frågar om den namngivna levererande tjänsten avser
befintliga Microsoft 365. Den redan angivna riktningen till Tenant Norrsken Bygg
ifrågasätts inte. Inga andra obesvarade frågor kräver ett annat följdsvar.

> Ja, det är den befintliga tjänsten Microsoft 365. Den ska leverera till Tenant
> Norrsken Bygg.

I vänteläget gäller:

- Bekräfta endast verifierade utkaständringar och skilj dem från det som väntar
  på förtydligande. Påstå inte att hela uppdraget är klart eller sparat och
  ställ ingen sparfråga.
- Steget gör inga ytterligare ändringar och sparar inget; tidigare verifierade
  utkaständringar bevaras.

Efter svaret gäller det ursprungliga målet samt:

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.

### Frågor blandade med ändringar

Scenario-ID: `questions-and-changes`.

**Utvärderar:** Kombinera uppdateringar, faktasvar, utkastunderlag, visning och
beställd sammanfattning.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Jag vill ordna flera uppgifter om våra tjänster. Alex Lind och Lo Berg
> använder Spotify, men Mira Dahl använder inte den tjänsten. Lägg till
> användningen för Alex och Lo och ta bort den för Mira. Alex Lind använder
> också Microsoft 365. Spotify Premium Family ska betalas med Hushållskortet.
> Det är fortfarande Alex som står på abonnemanget, så ändra inte den uppgiften.
> Tjänstekontot Alex arbete hos Microsoft 365 ska ha `alex@norrsken.test` som
> inloggningsadress och `hushall@norrsken.test` som kontaktadress. Det är två
> olika roller, och du ska inte byta namnet på tjänstekontot. Abonnemanget
> Molnlagring Plus kostar 229 kronor per månad och ska betalas från Bankkonto
> Hushåll. Lo betalar det abonnemanget men Mira använder tjänsten Norrsken
> Molnlagring. Ändra bara de uppgifter som jag har nämnt och lämna våra andra
> abonnemang som de är. Berätta också vad Spotify Premium Family kostar enligt
> den sparade kartan och vilka personer som använder Microsoft 365 enligt mitt
> utkast. Visa tjänstekontot Alex arbete i kartan när du är klar. Sammanfatta
> både ändringarna och svaren på mina frågor.

**Förväntat svar och resultat:**

- Sammanfatta alla beställda ändringar och ge de begärda faktasvaren.
- Spotify Premium Family kostar 179 kronor enligt sparad karta.
- Alex Lind och Lo Berg använder Microsoft 365 enligt utkastet.
- Bekräfta endast klientbekräftad markering av Alex arbete.
- Ställ inga identitetsfrågor eller sparfrågor.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Alex Lind → Använder → Spotify.
- Tillagt samband: Lo Berg → Använder → Spotify.
- Tillagt samband: Alex Lind → Använder → Microsoft 365.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Tillagt samband: Alex arbete → Inloggningsadress → `alex@norrsken.test`.
- Tillagt samband: Alex arbete → Kontaktadress → `hushall@norrsken.test`.
- Tillagt samband: Molnlagring Plus → Betalas med → Bankkonto Hushåll.
- Tillagt samband: Lo Berg → Betalar → Molnlagring Plus.
- Tillagt samband: Mira Dahl → Använder → Norrsken Molnlagring.
- Borttaget samband: Mira Dahl → Använder → Spotify.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Alex arbete → Inloggningsadress → `m365@norrsken.test`.
- Borttaget samband: Alex arbete → Kontaktadress → `m365@norrsken.test`.
- Borttaget samband: Molnlagring Plus → Betalas med → Hushållskortet.
- Borttaget samband: Alex Lind → Betalar → Molnlagring Plus.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber om bekräftelse av de befintliga personerna Alex
Lind och Mira Dahl för deras användning av tjänsterna. Båda frågorna ställs och
inga andra obesvarade frågor kräver ett annat följdsvar.

> Ja, jag menar personerna Alex Lind och Mira Dahl som redan finns i kartan. Gör
> klart ändringarna och sammanfatta dem tillsammans med svaren på mina frågor.

I vänteläget gäller:

- Sammanfatta alla genomförda oberoende ändringar enligt det verifierade
  utkastet: Lo använder Spotify, Spotify betalas med Hushållskortet, Alex arbete
  har separata inloggnings- och kontaktadresser, Molnlagring Plus kostar 229
  kronor per månad, betalas från Bankkonto Hushåll och betalas av Lo.
  Personändringarna för Alex och Mira väntar på förtydligande. Påstå inget
  sparande.
- Spotify Premium Family kostar 179 kronor enligt sparad karta. Lo Berg använder
  Microsoft 365 enligt det aktuella utkastet; Alex användning väntar på
  förtydligande.
- Bekräfta endast klientbekräftad markering av Alex arbete. Ställ ingen
  sparfråga.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.
- Tillagt samband: Lo Berg → Använder → Spotify.
- Tillagt samband: Spotify Premium Family → Betalas med → Hushållskortet.
- Tillagt samband: Alex arbete → Inloggningsadress → `alex@norrsken.test`.
- Tillagt samband: Alex arbete → Kontaktadress → `hushall@norrsken.test`.
- Tillagt samband: Molnlagring Plus → Betalas med → Bankkonto Hushåll.
- Tillagt samband: Lo Berg → Betalar → Molnlagring Plus.
- Borttaget samband: Spotify Premium Family → Betalas med → Bankkonto Reserv.
- Borttaget samband: Alex arbete → Inloggningsadress → `m365@norrsken.test`.
- Borttaget samband: Alex arbete → Kontaktadress → `m365@norrsken.test`.
- Borttaget samband: Molnlagring Plus → Betalas med → Hushållskortet.
- Borttaget samband: Alex Lind → Betalar → Molnlagring Plus.

Efter svaret gäller det ursprungliga målet samt:

- Sammanfatta alla beställda ändringar och ge de begärda faktasvaren.
- Spotify Premium Family kostar 179 kronor enligt sparad karta.
- Alex Lind och Lo Berg använder Microsoft 365 enligt utkastet.
- Bekräfta endast klientbekräftad markering av Alex arbete.
- Ställ inga identitetsfrågor eller sparfrågor.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

**Visning:** Den avsedda markeringen i kartan ska vara bekräftad av klienten,
inte enbart påstådd i assistentens svar.

### Skapa objekttyp och objekt med fri datumegenskap

Scenario-ID: `custom-type-date`.

**Utvärderar:** Skapa en egen objekttyp, ett objekt och en fri datumegenskap
utan schemaberoende genvägar.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Skapa objekttypen Solcellsanläggning. Lägg till Soltak Norr 7 med den fria
> datumegenskapen Installationsdatum, 3 juni 2025.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Soltak Norr 7: namn Soltak Norr 7; typ Solcellsanläggning; Installationsdatum:
  2025-06-03.
- Ny objekttyp: Solcellsanläggning.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

### Ange okänd användare

Scenario-ID: `unknown-user`.

**Utvärderar:** Skilja en okänd ändpunkt från ett identifierat objekt och bevara
det oavslutade uppdraget.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

Varianten har dessutom sambandet Norrsken Molnlagring → Används av → Alex Lind.

**Steg 1:**

> Lägg till ett separat Används av-samband från Norrsken Molnlagring, men jag
> vet inte vem det ska gå till. Behåll befintliga samband.

**Förväntat svar och resultat:**

- Be användaren precisera ändpunkten eller vilken befintlig koppling som ska
  rättas. Behåll begäran i samtalet utan att skapa ett samband, objekt eller en
  ersättningsegenskap och utan att ändra kartan.

**Om en annan nödvändig fråga behövs:** Fråga efter den saknade giltiga
ändpunkten eller ett nödvändigt val av alternativ representation. Bevara den
exakta oavslutade begäran och alla uppgifter utan ändring. Påstå inte att
uppdraget är slutfört eller sparat. Något generellt automatiskt följdsvar är
inte definierat för den grenen.

### Ange att ingen använder tjänsten

Scenario-ID: `no-user`.

**Utvärderar:** Skilja uttryckligen ingen från okänd eller namngiven person och
fråga före alternativ representation.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

Varianten har dessutom sambandet Norrsken Molnlagring → Används av → Alex Lind.

**Steg 1:**

> Lägg till ett separat Används av-samband från Norrsken Molnlagring som anger
> att ingen använder tjänsten. Behåll befintliga samband.

**Förväntat svar och resultat:**

- Förklara att sambandet behöver en giltig ändpunkt och fråga hur uppgiften
  ska uttryckas. Frågan får gälla medgivande till en lämplig alternativ
  representation, exempelvis en fri egenskap.
- Bevara begäran och befintliga uppgifter. Ändra ingenting utan svar och
  påstå inte att uppdraget är slutfört eller sparat. En korrekt fråga är
  ett vänteläge; fortsatt ändringsarbete är ännu inte verifierat.

**Om en annan nödvändig fråga behövs:** Förklara att sambandet behöver en giltig
ändpunkt och ställ en relevant fråga om hur uppgiften ska uttryckas. Frågan får
gälla medgivande till en lämplig alternativ representation, exempelvis en fri
egenskap. Bevara begäran och befintliga uppgifter, ändra ingenting utan svar och
påstå inte att uppdraget är slutfört eller sparat. Något generellt automatiskt
följdsvar är inte definierat för den grenen.

### Ange en osäker användare

Scenario-ID: `uncertain-user`.

**Utvärderar:** Ersätta en bestämd koppling och bevara osäkerhet som en begärd
Ja/nej-egenskap.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

Varianten har dessutom sambandet Norrsken Molnlagring → Används av → Alex Lind.

**Steg 1:**

> Ersätt det befintliga Används av-sambandet från Norrsken Molnlagring till Alex
> Lind med ett Används av-samband från Norrsken Molnlagring till Mira Dahl.
> Uppgiften om Mira är osäker. Ange osäkerheten på det nya sambandet med den
> fria egenskapen Osäkert uppgivet, datatyp Ja/nej och värde Ja.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Om svaret beskriver Mira Dahls användning ska osäkerheten bevaras. Påstå inte
  säker användning. En allmän utkastbekräftelse räcker.
- Tillagt samband: Norrsken Molnlagring → Används av → Mira Dahl; Osäkert
  uppgivet: Ja.
- Borttaget samband: Norrsken Molnlagring → Används av → Alex Lind.

## Lång samtalsbakgrund

Gruppen skiljer lång samtalsbakgrund från en lång ny instruktion.
Startbakgrunden innehåller 40 avslutade par av användar- och assistentinlägg om
en påhittad vandring. Den ger inga kartfakta, uppdrag eller sparmedgivanden.
Sammanfattningssteget använder samtalets ordinarie sammanfattning och behåller
de åtta neutrala slutinläggen. Den fulla bakgrundstexten finns under
histories.extended i scenariekatalogen.

### Två prisändringar, kort kontextsammanfattning och rätta den sista

Scenario-ID: `summary-last-price`.

**Utvärderar:** Bevara ordningsföljd och osparade ändringar över
kontextsammanfattning så att ”den sista” blir rätt.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

> Ändra priset för Spotify Premium Family till 189 kronor per månad.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Spotify Premium Family: Pris: 189; Valuta: SEK; Betalningsintervall: månad.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

**Steg 2 – ordinarie följdmeddelande:**

> Ändra priset för Molnlagring Plus till 229 kronor per månad.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Molnlagring Plus: Pris: 229; Valuta: SEK; Betalningsintervall: månad.

**Villkorat extra följdsvar:**

Skickas endast när: Svaret ber användaren bekräfta att prisändringen avser det
befintliga abonnemanget Molnlagring Plus. Inga andra obesvarade frågor kräver
ett annat följdsvar.

> Jag menar abonnemanget Molnlagring Plus.

I vänteläget gäller:

- Fråga efter prisobjektets identitet utan att påstå att den väntande
  prisändringen är genomförd eller att något är sparat. Ställ ingen sparfråga.
- Steget gör inga ytterligare ändringar och sparar inget; tidigare verifierade
  utkaständringar bevaras.

Efter svaret gäller det ursprungliga målet samt:

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

**Steg 3:**

Testverktyget begär en kontextsammanfattning. Ingen extra användarprompt skickas
i detta steg.

**Förväntat svar och resultat:**

- Sammanfattningen anger först Spotify Premium Family 189 kronor per månad,
  därefter Molnlagring Plus 229 kronor per månad, som genomförda
  utkaständringar. Påstå inte att dessa prisändringar är sparade. Äldre
  verifierade sparresultat får återges när de tydligt skiljs från de aktuella
  osparade ändringarna; obestyrkta sparpåståenden är fel.

**Steg 4 – ordinarie följdmeddelande:**

> Rätta den sista till 239 kronor, spara inte.

**Förväntat svar och resultat:**

- Ge ett kort verifierat ändringsbesked om utkastet, utan obegärd uppräkning,
  sparfråga eller sparpåstående.
- Fråga inte vilken prisändring som avses.
- Molnlagring Plus: Pris: 239; Valuta: SEK; Betalningsintervall: månad.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

### Enkel prisfråga efter omfattande avslutad diskussion

Scenario-ID: `long-conversation-question`.

**Utvärderar:** Besvara en enkel aktuell fråga efter lång avslutad diskussion
utan att ge bakgrunden ändringsbehörighet.

**Startläge:** Den gemensamma kartan och det befintliga utkastet ovan.

**Steg 1:**

Testverktyget begär en kontextsammanfattning. Ingen extra användarprompt skickas
i detta steg.

**Förväntat svar och resultat:**

- Sammanfatta den avslutade vandringsdiskussionen utan att skapa fakta,
  ändringsuppdrag eller sparmedgivande om hushållets karta.

**Steg 2 – ordinarie följdmeddelande:**

> Vad kostar Spotify Premium Family?

**Förväntat svar och resultat:**

- Svara att Spotify Premium Family kostar 179 kronor per månad enligt aktuell
  karta. Sammanfattningen ger inga nya fakta eller tillstånd att ändra eller
  spara.

**Säker förmågegräns:** Förklara tydligt varför uppdraget inte kan slutföras och
vad som återstår. Bevara exakta oavslutade instruktioner och begränsningar,
uppgifter och tidigare utkast. Påstå inte att hela uppdraget är klart eller
sparat och hitta inte på fakta.

## Tekniska kalibreringskontroller

Utöver de 70 användarscenarierna finns 64 fristående
[kalibreringskontroller](../../scripts/model-evaluation/judge-controls.json) för
bedömaren. De innehåller på förhand angivna observationer och förväntade
bedömningar av bland annat saknade svar, obestyrkta sparbesked, nödvändiga och
onödiga frågor, bevarad oavslutad innebörd samt likvärdig prisrepresentation och
fel belopp, valuta eller period.

Kalibreringen körs före användarscenarierna. Alla kontrollutfall måste motsvara
sina förväntningar innan bedömarens omdömen får stödja en jämförelse.
Kontrollerna är inte ytterligare hushållsärenden och ska inte blandas med
gruppernas antal eller slutförandetider.

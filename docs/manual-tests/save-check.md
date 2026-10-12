# Manuella testfall för automatisk kontroll av sparande

Fallen skiljer genomfört, väntande, avvisat och saknat sparande. Alla
automatiserade motsvarigheter använder riktig HTTP och SQLite men syntetisk
modell och media. Faktiskt ljud och skärmläsare har egna observationsfall.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex loggar in med provets Google-knapp. Ingen extra administratörsrätt
behövs för vardagsarbetet. Separata klienter använder samma identitet.

## Allmän förberedelse

Starta
[den kontrollerade installationen och leveranskontrollen](save-preparation.md#samtals--och-kontrollsvar).
Använd ett nytt tomt hushåll per fall. `restart` behåller provdatabasen;
`quit` avslutar och tar bort den. Ta bort nätblockering mellan fallen.
Terminalens modellkommandon är separat leverantörsförberedelse vid det
anrop som UI-handlingen ger. Ersätt REQUEST med terminalens `held`-ID och
VERSION och CONTENT med dess aktuella utkastversion och innehållsversion.
Efter ett verktygsanrop avslutar `reply REQUEST TEXT` nästa hållna anrop.

## Tappat svar och återförsök

### SPARKONTROLL-01: kontrollera tappat sparkvitto före nytt arbete

**Syfte:** Kontrollen går före nytt arbete; oskickad text finns kvar.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Installation och konsolkontroll enligt allmän förberedelse.
Lägg Lo Exempel i utkastet och öppna textsamtalet med medgivande.
Arma `reply:drop-after` och `session-recover:before` med konsolkontrollen. När
sparuppdragets modellanrop hålls, släpp det med
`tool REQUEST save_draft
{"version":VERSION,"contentVersion":CONTENT,"operationId":"checked-save"}`.
Avsluta nästa hållna anrop med `reply REQUEST Sparat.`.
Operatören kräver status 200 före det tappade svaret som separat
leveransdiagnos.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-01"
  },
  "reference": "Samtalssvar med verkligt kvitto tappas efter genomförandet.",
  "outcomes": [
    "Kontrollen går före nytt arbete; oskickad text finns kvar.",
    "Förklaringen att hela utkastet sparades visas en gång. Ett enda kvitto finns; kontrollen skapar inget nytt sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Använd [leveranskontrollen](save-preparation.md#samtals--och-kontrollsvar)
i den befintliga provinstallationen. Efter UI-steg 1 kräver operatören det
verkliga sparandets status
200 före det tappade kvittot och inväntar `held-before session-recover`.
Meddela **Kontrollen hålls före servern**. Först efter observationerna
och oskickad text i steg 2–3: släpp `session-recover` i konsolen med
`skyttelSaveDelivery.release('session-recover')`. Meddela **Kontrollen
är släppt** utan att skicka ett nytt sparuppdrag.

Använd samma provdatabas och session under fallet. Återställ kontrollen enligt
den länkade förberedelsen efter sista observationen; avsluta först när det
väntande utfallet är känt. Inga verkliga leverantörsanrop ingår.

**Steg:**

1. Skriv Spara hela utkastet. och välj Skicka. Släpp modellresultatet enligt
   förberedelsen.
2. Läs Det är oklart om utkastet sparades. Skyttel kontrollerar det. Skriv Nästa
   uppdrag utan att skicka.
3. Kontrollera spärrad Skicka. Aktivera den nåbara mikrofonknappen: den ska
   förklara att den inte är tillgänglig nu och förbli av. Ingen ny röst startar.
4. Be operatören släppa den hållna kontrollen och invänta bekräftelse. Läs
   förklaringen i samtalstexten och kontrollera att nytt arbete blir möjligt.
5. Läs det enda sparandet för Lo Exempel i Rapporter → Ändringshistorik.

**Förväntat resultat:**

- Kontrollen går före nytt arbete; oskickad text finns kvar.
- Förklaringen att hela utkastet sparades visas en gång. Ett enda kvitto finns;
  kontrollen skapar inget nytt sparande.

### SPARKONTROLL-02: kontrollera samma försök efter omstart

**Syfte:** Samma beständiga försök får ett enda kvitto utan nytt medgivande
eller modelluppdrag.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:**
[Registrerat väntande försök](save-preparation.md#registrerat-väntande-försök)
med Lo Exempel.

**Separat tekniskt underlag:** Förberedelsen antecknar det registrerade
försökets ID. Integrationstestet kräver samma beständiga försök efter
omstarten och jämför hela kvittot med den enda historikposten. Råa
försöksidentifierare jämförs inte i de vanliga UI-stegen.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-02"
  },
  "reference": "Omstart utan medgivande; automatisk kontroll lyckas.",
  "outcomes": [
    "Samma beständiga försök får ett enda kvitto utan nytt medgivande eller modelluppdrag.",
    "Kontrollnotis och återförsök försvinner efter känt utfall. Förklaringen visas en gång när samtalstexten öppnas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före UI-steg 1: utför
[registreringen av det väntande försöket](save-preparation.md#registrerat-väntande-försök)
med Lo Exempel och anteckna det faktiska försöks-ID:t och versionerna.
Ta bort nätblockeringen före besöket. Kör `restart` i startguiden,
behåll samma databas och session och invänta omstartens bekräftelse.
Meddela **Försöket är registrerat och omstarten är klar** innan användaren
laddar om. Skapa ingen ny installation och starta inget nytt samtal.
Avsluta enligt startguiden efter sista observationen och känt utfall.

**Steg:**

1. Be operatören förbereda försöket och starta om samma installation.
   Invänta bekräftelse och ladda om utan nytt samtalsmedgivande.
2. Tillåt den automatiska kontrollen vid besöket. Starta inget nytt samtal och
   lämna mikrofonen av.
3. Läs det enda kvittot för Lo Exempel i Rapporter → Ändringshistorik.
4. Återgå till arbetet, öppna textsamtalet och godkänn vanligt medgivande om det
   behövs. Läs kontrollens enda förklaring.

**Förväntat resultat:**

- Samma beständiga försök får ett enda kvitto utan nytt medgivande eller
  modelluppdrag.
- Kontrollnotis och återförsök försvinner efter känt utfall. Förklaringen visas
  en gång när samtalstexten öppnas.

### SPARKONTROLL-07: kontrollera samma försök efter omstart och kontrollfel

**Syfte:** Samma beständiga försök får ett enda kvitto utan nytt medgivande
eller modelluppdrag.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:**
[Registrerat väntande försök](save-preparation.md#registrerat-väntande-försök)
med Lo Exempel.

**Separat tekniskt underlag:** Förberedelsen antecknar det registrerade
försökets ID. Integrationstestet kräver samma beständiga försök efter
kontrollfelet och återförsöket och jämför hela kvittot med den enda
historikposten. Råa försöksidentifierare jämförs inte i UI-stegen.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-07"
  },
  "reference": "Omstart utan medgivande; första kontrollen misslyckas, tangentbordsåterförsök.",
  "outcomes": [
    "Samma beständiga försök får ett enda kvitto utan nytt medgivande eller modelluppdrag.",
    "Kontrollnotis och återförsök försvinner efter känt utfall. Förklaringen visas en gång när samtalstexten öppnas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före UI-steg 1: utför
[registreringen av det väntande försöket](save-preparation.md#registrerat-väntande-försök)
med Lo Exempel och anteckna det faktiska försöks-ID:t och versionerna.
Före omstart och omladdning aktiverar operatören beständig
Network request blocking för `*/text-assistant/recover` i
utvecklarverktygen. Konsolkontrollen överlever inte omladdning och används
inte för att blockera den första kontrollen. Kör `restart` i startguiden,
behåll samma databas och session och invänta omstartens bekräftelse.
Meddela **Försöket är registrerat, första kontrollen är blockerad och
omstarten är klar** innan användaren laddar om. Skapa ingen ny installation
och starta inget nytt samtal.

Använd [leveranskontrollen](save-preparation.md#samtals--och-kontrollsvar)
i den befintliga provinstallationen. Efter det första kontrollfelet i UI-steg 2,
före Enter i steg 3:
ta bort den beständiga nätblockeringen, installera konsolkontrollen igen
och arma `recover:after` med `skyttelSaveDelivery.arm('recover', 'after')`.
Meddela **Nästa kontroll håller sitt genomförda svar** och stäng
utvecklarverktygen. Efter Enter: invänta `application-completed recover`
med status 200 och `held-after recover`; meddela **Kontrollsvaret hålls**.
Efter användarens kontrollnotis, avstängda mikrofon och aktuella fokus:
kör `skyttelSaveDelivery.release('recover')` och meddela **Kontrollen
är släppt**. Inget nytt medgivande eller modelluppdrag används.

Använd samma provdatabas och session under fallet. Återställ kontrollen enligt
den länkade förberedelsen efter sista observationen; avsluta först när det
väntande utfallet är känt. Inga verkliga leverantörsanrop ingår.

**Steg:**

1. Be operatören förbereda försöket, första kontrollfelet och omstarten.
   Invänta bekräftelse och ladda om utan nytt samtalsmedgivande.
2. Vänta på Skyttel kunde inte kontrollera om utkastet sparades. Kontrollera den
   enda återförsöksknappen.
3. Be operatören förbereda nästa kontroll och invänta bekräftelse. Tabba till
   Kontrollera om utkastet sparades och tryck Enter. Invänta beskedet att
   kontrollsvaret hålls. Läs kontrollnotisen utan återförsöksknapp och med
   mikrofon av. Be därefter operatören släppa kontrollsvaret och invänta
   bekräftelse.
4. Läs det enda kvittot för Lo Exempel i Rapporter → Ändringshistorik.
5. Återgå till arbetet, öppna textsamtalet och godkänn vanligt medgivande om det
   behövs. Läs kontrollens enda förklaring.

**Förväntat resultat:**

- Samma beständiga försök får ett enda kvitto utan nytt medgivande eller
  modelluppdrag.
- Kontrollnotis och återförsök försvinner efter känt utfall. Förklaringen visas
  en gång när samtalstexten öppnas.

## Förklaring och syntetisk röst

### SPARKONTROLL-03: förklara saknat sparande med mikrofonen av

**Syfte:** Varje kontroll får en förklaring; samma utfall dubblerar inte
samtalsraden.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Installation och konsolkontroll enligt allmän förberedelse.
Lägg Lo Exempel i det privata utkastet. Uppdragets leverans bryts före
mottagandet. Se
[syntetiska ljudkontroller](voice-assistant.md#browser-transport-and-audio-controls).

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-03"
  },
  "reference": "Privat Lo-förslag; uppdrag tappat före mottagandet, mikrofon av.",
  "outcomes": [
    "Varje kontroll får en förklaring; samma utfall dubblerar inte samtalsraden.",
    "Lo-förslaget finns kvar och historiken är tom. Förklaringen följer mikrofonvalet utan Sparat-symbol."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Använd [leveranskontrollen](save-preparation.md#samtals--och-kontrollsvar)
i den befintliga provinstallationen. Före vardera Skicka i UI-steg 2 och 5: arma
`message:drop-before`
med `skyttelSaveDelivery.arm('message', 'drop-before')` och meddela
**Nästa uppdrag tappas före mottagandet**. Arma `message:drop-before` igen
för det andra uppdraget. Efter vardera Skicka: kontrollera att inget
modellanrop väntar och meddela **Uppdraget tappat före mottagandet**.
Behåll mikrofonvalet
och följ fallets separata syntetiska ljudförberedelse.

Använd samma provdatabas och session under fallet. Återställ kontrollen enligt
den länkade förberedelsen efter sista observationen; avsluta först när det
väntande utfallet är känt. Inga verkliga leverantörsanrop ingår.

**Steg:**

1. Öppna textsamtalet och behåll mikrofonen av.
2. Be operatören förbereda första uppdragets tappade leverans och invänta
   bekräftelse. Skriv Spara hela utkastet. och välj Skicka. Invänta
   operatörens bekräftelse att uppdraget tappats före mottagandet.
3. Läs Kontrollen visar att utkastet inte sparades. Dina osparade ändringar
   ligger kvar. Kontrollera en enda sådan samtalsrad.
4. Läs samma förklaring i samtalstexten. Slå på mikrofonen; det gamla svaret ska
   inte skickas till rösten.
5. Be operatören förbereda nästa tappade leverans och invänta bekräftelse.
   Skicka Kontrollera ett nytt uppdrag. Invänta samma operatörsbekräftelse.
   Kräv två separata kontrollförklaringar totalt.
6. Läs Lo Exempel i hela Utkastet och tom Ändringshistorik i Rapporter.

**Förväntat resultat:**

- Varje kontroll får en förklaring; samma utfall dubblerar inte samtalsraden.
- Lo-förslaget ligger kvar och historiken är tom. Ingen Sparat-symbol visas.
- Förklaringen visas en gång per kontroll och följer mikrofonvalet.

### SPARKONTROLL-08: förklara saknat sparande med mikrofonen på

**Syfte:** Varje kontroll får en förklaring; samma utfall dubblerar inte
samtalsraden.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Installation och konsolkontroll enligt allmän förberedelse.
Lägg Lo Exempel i det privata utkastet. Uppdragets leverans bryts före
mottagandet. Se
[syntetiska ljudkontroller](voice-assistant.md#browser-transport-and-audio-controls).

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-08"
  },
  "reference": "Privat Lo-förslag; uppdrag tappat före mottagandet, mikrofon på.",
  "outcomes": [
    "Varje kontroll får en förklaring; samma utfall dubblerar inte samtalsraden.",
    "Lo-förslaget finns kvar och historiken är tom. Förklaringen följer mikrofonvalet utan Sparat-symbol."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat tekniskt underlag:** Integrationstestet kontrollerar spårens
`enabled`, skickade kommentarspaket och deduplicering vid leverantörsgränsen.
Operatören förbereder tyst svarstext och fjärrljud enligt
[syntetiskt kontrollsvar](save-preparation.md#syntetiskt-kontrollsvar).
Detta underlag verifierar inte fysisk fångst eller hörbar uppläsning.

**Separat operatörsförberedelse:**

Använd [leveranskontrollen](save-preparation.md#samtals--och-kontrollsvar)
i den befintliga provinstallationen. Före vardera Skicka i UI-steg 2 och 5: arma
`message:drop-before`
med `skyttelSaveDelivery.arm('message', 'drop-before')` och meddela
**Nästa uppdrag tappas före mottagandet**. Arma `message:drop-before` igen
för det andra uppdraget. Efter vardera Skicka: kontrollera att inget
modellanrop väntar och meddela **Uppdraget tappat före mottagandet**.
Behåll mikrofonvalet
och följ fallets separata syntetiska ljudförberedelse.

Använd samma provdatabas och session under fallet. Återställ kontrollen enligt
den länkade förberedelsen efter sista observationen; avsluta först när det
väntande utfallet är känt. Inga verkliga leverantörsanrop ingår.

**Steg:**

1. Öppna textsamtalet och slå på mikrofonen med Prata med Skyttel.
2. Be operatören förbereda första uppdragets tappade leverans och invänta
   bekräftelse. Skriv Spara hela utkastet. och välj Skicka. Invänta
   operatörens bekräftelse att uppdraget tappats före mottagandet.
3. Läs Kontrollen visar att utkastet inte sparades. Dina osparade ändringar
   ligger kvar. Kontrollera en enda sådan samtalsrad.
4. Låt operatören leverera syntetisk svarstext och hålla fjärrljud enligt
   separat förberedelse. Läs Skyttel talar. Låt operatören stoppa signalen och
   läs Lyssnar utan Sparat-symbol.
5. Be operatören förbereda nästa tappade leverans och invänta bekräftelse.
   Skicka Kontrollera ett nytt uppdrag. Invänta samma operatörsbekräftelse.
   Kräv två separata kontrollförklaringar totalt.
6. Läs Lo Exempel i hela Utkastet och tom Ändringshistorik i Rapporter.

**Förväntat resultat:**

- Varje kontroll får en förklaring; samma utfall dubblerar inte samtalsraden.
- Lo-förslaget ligger kvar och historiken är tom. Ingen Sparat-symbol visas.
- Förklaringen visas en gång per kontroll och följer mikrofonvalet.

### SPARKONTROLL-04: visa Sparat efter kvitto och avslutat svar

**Syfte:** Fångst spärras under kontrollen. Verifierat kvitto räcker inte för
att börja visa Sparat medan svaret pågår.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Installation och konsolkontroll enligt allmän förberedelse.
Lägg Lo i utkastet, öppna textsamtalet och slå på mikrofonen. Arma
`session-recover:after` och registrera försöket enligt förberedelsen. Använd
[ljudkontrollerna](voice-assistant.md#browser-transport-and-audio-controls).

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-04"
  },
  "reference": "Syntetiska spår och fjärrljud; avbrott efter faktiskt kvitto.",
  "outcomes": [
    "Fångst spärras under kontrollen. Verifierat kvitto räcker inte för att börja visa Sparat medan svaret pågår.",
    "Definitivt avbrott avslutar svaret och visar Sparat; ett enda kvitto behålls."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat tekniskt underlag:** Integrationstestet kontrollerar spårens
`enabled`, skickade kommentarspaket och deduplicering vid leverantörsgränsen.
Operatören förbereder tyst svarstext och fjärrljud enligt
[syntetiskt kontrollsvar](save-preparation.md#syntetiskt-kontrollsvar).
Detta underlag verifierar inte fysisk fångst eller hörbar uppläsning.

**Steg:**

1. Läs kontrollnotisen och kontrollera att mikrofonknappen visar av.
2. Låt operatören släppa kontrollsvaret. Läs kontrollförklaringen i samtalet.
3. Låt operatören leverera syntetisk svarstext och starta fjärrljud enligt
   separat förberedelse. Kräv Skyttel talar och ingen Sparat-symbol.
4. Välj Avbryt i röstrutan. Kräv Sparat och bock, grundade i det verkliga
   kvittot. Läs det enda historiksteget.

**Förväntat resultat:**

- Fångst spärras under kontrollen. Verifierat kvitto räcker inte för att börja
  visa Sparat medan svaret pågår.
- Definitivt avbrott avslutar svaret och visar Sparat; ett enda kvitto behålls.

### SPARKONTROLL-05: avvisat försök behåller utkastet

**Syfte:** Kontrollera att en verifierad avvisning inte blir ett nytt sparande.

**Användare:** Alex.

**Förutsättningar:** Använd en separat provdatabas och ett nytt, tomt hushåll.
Förbered ett redan registrerat sparförsök med olöst identitet genom de publika
HTTP-rutterna. Detta är provdata för ett tidigare uttryckligt sparbesked,
inte ett nytt sparande från kontrollen. Kopiera hushållets ID från adressen
för `/api/households/ID/map` i Network. Öppna webbläsarens Console på samma
inloggade sida och kör följande med det kopierade ID:t:

```javascript
const mapPath = '/api/households/ID/map';
const map = await (await fetch(mapPath)).json();
await fetch(`${mapPath}/draft`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    version: map.draft.version,
    contentVersion: map.contentVersion,
    id: 'lo',
    baseRevision: null,
    value: {
      typeId: map.types[0].id,
      name: 'Oklart Lo',
      description: '',
      identity: 'unresolved',
    },
  }),
});
const draft = (await (await fetch(mapPath)).json()).draft;
await fetch(`${mapPath}/operations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operationId: 'manual-rejected-original',
    version: draft.version,
    contentVersion: map.contentVersion,
  }),
});
console.log(JSON.stringify(draft));
```

Kräv status 200 för båda POST-anropen. Kvittot kan inte skapas innan
identiteten är utredd. Kopiera utkastets JSON till en lokal provanteckning
före omstarten; Console-variabler försvinner när sidan laddas om.
Lämna Console och följ de synliga stegen nedan.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-05"
  },
  "reference": "Registrerat utkast med olöst identitet, riktig omstart och beständig avvisning.",
  "outcomes": [
    "Avvisat försök skapar inget kvitto och behåller det privata förslaget.",
    "Kontrollens enda förklaring anger osparat utfall utan nytt sparförsök.",
    "Identitetsrättelsen kräver ett nytt uttryckligt sparbesked som ger eget kvitto och tomt utkast."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta om installationen och ladda om sidan. Låt Skyttel kontrollera
   försöket.
2. Öppna textsamtalet och läs förklaringen att utkastet inte sparades.
3. Välj **Visa utkastet** i textvyn och kontrollera hela förslaget Oklart Lo.
   Öppna **Rapporter → Ändringshistorik**. Kräv **Inga genomförda sparanden.**
   Det avvisade försöket ska inte visas som ett genomfört sparande.
   Välj **Tillbaka till arbetet**.
4. Öppna Tabell → Redigera Oklart Lo. Välj Identifierat objekt under
   Identitet och lägg hela formuläret i utkastet. Läs att inget nytt
   sparande har genomförts enbart genom rättelsen.
5. Öppna Utkast och välj Spara hela utkastet uttryckligen. Läs bekräftat
   sparande och tomt utkast. Det gamla avvisade försöket är inget genomfört
   sparande.

**Separat tekniskt underlag:** Integrationstestet jämför hela det privata
utkastet, det avvisade försökets ID och tom historik efter kontrollen.
Rättelsen ensam skapar inget nytt försök. Testet kräver därefter ett nytt
lyckat försöks-ID med eget kvitto och att det ursprungliga avvisade försöket
finns kvar oförändrat. Dessa råa jämförelser är inga vanliga UI-steg.

**Förväntat resultat:**

- Förslaget finns kvar och historiken har inget nytt kvitto efter
  avvisningen. Automationen jämför separat hela utkastet och samma
  beständiga avvisade försök utan nytt försöks-ID.
- Förklaringen är det enda utfallsbeskedet i samtalet. En lyckad kontroll
  av ett osparat resultat visar ingen återförsöksknapp för själva kontrollen.
- Identitetsrättelsen sparar inte själv. Först det nya uttryckliga
  sparbeskedet ger ett eget kvitto och tömmer det rättade utkastet.

## Återkallat medgivande

### SPARKONTROLL-06: kontrollera sparande efter återkallat medgivande

**Syfte:** Återkallandet avslutar fångst direkt. Samma försök kontrolleras utan
nytt medgivande och får ett enda kvitto.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Installation och konsolkontroll enligt allmän förberedelse.
Lägg Lo i utkastet, starta text och mikrofon och kör
`skyttelSaveDelivery.block('session-recover', true)`.
Släpp sparuppdragets modell med
`tool REQUEST prepare_save {"version":VERSION,"contentVersion":CONTENT}`
och nästa hållna anrop med `reply REQUEST Försöket är förberett.`.
Anteckna ursprungligt ID som separat tekniskt underlag.
Integrationstestet jämför det ursprungliga försöket och dess enda kvitto
efter återkallelsen. De råa identifierarna ingår inte i UI-stegen.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-06"
  },
  "reference": "Mikrofon på; återkallandesvar levereras.",
  "outcomes": [
    "Återkallandet avslutar fångst direkt. Samma försök kontrolleras utan nytt medgivande och får ett enda kvitto.",
    "Oskickad text finns kvar; gammalt kontrollfel följer inte med till nästa samtal."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skriv Spara hela utkastet. och släpp modellen enligt förberedelsen. Vänta på
   kontrollfelet, med ursprungligt försök ännu väntande.
2. Skriv Text som inte har skickats. Öppna Inställningar → Samtal med Skyttel
   och välj Återkalla medgivandet.
3. Bekräfta Återkalla och avsluta samtalet. Läs Medgivandet är återkallat och
   direkt avstängd fångst. Gå tillbaka till kartan och kontrollera att gammal
   felnotis saknas.
4. Läs det enda genomförda sparandet för Lo i Rapporter.
5. Återgå, öppna textsamtalet och godkänn nytt medgivande. Läs kvarvarande
   oskickad text och tom gammal samtalstext.

**Förväntat resultat:**

- Återkallandet avslutar fångst direkt. Samma försök kontrolleras utan nytt
  medgivande och får ett enda kvitto.
- Oskickad text finns kvar; gammalt kontrollfel följer inte med till nästa
  samtal.

### SPARKONTROLL-09: kontrollera efter tappat återkallandesvar

**Syfte:** Återkallandet avslutar fångst direkt. Samma försök kontrolleras utan
nytt medgivande och får ett enda kvitto.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Installation och konsolkontroll enligt allmän förberedelse.
Lägg Lo i utkastet, starta text och mikrofon och kör
`skyttelSaveDelivery.block('session-recover', true)`.
Släpp sparuppdragets modell med
`tool REQUEST prepare_save {"version":VERSION,"contentVersion":CONTENT}`
och nästa hållna anrop med `reply REQUEST Försöket är förberett.`.
Anteckna ursprungligt ID som separat tekniskt underlag.
Integrationstestet jämför det ursprungliga försöket och dess enda kvitto
efter återkallelsen. Operatören kräver status 200 före det tappade
återkallandesvaret. Dessa leveransdiagnoser och råa jämförelser ingår inte
i de vanliga UI-stegen.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts),
SPARKONTROLL-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/save-check.spec.ts",
    "caseId": "SPARKONTROLL-09"
  },
  "reference": "Mikrofon på; lyckat återkallandesvar tappas efter servern.",
  "outcomes": [
    "Återkallandet avslutar fångst direkt. Samma försök kontrolleras utan nytt medgivande och får ett enda kvitto.",
    "Oskickad text finns kvar; gammalt kontrollfel följer inte med till nästa samtal."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Använd [leveranskontrollen](save-preparation.md#samtals--och-kontrollsvar)
i den befintliga provinstallationen. Före bekräftelsen av Återkalla i UI-steg 3:
arma `revoke:drop-after`
och `recover:after` med `skyttelSaveDelivery.arm('revoke', 'drop-after')`
och `skyttelSaveDelivery.arm('recover', 'after')`. Meddela **Återkallande
och kontroll är förberedda**. Efter bekräftelsen krävs återkallandets
verkliga status 200 före tappat svar. Invänta därefter det genomförda
kontrollsvarets status 200 och `held-after recover`; meddela
**Återkallandet är genomfört och kontrollsvaret hålls**. Först efter
återgången till kartan och mikrofonkontrollen i steg 4: kör
`skyttelSaveDelivery.release('recover')` och meddela **Kontrollen är
släppt**. Jämför ursprungligt försök och enda kvitto separat som tidigare.

Använd samma provdatabas och session under fallet. Återställ kontrollen enligt
den länkade förberedelsen efter sista observationen; avsluta först när det
väntande utfallet är känt. Inga verkliga leverantörsanrop ingår.

**Steg:**

1. Skriv Spara hela utkastet. och släpp modellen enligt förberedelsen. Vänta på
   kontrollfelet, med ursprungligt försök ännu väntande.
2. Skriv Text som inte har skickats. Öppna Inställningar → Samtal med Skyttel
   och välj Återkalla medgivandet.
3. Be operatören förbereda återkallandets tappade svar och hållna kontroll.
   Invänta bekräftelse. Bekräfta Återkalla och avsluta samtalet. Kontrollera att
   mikrofonknappen visar av.
4. Gå tillbaka till kartan. Läs kontrollnotisen och försök använda
   mikrofonknappen; ingen ny fångst eller medgivanderuta ska starta. Invänta
   operatörens besked att kontrollsvaret hålls. Be sedan operatören släppa det
   och invänta bekräftelse.
5. Läs det enda genomförda sparandet för Lo i Rapporter.
6. Återgå, öppna textsamtalet och godkänn nytt medgivande. Läs kvarvarande
   oskickad text och kontrollens enda förklaring.

**Förväntat resultat:**

- Återkallandet avslutar fångst direkt. Samma försök kontrolleras utan nytt
  medgivande och får ett enda kvitto.
- Oskickad text finns kvar; gammalt kontrollfel följer inte med till nästa
  samtal.

## Faktisk mänsklig observation

### SPARKONTROLL-10: hör kontrollförklaringen en gång

**Syfte:** Lyssna med faktisk skärmläsare efter kontroll med mikrofon av och på.
Mikrofon av ger en artig förklaring; mikrofon på ger ingen extra uppläsning av
samma samtalstext.

**Användare:** Alex med faktisk utrustning.

**Förutsättningar:** Kontrollerad installation och saknat sparförsök enligt
SPARKONTROLL-03 och SPARKONTROLL-08 ovan. Använd faktisk skärmläsare i
Chromium eller Chrome, exempelvis NVDA eller VoiceOver. Syntetisk modell
och tysta ljudspår används; ingen extern leverantör behövs.

**Kräver mänsklig observation:** Lyssna med faktisk skärmläsare efter kontroll
med mikrofon av och på. Mikrofon av ger en artig förklaring; mikrofon på ger
ingen extra uppläsning av samma samtalstext.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna med faktisk skärmläsare efter kontroll med mikrofon av och på. Mikrofon av ger en artig förklaring; mikrofon på ger ingen extra uppläsning av samma samtalstext."
  },
  "reference": "Faktisk utrustning; redovisa skärmläsare, operativsystem och ljudenhet.",
  "outcomes": [
    "Lyssna med faktisk skärmläsare efter kontroll med mikrofon av och på. Mikrofon av ger en artig förklaring; mikrofon på ger ingen extra uppläsning av samma samtalstext."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta skärmläsaren. Utför SPARKONTROLL-03 en gång från dess förberedelse
   i ett nytt provhushåll. Gör observationerna nedan under dess namngivna
   steg, utan extra skickanden eller upprepning av basflödet.
2. Under SPARKONTROLL-03 steg 2–3, medan mikrofonen fortfarande är av,
   lyssna efter Kontrollen visar att utkastet inte sparades. Dina osparade
   ändringar ligger kvar. Kräv en enda automatisk artig uppläsning.
   Under dess steg 4, när mikrofonen slås på, ska det gamla beskedet inte
   annonseras på nytt. Slutför sedan basfallets steg 5–6.
3. Utför SPARKONTROLL-08 en gång från dess förberedelse i ett annat nytt
   provhushåll. Under dess steg 2–4, med syntetisk mikrofon på, står samma
   kontrollförklaring i samtalstexten. Skärmläsaren ska inte automatiskt
   läsa en extra kopia som ny samtalstext. Slutför basfallets steg 5–6.
4. Anteckna faktisk skärmläsare, operativsystem och hörda meddelanden.

**Förväntat resultat:**

- Lyssna med faktisk skärmläsare efter kontroll med mikrofon av och på. Mikrofon
  av ger en artig förklaring; mikrofon på ger ingen extra uppläsning av samma
  samtalstext.

### SPARKONTROLL-11: hör förklaringen och respektera mikrofonvalet

**Syfte:** Använd fysisk mikrofon och högtalare med godkänd extern
röstkonfiguration. Lyssna på kontrollförklaringen med mikrofon på; avstängd
mikrofon spelar inte upp den gamla förklaringen efter ny start.

**Användare:** Alex med faktisk utrustning.

**Förutsättningar:** Använd en separat vanlig installation med konfigurerad
extern röstleverantör, fysisk mikrofon och högtalare enligt
[TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare).
Använd inte den syntetiska startguiden eller dess tysta ljudspår. Extern
körning kräver separat godkännande. Skapa ett tomt provhushåll, lägg Lo
Exempel i utkastet och installera konsolkontrollen från
[sparförberedelsen](save-preparation.md#samtals--och-kontrollsvar).
Förbered registreringen enligt
[registrerat väntande försök](save-preparation.md#registrerat-väntande-försök)
utan att skicka registreringsanropet ännu. Operatören armar
`session-recover:after` före registreringen i steg 2; samma ordning används
i det nya hushållet i steg 4.

**Kräver mänsklig observation:** Använd fysisk mikrofon och högtalare med
godkänd extern röstkonfiguration. Lyssna på kontrollförklaringen med mikrofon
på; avstängd mikrofon spelar inte upp den gamla förklaringen efter ny start.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Använd fysisk mikrofon och högtalare med godkänd extern röstkonfiguration. Lyssna på kontrollförklaringen med mikrofon på; avstängd mikrofon spelar inte upp den gamla förklaringen efter ny start."
  },
  "reference": "Faktisk utrustning; redovisa skärmläsare, operativsystem och ljudenhet.",
  "outcomes": [
    "Använd fysisk mikrofon och högtalare med godkänd extern röstkonfiguration. Lyssna på kontrollförklaringen med mikrofon på; avstängd mikrofon spelar inte upp den gamla förklaringen efter ny start."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Skriv till Skyttel, godkänn medgivandet och slå på Prata med
   Skyttel före registreringen. Kontrollera faktisk mikrofonåtkomst.
2. Låt operatören registrera försöket enligt förberedelsen. Läs
   kontrollnotisen och att mikrofonknappen visar av. Låt operatören släppa
   det hållna kontrollsvaret.
3. Lyssna i högtalaren på Kontrollen visar att hela utkastet sparades.
   Ändringarna finns i hushållets karta. Läs samma förklaring i samtalet.
4. Skapa ett annat nytt tomt provhushåll och lägg Lo Exempel i utkastet.
   Öppna Skriv till Skyttel och godkänn medgivandet vid behov. Behåll
   mikrofonen av. Operatören installerar konsolkontrollen igen, armar
   `session-recover:after` och registrerar ett nytt väntande försök.
   Läs kontrollnotisen och låt operatören släppa kontrollsvaret.
   Ingen röstförklaring ska spelas upp.
5. Slå på mikrofonen efter utfallet. Det gamla svaret ska inte spelas
   upp. Läs det enda kvittot och tomt utkast i varje hushåll.
6. Anteckna faktisk mikrofon, högtalare, webbläsare och hörda svar.

**Förväntat resultat:**

- Använd fysisk mikrofon och högtalare med godkänd extern röstkonfiguration.
  Lyssna på kontrollförklaringen med mikrofon på; avstängd mikrofon spelar inte
  upp den gamla förklaringen efter ny start.

## Tillgänglighetsbedömning och körgränser

Bedömningen är ett designmål för WCAG 2.2 AA, inte ett intyg om verifierad
överensstämmelse. Befintliga temafärger och fokusmarkeringar återanvänds.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning och automatiskt prov | Mänsklig verifiering som återstår |
| --- | --- | --- |
| 1.1.1, 1.3.1, 1.4.1 | Frågesymbolen är dold för hjälpmedel; text anger kontroll och fel, utöver färg. | Begriplighet och verkliga teman. |
| 1.4.3, 1.4.11, 2.4.7, 2.4.11 | Befintliga teman, fokusmarkeringar och notisplacering återanvänds. | Kontrast, zoom och oskymt fokus på verkliga skärmar. |
| 2.1.1, 2.4.3, 2.5.8 | Återförsök med tangentbord, logiskt fokus efter notisens borttagning och befintliga knappmått. Ingen automatisk textvy. | Full fokusordning och fysisk pekskärm. |
| 4.1.2, 4.1.3 | Högst prioriterad artig kontrollnotis, assertivt kontrollfel, en kanonisk samtalsrad med röstberoende uppläsning. | Hörbara skärmläsare och avbrott mellan uppläsningar. |
<!-- markdownlint-enable MD013 -->

Automatiken använder riktig server och tillfällig SQLite med syntetiskt
leverantörs- och medieunderlag. Live saknar en säker signal för färdig
uppspelning: matchad verifierad svarstext och faktiskt observerad
ljudaktivitet används tillsammans; framtida fördröjt ljud kan inte uteslutas.
Ett uttryckligt avbrott är en säker slutpunkt. Verklig uppspelning,
mikrofonintegritet, mobil policy och hörbar skärmläsare återstår enligt #220.

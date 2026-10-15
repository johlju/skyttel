# Manuella testfall för Skyttels röst

Fallen provar samtal med röst, samma privata utkast, MCP-regler och kvitton som
samtal med text. Anteckna commit, webbläsare, operativsystem, mikrofon, modell
eller kontrollerad ersättare samt resultat. De kontrollerade flödena verifieras
automatiskt. I [#97](https://github.com/viscalyx/skyttel/issues/97) återstår
mänsklig bedömning av faktiskt hört ljud och användning med egen utrustning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Talprov, eller
  TestHousehold när det färdiga familjeunderlaget används.
- Kontrollerad inloggning använder Google utan ett verkligt externt konto.
- Verkliga modellprov använder konfigurerad inloggning och enbart påhittade
  data.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när fallen anger
formulär, samtal, profil eller administration.

Objekt redigeras med **Tabell → Redigera [namn]**. Samband nås genom
**Samband för [namn]**. Formulär är modala; pågående mikrofon och arbete
fortsätter där. Oskickade uppgifter lämnas uttryckligen genom Escape och
**Lämna ändrade uppgifter?**. **Fortsätt redigera** bevarar alla värden;
**Kasta ändringarna och fortsätt** lämnar bara det oskickade formuläret.

1. Välj den kontrollerade vägen eller det verkliga talprovet i TAL-23. TAL-02
   och TAL-03 använder den
   [kontrollerade startguiden](#controlled-voice-fixture). Den senare håller
   varje Terra-anrop och använder tysta mediespår; den lyssnar inte på din
   mikrofon och provar inte svensk talförståelse.
2. För TAL-02 och TAL-03: skapa Talprov och lägg **Lo Exempel**, typ **Person**
   , med beskrivningen **Påhittad uppgift** i ditt utkast. Spara inte. TAL-01
   har egna förberedelser nedan.
3. För TAL-02 och TAL-03: välj **Skriv till Skyttel → Nytt samtal**, välj
   **Godkänn och starta** i medgivanderutan och sedan **Prata med Skyttel** i
   **Kartans verktyg**. Knappen är intryckt, och röstrutan visar **Lyssnar**.
   Kontrollerade kommandon nedan skrivs i startguidens terminal. Ersätt
   `REQUEST`, `VERSION`, `CONTENT` och objekt-ID med värden från första `held`
   -meddelandets `draft`. Efter ett verktyg som ändrar utkastet hämtas den nya
   versionen från nästa `held.lastToolResult.version`. Läs hela
   verktygsresultatet; ett avvisat verktyg ger ingen ny godkänd version.
4. Starta en ny tom installation mellan fallen. Behåll samma databas under
   omstartsprovet. Stäng med `quit` och kontrollera städningen enligt guiden.

## Samtal och samlat sparande

### TAL-01: familjeärendet sparas med röst och bevarad oskickad formulärtext

**Syfte:** Utföra ett kontrollerat familjeärende med bevarad oskickad
formulärtext, inklusive rättelse och samlat sparande med verifierat kvitto.

**Användare:** Alex i den kontrollerade installationen. Verkligt tal bedöms i
TAL-23.

**Förutsättningar:** Den kontrollerade vägen kräver bara startguiden. CI
ersätter leverantörerna och mediegränsen; det bevisar inte språkförståelse eller
ljud.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-01"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Utföra ett kontrollerat familjeärende med bevarad oskickad formulärtext, inklusive rättelse och samlat sparande med verifierat kvitto."
  ],
  "evidence": [
    {
      "kind": "real-provider",
      "spec": "tests/real-voice/swedish-speech.spec.ts",
      "title": "TAL-01: recorded Swedish speech changes the family map through real Live and Terra",
      "purpose": "Separat inspelat leverantörsprov; etablerar inte fysisk mikrofon eller mänskligt lyssningsresultat."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-01](voice-controls-preparation.md#tidslinje-tal-01) vid
motsvarande UI-steg. Den anger seed-family, de faktiska verktygsargumenten och
städning.

**Steg:**

1. Öppna det förberedda TestHousehold som Alex. Läs förslaget Lo Lind, typ
   Person, beskrivning **Använder familjens musik.** och adressändringen i
   utkastet. Välj Karta → 1 konflikt i ditt utkast. Läs båda sidornas namn,
   typ och beskrivning: sparat Lo Berg, Person, **Spelar piano i
   musikföreningen.**; ditt förslag Lo Lind, Person, **Använder familjens
   musik.** Stäng konfliktdialogen utan att välja lösning ännu.
2. Starta Prata med Skyttel med medgivande. Stäng textvyn, välj Tabell och
   Redigera Kim Exempel. Skriv Osänd text som ska finnas kvar i beskrivningen.
3. Låt det kontrollerade röstuppdraget behålla Lo-förslaget, rätta abonnemanget
   till 189 kr per månad och spara hela utkastet enligt tidslinjen. Behåll
   formuläret öppet medan det arbetar.
4. Kontrollera kvarvarande oskickad text. Tryck Escape, välj Fortsätt redigera
   och kontrollera texten igen. Lämna uttryckligen med Kasta ändringarna och
   fortsätt.
5. Läs Sparat och tomt utkast. Öppna Rapporter → Ändringshistorik och Visa
   ändringarna i senaste sparandet. Läs Lo Lind, `musik@example.test` och pris 189
   SEK per månad. Oskickad text ska saknas.
6. Välj Tillbaka till arbetet. I Tabell, öppna Lo Lind, Familjens Molnmusik,
   Familjens musikkonto och `musik@example.test` och läs full beskrivning och typ.
   Lo Lind ska vara Person med **Spelar piano i musikföreningen.**:
   namnvalet behåller Lo Lind och den samtidiga beskrivningsrättelsen bevaras.
   Läs pris, valuta och intervall. Öppna deras samband och läs
   inloggningsadress, kontaktadress, avtalspart, betalare och betalningsmedel.
   Läs också okänd ägare, uttryckligen ingen användare, osäker användning och
   kontokopplingens ospecificerade bankkonto.
7. Slå av mikrofonen och välj Nytt samtal. Ingen ny medgivanderuta visas. Läs
   familjens kvitto igen; inget extra sparande tillkommer. Logga ut och avsluta
   provmiljön enligt tidslinjen.

Det verkliga talflödet har en egen mänsklig identitet, TAL-23.

**Förväntat resultat:**

- Kontrollerade verktygssteg löser namnkonflikten och bevarar rättelser. Faktisk
  svensk språkförståelse och följdfrågor bedöms i TAL-23.
- Ett tydligt aktuellt besked sparar hela utkastet, även den egna rättelsen,
  utan ett extra obligatoriskt ja. Konflikter behöver däremot redas ut.
- Sparstatus bygger på ett riktigt kvitto. Osänd text blir inte sparad. Konto,
  adresser och roller behåller sin betydelse och kunskapsstatus.
- Mikrofonavslag stoppar ny inspelning direkt. En tyst anslutning kan behålla
  mikrofonspåret för att låta Skyttel tala klart. När provmiljön avslutas
  frigörs resurserna. Inget verkligt plattformsresultat tillskrivs CI eller de
  tysta kontrollerade ersättarna.

## Avbrott och återhämtning

### TAL-02: negativa besked och förlorad anslutning stoppar sena röständringar

**Syfte:** Stoppa otillåtna sparanden och sena förslag när anslutningen bryts.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och rösten är igång.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-02"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Stoppa otillåtna sparanden och sena förslag när anslutningen bryts."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-02](voice-controls-preparation.md#tidslinje-tal-02) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Låt de fyra kontrollerade negativa, uppskjutna, hypotetiska och citerade
   sparuppdragen i tidslinjen avslutas ett i taget. Läs Skyttel kunde inte
   slutföra uppdraget. Försök igen. och oförändrat utkast.
2. Låt Rätta namnet vänta och bryt medieanslutningen enligt tidslinjen. Kräv
   mikrofon av direkt, därefter Rösten avbröts och fungerande textfält.
3. Släpp det sena För sent-förslaget enligt tidslinjen. Läs hela Lo
   Exempel-förslaget, typ Person och beskrivningen Påhittad uppgift i Visa
   utkastet. Inget sparande ska ha tillkommit.
4. Förbered nekad mikrofon och försök starta. Textfältet ska fortfarande gå att
   använda. Förbered tillåten mikrofon men spärrat ljud och försök igen.
5. Tillåt uppspelningen enligt tidslinjen och välj Starta ljudet. Rösten visar
   Lyssnar först efter åtgärden. Slå av mikrofonen, logga ut och avsluta.

**Förväntat resultat:**

- Inga negativa, uppskjutna, hypotetiska eller citerade besked sparar.
- Det sena förslaget ändrar ingenting. Lo heter fortfarande Lo Exempel.
- Alla mediespår avslutas och text/formulär är fortsatt användbara. Inget
  avbrutet ljudsvar påstås ha ångrat ett redan genomfört sparande.

### TAL-03: synlig markering och exakt sparåterhämtning fungerar efter

**Syfte:** Bekräfta verklig markering och återhämta samma beständiga sparförsök.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och rösten är igång. Använd en
telefonbred vy, 390 × 844 CSS-pixlar i det automatiska provet. Markeringen och
detaljpanelens sammanfattning ska vara synliga samtidigt med kartans
återkoppling; den får inte täcka detaljpanelens kontroller. Prova även
navigationen vid 640 × 500 och 320 × 250 CSS-pixlar.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-03"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Bekräfta verklig markering och återhämta samma beständiga sparförsök."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-03](voice-controls-preparation.md#tidslinje-tal-03) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Låt det kontrollerade markeringsuppdraget visa Lo Exempel. Läs vald Lo och
   dess uppgifter. Vid 640 × 500 och 320 × 250, fokusera Lo med tangentbordet
   och Shift+F10 → Fokusera markering. Panorera genom Navigera och stäng med
   Stäng navigering. Lo ska förbli synlig och vald.
2. Återgå till 390 × 844. Förbered den blockerade kontrollen och det väntande
   sparförsöket enligt tidslinjen. Läs Skyttel kunde inte kontrollera om
   utkastet sparades. Mikrofonen är av.
3. Startoperatören behåller samma databas och startar om enligt tidslinjen.
   Efter borttagen blockering, ladda om och välj Tabell. Starta sedan samtalet
   med medgivande om det behövs.
4. Läs Kontrollen visar att hela utkastet sparades. Ändringarna finns i
   hushållets karta. Läs hela sparade Lo Exempel, typ Person och beskrivningen
   Påhittad uppgift.
5. Bryt den kontrollerade leverantörskontakten efter sparandet. Ladda om och
   öppna Rapporter → Ändringshistorik. Öppna Identifiera sparandet och
   användaren och läs samma sparande.
6. Välj Tillbaka till arbetet, starta rösten och följ den separata preliminära
   användningsmätningen i tidslinjen. Nytt samtal ska bevara mikrofonvalet och
   samma genomförda sparande. Logga ut.

**Förväntat resultat:**

- Markering bekräftas först efter den verkliga webbläsarens återkoppling. Ett
  accepterat kommentarspaket är inte bevis för hörbart tal.
- Omstart glömmer samtalet men bevarar utkast och sparförsök. Samma försök
  slutförs exakt en gång; korta ja eller nya allmänna uppdrag ersätter det inte.
- Avbrutet ljud återtar inget genomfört sparande. Saknad slutlig mätning förblir
  osäker: 12 följt av 15 är 15 kända sekunder, inte 27 eller säkert noll.

### TAL-04: samtalstext hålls isär från verifierade röstresultat

**Syfte:** Hålla modellens samtalstext skild från bekräftade resultat även när
samma samtal förs med rösten.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Starta en ny installation enligt
[röstförberedelsen](#controlled-voice-fixture). Skapa Talprov med Lo Exempel
som osparat Person-förslag. Starta samtalet och slå på mikrofonen med
**Prata med Skyttel**. Vänta på **Lyssnar** i röstrutan. Anteckna kartans
aktuella urval. Tysta mediespår och terminalens kommentarspaket är inte bevis
för hört tal.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-04"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Hålla modellens samtalstext skild från bekräftade resultat även när samma samtal förs med rösten."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-04](voice-controls-preparation.md#tidslinje-tal-04) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Låt tidslinjens fyra fria svar levereras ett i taget. Läs dem i
   samtalstexten, samma Lo-förslag och oförändrat urval. Inget kvitto ska
   tillkomma.
2. Låt det uttryckliga Markera Lo Exempel-uppdraget genomföras. Kräv markerad
   Lo, kvarvarande fråga och samma utkast.
3. Låt Spara hela utkastet nu genomföras enligt tidslinjen. Läs Sparat och öppna
   Rapporter → Ändringshistorik. Öppna Visa ändringarna och läs hela sparade Lo
   Exempel.

**Förväntat resultat:**

- Kommentarspaketet skiljer verifierbar status från modellens fria ord. Ett
  lyckat mottaget paket innebär inte att tal hördes eller var korrekt.
- De fyra fria svaren ändrar inte kartan eller bekräftad status. Samtalsfrågor
  finns kvar och kan besvaras, även efter verklig markering.
- De sista verktygsanropen ger faktisk markeringsbekräftelse respektive sparat
  innehåll och kvitto. De fria orden ersätter aldrig dessa bevis.

### TAL-05: dialog, avstängd mikrofon och arbetsraden finns kvar under samtalet

**Syfte:** Följa båda talarna, stänga av mikrofonen utan att tappa samtalet och
se att Skyttel arbetar med ett talat uppdrag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ förberedelsen för TAL-02 med Lo Exempel i utkastet.
Rösten är igång. Detta prov använder syntetiska textfragment och tysta
mediespår; verkligt tal redovisas separat i TAL-23.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-05"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Följa båda talarna, stänga av mikrofonen utan att tappa samtalet och se att Skyttel arbetar med ett talat uppdrag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-05](voice-controls-preparation.md#tidslinje-tal-05) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Låt de förberedda transportfragmenten tillkomma enligt tidslinjen. Läs
   sammanhållna Kim betalar för musiken., Jag lyssnar. Berätta mer. och den
   senare Rätta till Lo.
2. Slå av mikrofonen. Efter tidslinjens korta brytning och återanslutning är den
   fortfarande av. Slå själv på den; samma dialog ska finnas kvar.
3. Låt Kontrollera utkastet vänta. Läs Skyttel arbetar sist i samtalstexten. Låt
   frågan Vem använder musiken? tillkomma; arbetsraden ska försvinna.
4. Slå av mikrofonen. Tidigare dialog finns kvar. Välj Nytt samtal och läs
   beskedet om kvarvarande osparad ändring. Läs hela Lo-förslaget.

**Förväntat resultat:**

- Fragment visas löpande med talarroll och sammanhängande korta pauser. Tidigare
  rader ersätts inte av det senaste svaret.
- Paus behåller samtal och ljuduppspelning. En återhämtad anslutning startar
  inte en mikrofon som användaren har pausat.
- Raden **Skyttel arbetar…** skiljer väntan från ett färdigt svar.
- Samtalstexten är tillfällig och är inte ett sparkvitto. **Nytt samtal** tömmer
  den men bevarar utkastet.

### TAL-06: avbryt uppdrag från kartan och behåll samtalet och tidigare förslag

**Syfte:** Nå avbrott utan öppen dialog och bevara redan utfört arbete.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse. Lo-förslaget och rösten finns
kvar. Anteckna utkastets innehåll och version.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-06"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Nå avbrott utan öppen dialog och bevara redan utfört arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-06](voice-controls-preparation.md#tidslinje-tal-06) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Skriv Osänd rättelse utan att skicka. Låt Rätta Lo vänta enligt tidslinjen.
   Stäng textvyn och öppna Karta.
2. Välj Avbryt i röstrutan. Låt det gamla För sent-förslaget släppas enligt
   tidslinjen. Öppna textvyn och läs Avbrutet. Föreslagna ändringar ligger kvar
   i utkastet.
3. Slå av mikrofonen. Kräv kvarvarande Osänd rättelse. Välj Nytt samtal, läs en
   osparad ändring och läs hela Lo Exempel-förslaget med Person och Påhittad
   uppgift.

**Förväntat resultat:**

- Avbrott stoppar det gamla uppdragets sena ändringar, utan att radera förslag.
- Röst av, uppdragsavbrott och nytt samtal är separata handlingar.
- Röstresurser avslutas vid avstängning; oskickad text behålls också efter
  **Nytt samtal**.

### TAL-07: uppmätt ljudaktivitet skiljs från avstängd mikrofon och består

**Syfte:** Skilja ljudaktivitet från mikrofonens läge och bevara anslutningen
medan Skyttel talar klart och användaren navigerar.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse. Använd enbart de genererade
webbläsarsignalerna nedan. De provar ljudmätningen, inte svensk talförståelse,
högtalare eller fysisk mikrofon.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-07"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Skilja ljudaktivitet från mikrofonens läge och bevara anslutningen medan Skyttel talar klart och användaren navigerar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-07](voice-controls-preparation.md#tidslinje-tal-07) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Följ tidslinjens kontrollerade mikrofonaktivitet, tystnad och inkommande
   aktivitet. Läs i tur Du talar, Lyssnar och Skyttel talar.
2. Emulera minskad rörelse. Vågformen är fortfarande synlig men står stilla. Slå
   av mikrofonen medan Skyttel talar; röstrutan ska fortsätta visa det
   inkommande svaret.
3. Skriv Kvar i samtalet utan att skicka. Öppna Inställningar och kontrollera
   fokus på sidrubriken och fortsatt röstruta. Återgå till kartan, öppna textvyn
   och kontrollera samma text och fältfokus.
4. Låt den inkommande aktiviteten avslutas enligt tidslinjen. Röstrutan
   försvinner medan mikrofonen fortsatt är av. Verklig zoom, teman och fysisk
   pekning bedöms separat i HJALP-12.

**Förväntat resultat:**

- Vågformen följer uppmätt ljud i den befintliga anslutningen; tystnad eller
  transkript startar ingen animation. Minskad rörelse behåller status.
- Avstängd mikrofon stoppar eget ljud utan att stoppa inkommande ljud eller
  skapa en ny leverantörsanslutning. Tangentbordsfokus följer återgången.
- Verkliga teman, zoom, pekning och nåbarhet bedöms separat i HJALP-12.
  TAL-20–22 har egna konfigurerade placeringar; kartmarkering och navigering med
  korta fönster ingår i TAL-03.

### TAL-08: nödvändiga frågor finns i samtalet och fel visas i en samtalsnotis

**Syfte:** Visa ett aktuellt svarskrav utan att tolka all frågande modelltext
som ett hinder eller låta gamla frågor följa ett nytt uppdrag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse med Lo-förslaget.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-08"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Visa ett aktuellt svarskrav utan att tolka all frågande modelltext som ett hinder eller låta gamla frågor följa ett nytt uppdrag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-08](voice-controls-preparation.md#tidslinje-tal-08) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Slå av mikrofonen. Skicka Lägg till uppgiften och stäng textvyn. Låt det
   validerade kontrollerade förslaget och frågan i tidslinjen tillkomma.
2. Öppna textvyn, läs Vem använder tjänsten?, skicka Lo använder tjänsten. och
   håll svaret. Läs arbetsraden sist; inget rent textarbete visar röstrutan.
3. Låt Vill du läsa vidare? tillkomma enligt tidslinjen. Skicka Berätta mer.,
   stäng textvyn och läs uppdragsnotisen efter det förberedda felet.
4. Öppna textvyn och välj Nytt samtal. Läs hela Lo Exempel-förslaget, Person och
   Förslag väntar på svar. Inget förslag försvinner vid samtalsbyte.

**Förväntat resultat:**

- Validerade följdfrågor ger ett uttryckligt svarskrav. Skyttel frågar själv om
  obesvarade identiteter och konflikter i samtalet; gränssnittet skapar inte en
  egen fråga. Fri modelltext bekräftar varken krav eller sparande.
- Nytt uppdrag och **Nytt samtal** rensar tidigare samtalsfrågor. Fel och nästa
  handling nås även med stängd dialog. Utkastet bevaras vid **Nytt samtal**.

### TAL-09: starten kräver medgivande och återhämtar mikrofonavbrott

**Syfte:** Starta samtalet först efter medgivande och skilja väntan på
mikrofonåtkomst från anslutning, med återhämtning efter avslag eller avbruten
start.

**Användare:** Alex i en ny kontrollerad installation.

**Förutsättningar:** Skapa Talprov. Ingen samtalsanslutning finns.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
TAL-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-assistant.spec.ts",
    "caseId": "TAL-09"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Starta samtalet först efter medgivande och skilja väntan på mikrofonåtkomst från anslutning, med återhämtning efter avslag eller avbruten start."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-09](voice-controls-preparation.md#tidslinje-tal-09) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Välj Prata med Skyttel, läs medgivanderutan och välj Avbryt. Starta i stället
   med Skriv till Skyttel → Nytt samtal → Godkänn och starta.
2. Skicka Text utan mikrofon och låt Texten fungerar. tillkomma enligt
   tidslinjen. Rösten ska inte ha startats.
3. Förbered väntande mikrofonåtkomst enligt tidslinjen och välj Prata med
   Skyttel. Läs Rösten startar och knappens beskrivning Avbryt starten av
   rösten. Avbryt med samma knapp och låt den sena åtkomsten släppas.
4. Förbered nekat läge och försök igen. Läs hindret och behåll fungerande
   textfält och tidigare svar.
5. Förbered tillåten åtkomst med väntande anslutningsstart. Läs fortsatt Rösten
   startar med mikrofonen av. Först när den separata starten släpps blir knappen
   intryckt och röstrutan Lyssnar.

**Förväntat resultat:**

- Röst och text kräver samma medgivande. Att öppna eller avbryta medgivanderutan
  eller använda text begär inte mikrofonåtkomst.
- Sen mikrofonåtkomst återupplivar inte avbruten start. Avslag lämnar samtalet
  användbart. Klar anslutning och mikrofonåtkomst skiljs åt.

## Mikrofonen och röstrutan

Fallen TAL-10 till TAL-14 och TAL-16 använder den
[kontrollerade startguiden](#controlled-voice-fixture) med Talprov och Lo
Exempel som osparat förslag, enligt förberedelsens steg 2. Starta en ny
installation för varje fall. Kommandon som `setSound` och `stats()` körs i
webbläsarkonsolen, och `user`, `delegate` och `reply` i startguidens terminal.
TAL-17 kräver riktig utrustning.

### TAL-10: Prata med Skyttel slår på och av mikrofonen utan att någon

**Syfte:** Slå på och av mikrofonen med ett kort tryck, avbryta starten och se
att bara röstrutan visas.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Kartan är öppen. Inget medgivande är godkänt under besöket.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-10"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Slå på och av mikrofonen med ett kort tryck, avbryta starten och se att bara röstrutan visas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-10](voice-controls-preparation.md#tidslinje-tal-10) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Läs Prata med Skyttel med mikrofon av. Förbered väntande åtkomst enligt
   tidslinjen, välj knappen och Godkänn och starta.
2. Läs Rösten startar, samma knappnamn och beskrivningen Avbryt starten av
   rösten. Ingen textvy öppnas.
3. Avbryt med samma knapp. Släpp den sena åtkomsten och återställ tillåtet läge
   enligt tidslinjen. Starta uttryckligen igen.
4. Läs Lyssnar och mikrofon på utan öppnad panel. Slå av, invänta några sekunder
   och läs det bevarade fullständiga Lo-förslaget utan att ändra det.
5. Startoperatören återgår till kartan om läsvyn öppnades. Slå själv på
   mikrofonen igen utan nytt medgivande.

**Förväntat resultat:**

- Steg 2: röstrutan visar grå punkter och **Rösten startar**, utan stoppikon.
  Knappen heter fortfarande **Prata med Skyttel**, är inte intryckt och
  beskrivs **Avbryt starten av rösten**.
- Steg 3: den avbrutna röstrutan försvinner. Sen åtkomst startar inte ett
  samtal. Först den uttryckliga nya starten ger **Lyssnar**.
- Steg 4 före avslag: knappen är intryckt och visar samma mikrofon. Röstrutan
  visar sju punkter och **Lyssnar**. Ingen panel öppnas, och textfältet syns
  inte. Knappen har accentfärgad bakgrund; i avläget är den en vanlig knapp utan
  stoppsymbol.
- Steg 4 efter avslag: knappen är inte intryckt, och röstrutan försvinner direkt.
  Lo Exempel, Person och **Påhittad uppgift** finns kvar i utkastet.
  Levande avstängt mikrofonspår och kvarvarande anslutning granskas separat
  enligt tidslinjen.
- Steg 5: samma samtal fortsätter utan medgivanderuta, och röstrutan visar
  **Lyssnar**.

### TAL-11: Skyttel arbetar färdigt och talar klart när mikrofonen stängs av

**Syfte:** Låta Skyttel bearbeta det sagda och tala klart sitt svar när
mikrofonen stängs av mitt i arbetet, utan att något mer ljud skickas.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Samtalet är startat med **Prata med Skyttel**, och
röstrutan visar **Lyssnar**.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-11"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Låta Skyttel bearbeta det sagda och tala klart sitt svar när mikrofonen stängs av mitt i arbetet, utan att något mer ljud skickas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-11](voice-controls-preparation.md#tidslinje-tal-11) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Låt Rätta namnet till Lo Lind vänta enligt tidslinjen. Läs Skyttel arbetar
   och Avbryt.
2. Slå av mikrofonen och fokusera Återställ vy. Uppdraget fortsätter;
   mikrofonknappen är fortfarande operabel.
3. Låt det kontrollerade namnförslaget och svaret Namnet är ändrat i utkastet.
   tillkomma medan inkommande aktivitet pågår. Läs Skyttel talar med mikrofonen
   av.
4. Låt ljudaktiviteten upphöra, invänta några sekunder och låt ett nytt
   inkommande segment börja enligt tidslinjen. Skyttel talar ska återkomma utan
   mikrofonstart eller fel. Läs hela Lo Lind-förslaget med Person och Påhittad
   uppgift.

**Förväntat resultat:**

- Steg 1: röstrutan visar **Skyttel arbetar** och stoppikonen **Avbryt**.
- Steg 2: knappen är inte intryckt men går att välja. Mikrofonen är av.
  Röstrutan visar fortfarande **Skyttel arbetar**.
- Steg 3: utkastet visar **Lo Lind**. Röstrutan visar **Skyttel talar**.
- Steg 4: röstrutan
  försvinner när ljudet tystnar, och statusen för hjälpmedel innehåller
  **Mikrofonen är av**. Anslutningen och det avstängda mikrofonspåret finns
  kvar enligt tidslinjens separata resurskontroll. Vid det förberedda nya
  ljudsegmentet visas **Skyttel talar** utan att mikrofonen slås på.
  Inget fel visas.

### TAL-12: Avbryt i röstrutan stoppar arbetet och tystar Skyttel men

**Syfte:** Stoppa ett talat uppdrag och tysta Skyttels röst med stoppikonen,
utan att redan föreslagna ändringar försvinner.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Mikrofonen är på. Anteckna utkastets innehåll.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-12"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Stoppa ett talat uppdrag och tysta Skyttels röst med stoppikonen, utan att redan föreslagna ändringar försvinner."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-12](voice-controls-preparation.md#tidslinje-tal-12) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Låt Rätta namnet vänta enligt tidslinjen. Fokusera Avbryt med Tab och tryck
   Enter.
2. Röstrutan visar Lyssnar utan stoppknapp, och fokus går till Prata med
   Skyttel. Släpp det sena För sent-förslaget enligt tidslinjen; det får inte
   ändra Lo.
3. Låt inkommande aktivitet börja, välj Avbryt och låt det gamla ljudet försöka
   återkomma efter en paus enligt tidslinjen. Mikrofonen ska förbli på och
   Lyssnar visas.
4. Låt ett nytt inkommande segment börja i den nya anslutningen. Läs Skyttel
   talar och hela bevarade Lo Exempel-förslaget med Person och Påhittad uppgift.

**Förväntat resultat:**

- Steg 2: röstrutan visar **Lyssnar** utan stoppikon. Fokus står på
  **Prata med Skyttel**, som fortfarande är intryckt.
- Steg 2: utkastet är oförändrat. Lo heter fortfarande Lo Exempel. Kommentarer
  och resursstopp granskas separat enligt tidslinjen.
- Steg 3: det gamla ljudet tystnar direkt. Samtalets tidigare text finns kvar,
  röstrutan återgår till **Lyssnar**. Förslagen finns kvar.
- Steg 4: det avbrutna ljudet kan inte återupptas efter en paus.
  **Skyttel talar** visas för det nya svaret, som ger kontrollerad inkommande
  ljudaktivitet.

### TAL-13: ett skrivet meddelande visar aldrig röstrutan och stänger av

**Syfte:** Hålla röstrutan borta från ett samtal med enbart text och låta
mikrofonknappen vänta medan Skyttel arbetar med ett skrivet meddelande.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Samtalet är startat med **Skriv till Skyttel → Nytt
samtal → Godkänn och starta**, utan mikrofonstart.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-13"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Hålla röstrutan borta från ett samtal med enbart text och låta mikrofonknappen vänta medan Skyttel arbetar med ett skrivet meddelande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-13](voice-controls-preparation.md#tidslinje-tal-13) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Skicka Beskriv utkastet med mikrofonen av och låt det vänta. Mikrofonknappen
   är tillfälligt inaktiverad och ingen röstruta visas.
2. Låt Utkastet har ett förslag. tillkomma enligt tidslinjen. Knappen blir
   operabel igen utan röstruta.
3. Skicka Beskriv det en gång till. Tryck Escape i meddelandefältet medan det
   väntar. Knappen blir operabel igen.
4. Slå på mikrofonen, skicka Beskriv det nu. och välj Avbryt i röstrutan. Läs
   Skyttel arbetar före avbrottet och Lyssnar efteråt.

**Förväntat resultat:**

- Steg 1: **Prata med Skyttel** är avstängd, och ingen röstruta visas.
- Steg 2 och 3: knappen går att välja igen när Skyttel är klar eller uppdraget
  är avbrutet. Ingen röstruta visas, och ingen mikrofon används.
- Steg 4: med mikrofonen på visar röstrutan **Skyttel arbetar** med stoppikonen.
  Efter **Avbryt** visar den **Lyssnar**.

### TAL-14: röstrutans ordnade status och vågform

**Syfte:** Se statusordens ordning, vågformens fyra former och de två fasta
formerna vid minskad rörelse.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Mikrofonen är på, och röstrutan visar **Lyssnar**.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-14.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-14"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Se statusordens ordning, vågformens fyra former och de två fasta formerna vid minskad rörelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-14](voice-controls-preparation.md#tidslinje-tal-14) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Läs Lyssnar och sju punkter. Följ tidslinjens svaga/starka mikrofonaktivitet;
   läs Du talar och staplarnas större utslag.
2. Låt inkommande aktivitet börja medan mikrofonaktiviteten finns kvar. Skyttel
   talar ska gå före Du talar.
3. Låt Beskriv utkastet tillkomma och avsluta mikrofonaktiviteten så att
   uppdraget börjar. Återuppta mikrofonaktiviteten medan svaret väntar och
   läs Skyttel arbetar före båda andra statusarna. Avsluta aktiviteten igen
   och låt Utkastet har ett förslag. tillkomma enligt tidslinjen; Skyttel
   talar återkommer.
4. Emulera minskad rörelse. Läs samma stilla staplar för inkommande och
   återupptagen egen aktivitet. När båda avslutas återkommer sju stilla
   punkter och Lyssnar.

**Förväntat resultat:**

- Steg 1: **Lyssnar** har sju punkter i accentfärg. **Du talar** har staplar i
  accentfärg som är låga vid svagt ljud och höga vid starkt ljud.
- Steg 2: **Skyttel talar** går före **Du talar**. Staplarna rör sig jämnt i
  textfärg, och stoppikonen visas.
- Steg 3: **Skyttel arbetar** går före båda, med stilla punkter. Efter svaret
  visar den **Skyttel talar**.
- Steg 4: vågformen rör sig inte. **Skyttel talar** och **Du talar** har samma
  sju stilla staplar, som inte ändras med ljudnivån. **Lyssnar** har sju
  punkter. Formerna byts utan övergång.
- Röstrutan är en namngiven grupp. **Avbryt** går att trycka på. Den visar
  vågform, ett statusord, eventuell kontextsymbol och stoppikon. Den blir
  bredare med fler delar men behåller samma höjd. Text och stoppknapp förblir
  läsbara och nåbara; exakta mått granskas separat enligt tidslinjen.

### TAL-16: röstrutans namn läge och status för hjälpmedel

**Syfte:** Kontrollera knappens läge, röstrutans namn och tre DOM-statusar
med rätt förekomst och prioritet.

**Användare:** Alex i den kontrollerade installationen, utan att påstå faktiskt
hört besked.

**Förutsättningar:** Inget samtal pågår.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-16.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-16"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Kontrollera knappens läge, röstrutans namn och tre DOM-statusar med rätt förekomst och prioritet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-16](voice-controls-preparation.md#tidslinje-tal-16) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Starta Prata med Skyttel med fokus på knappen och slå av med samma knapp. Läs
   dess tillgängliga namn och läge.
2. Fokusera Återställ vy. Låt förberedelsen aktivera samma mikrofonknapp utan
   fokusflytt; läs statusen för hjälpmedel enligt tidslinjen.
3. Låt egen aktivitet, tystnad, väntande arbete och inkommande aktivitet
   tillkomma enligt tidslinjen. Läs respektive statusord, namngiven Röstruta och
   Avbryt.
4. Tabba från Prata med Skyttel genom Skriv till Skyttel, Avbryt och Utkast. Slå
   av mikrofonen och fokusera Återställ vy medan svaret fortsätter; avsluta
   inkommande aktivitet.
5. Slå på mikrofonen, öppna Inställningar och låt inkommande aktivitet börja.
   Fokusera Avbryt och tryck Enter. Fokus ska gå till Tillbaka till kartan.
   Faktiskt hört besked bedöms i TAL-24.

**Förväntat resultat:**

- Steg 1: knappens tillgängliga namn och läge beskriver knappens läge själv.
  Inget mer finns som status för hjälpmedel.
- Steg 2: **Lyssnar** finns som status för hjälpmedel en gång när mikrofonen
  slås på.
- Steg 3: **Du talar** erbjuds inte som DOM-status, och **Lyssnar** erbjuds inte
  som DOM-status igen.
- Steg 4: **Skyttel arbetar** finns som status för hjälpmedel. **Skyttel talar**
  erbjuds inte som DOM-status. Stoppikonen heter **Avbryt**.
- Steg 4: ordningen är **Prata med Skyttel**, **Skriv till Skyttel**,
  **Avbryt**, **Utkast** när utkastet innehåller förslag.
- Steg 4: **Mikrofonen är av** finns som status för hjälpmedel när röstrutan
  försvinner.
- Röstrutan är gruppen **Röstruta**, och vågformen läses inte. Alla
  DOM-statusar använder artig prioritet och väntar på sin tur.
  Faktiskt hörda ljud eller besked
  bedöms i TAL-24.
- Steg 5: röstrutan står kvar i Inställningarnas statusrad och följer rösten
  där. När **Avbryt** försvinner står fokus på **Tillbaka till kartan**.

### TAL-18: Avbryt bevarar ett långt samtal med mikrofonen på

**Syfte:** Avbryta ett talat uppdrag efter en lång genomgång utan att förlora
samtalets kontext, tidigare förslag eller mikrofonens valda läge.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse med Lo Exempel i utkastet.
Samtalet är startat med text och mikrofonen är av.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-18.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-18"
  },
  "reference": "Chromium; mikrofon på efter Avbryt. Sju långa turer, sent avbrutet namnförslag och fortsatt fråga.",
  "outcomes": [
    "Avbryta ett talat uppdrag efter en lång genomgång utan att förlora samtalets kontext, tidigare förslag eller mikrofonens valda läge."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinje TAL-18](voice-controls-preparation.md#tidslinje-tal-18) vid de
angivna UI-stegen. Läs tekniska paket och resurser där; verkligt hört tal hör
till TAL-17/23/24.

**Steg:**

1. Följ tidslinjens exakta sju långa numrerade skrivna turer och svar. Läs alla
   sju i samtalstexten.
2. Slå på mikrofonen och låt Rätta namnet till Lo Lind efter genomgången. vänta.
   Behåll mikrofonen på.
3. Välj Avbryt i röstrutan. En ny anslutning ska behålla mikrofonen på och
   tidigare samtalstext.
4. Låt det gamla För sent-förslaget släppas enligt tidslinjen. Skicka Vad gick
   vi igenom innan avbrottet? och låt det förberedda svaret tillkomma.
5. Läs första genomgången, fortsatt svar och hela Lo Exempel-förslaget med
   Person och Påhittad uppgift. Inget sent namnbyte får ha tillkommit.

**Förväntat resultat:**

- Steg 3: en ny röstanslutning skapas utan samtalsnotis. Samma mikrofonspår
  används utan en ny tillståndsfråga. Spåret behåller valt läge: på genom hela
  detta fall.
- Samtalstexten visar tidigare turer. Det automatiserade provet granskar också
  att den nya röstanslutningen får hela genomgången och det avbrutna uppdraget
  som ofullständigt i sin kontext.
- Steg 4: det nya modelluppdraget har **Genomgång 1** och **Genomgång 7** i sin
  kontext. Förslaget **För sent** visas inte; Lo-förslaget och utkastets version
  är oförändrade.

### TAL-17: röstrutan med riktig mikrofon, pekskärm och skärmläsare

**Syfte:** Pröva det som de kontrollerade fallen inte kan visa: riktig mikrofon,
riktig enhet och riktiga hjälpmedel.

**Användare:** Alex med konfigurerad inloggning i ett separat provhushåll med
påhittade data och verklig röst.

**Förutsättningar:** Chrome på Windows med NVDA, Chrome på macOS med VoiceOver,
och Chrome på iPhone och iPad med VoiceOver. Verkliga leverantörsanrop kan kosta
pengar.

**Förberedelse med verklig röst:**

1. Följ även
   [den vanliga enhetsförberedelsen](../development/testing.md#physical-device-manual-preparation)
   för nåbar HTTPS, verklig leverantörsinloggning, medlemskap, privata förslag
   och städning. Följ
   [guiden för separat provdatabas](../development/devcontainer.md#disposable-local-database)
   , inklusive lokal inloggning, startkommandot och städningen. Behåll
   provdatabasen vid omstart inom ett fall. Kör inte den kontrollerade
   röststartguiden för dessa lyssningsprov.
2. Konfigurera serverns `OPENAI_API_KEY` i den privata miljöfilen enligt
   [leverantörsförberedelsen](../development/devcontainer.md#optional-assistant-access)
   och starta om provmiljön. Nyckeln är endast för servern och ska inte anges i
   en `VITE_` -variabel. Den verkliga leverantören ska vara tillgänglig.
3. På dator kan den lokala guidens adress användas. För iPhone och iPad behövs
   en isolerad provinstallation med en HTTPS-adress som enheten når och med
   fungerande konfigurerad inloggning. Använd dess faktiska adress; datorns
   `localhost` är inte en adress till datorn från telefonen. Installationens
   ursprung och inloggning följer
   [installationsguiden](../operations/installation.md).
4. Logga in med den konfigurerade testidentiteten och skapa Talprov med enbart
   påhittade uppgifter. Anslut fysisk mikrofon och ljudutgång. Använd enhetens
   riktiga skärmtangentbord och den angivna skärmläsaren. Godkänn den aktuella
   medgivandetexten vid samtalsstart; äldre sparat medgivande kräver nytt
   godkännande.

Det separata automatiska [WAV-provet](real-voice-tests.md) kräver egen
uttrycklig aktivering och använder inspelat tal med ersatt mikrofon och
inloggning. Det är leverantörsunderlag, inte dessa fysiska lyssningsprov.
Anteckna faktiskt hört resultat separat från automatiska körningar.

**Kräver mänsklig observation:** Riktig mikrofon, faktiskt hört ljud och stopp,
tillsammans med enhetens egna kontroller.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Säg provord efter mikrofonavslag och hör att bara det tidigare talet besvaras; bedöm ljud, vågform och stopp på faktisk utrustning."
  },
  "reference": "Riktig mikrofon/ljudutgång på Windows, macOS, iPhone och iPad; nåbar HTTPS för telefon och surfplatta.",
  "outcomes": [
    "Ny inspelning slutar vid avslag medan redan fångat tal besvaras.",
    "Faktiskt ljud, stopp och röstrutans fria plats bedöms per enhet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Prata med Skyttel** och tillåt mikrofonen. Säg
   **Lägg till en påhittad cykel.** och stäng av mikrofonen direkt efter.
2. Lyssna medan Skyttel arbetar och svarar. Kontrollera i webbläsarens
   adressfält eller i systemet när mikrofonen används.
3. Slå på mikrofonen, tala i olika styrka och se vågformen. Låt Skyttel svara
   och välj **Avbryt** medan Skyttel talar.
4. Gör om stegen med skärmläsare och med fokus både på knappen och någon
   annanstans. Lyssna efter dubbla eller avbrutna uppläsningar och efter om
   skärmläsarens röst tolkas som tal.
5. På iPhone i stående läge: se var röstrutan står och att den inte täcker
   verktygsfältet med **Återställ vy** eller kartans status och teckenförklaring
   under hushållsnamnet. Gör om på iPad och på liggande telefon.

**Förväntat resultat:**

- Skyttel bearbetar det sagda färdigt och talar klart efter att mikrofonen är
  av. Ny inspelning slutar direkt vid avslag. En tyst anslutning kan behålla
  mikrofonspåret; systemets användningsindikator bevisar därför inte att nytt
  tal tas emot. Säg ett nytt provord efter avslag och kontrollera att det inte
  når samtalet.
- Staplarna följer rösten. **Avbryt** tystar Skyttel direkt.
- Uppläsningarna kommer en gång, i tur och med rätt text. Anteckna om
  skärmläsarens röst tas upp av mikrofonen.
- Röstrutan står uppe till höger på iPad och liggande telefon och vid
  nederkanten på stående telefon. Anteckna enhet, system, webbläsare och
  hjälpmedel för varje prov.

### Bedömning mot WCAG 2.2 AA

Flödet är utformat mot WCAG 2.2 nivå AA. Kraven nedan är designmål, och
automationen visar bara det som anges. Ingen riktig mikrofon, skärmläsare,
pekskärm eller fysisk enhet är provad, och fullständig överensstämmelse intygas
inte.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning | Automatisk kontroll | Återstår att prova manuellt |
| --- | --- | --- | --- |
| 1.1.1 Icke-textuellt innehåll | Vågformen är dold för hjälpmedel. Statusordet bär beskedet, och stoppikonen heter **Avbryt**. | Dold vågform, namn på stoppikonen. | Uppläsning med NVDA och VoiceOver. |
| 1.3.1, 4.1.2 Namn, roll och värde | **Prata med Skyttel** är en växlingsknapp med samma namn i båda lägena. Röstrutan är gruppen **Röstruta**. Beskrivningen är **Avbryt starten av rösten** medan rösten startar. | Namn, roll, intryckt läge och beskrivning. | Hur skärmläsare säger läget. |
| 1.4.1 Färg | Påslagen knapp har fylld bakgrund, inte bara en annan nyans, och intryckt läge för hjälpmedel. Röstrutan med **Lyssnar** visar också att mikrofonen är på. Vågformens färg följs av statusordet. | Intryckt läge, ändrad bakgrund och statusord i alla lägen. | Om fylld och ofylld knapp går att skilja åt utan färgseende. |
| 1.4.3, 1.4.11 Kontrast | Rutan och knappen använder kartans färger i ljust och mörkt tema. De grå punkterna bär ingen egen information. | – | Kontrast för text, stoppikon och fokusram i båda teman. |
| 1.4.4, 1.4.10 Förstoring och omflöde | Rutan har fast höjd och följer innehållets bredd, utan rullning i sidled. | Placering på 1280, 820 och 390 px utan rullning i sidled. | Verklig webbläsarzoom 200 och 400 procent. |
| 2.1.1 Tangentbord | Knappen och stoppikonen nås med Tab. | Tangentordning och Enter på **Avbryt**. | Hjälpmedlens egna kommandon. |
| 2.2.2 Paus, stopp, dölj | **Skyttel talar** rör sig medan Skyttel talar. **Avbryt** tystar Skyttel och stoppar rörelsen, och minskad rörelse ger fasta former. | Fasta former vid minskad rörelse. | Bedömning av rörelse som varar längre än fem sekunder. |
| 2.3.3 Animering från interaktioner | Vid minskad rörelse rör sig inget, och formerna byts utan övergång. | Ingen animering och ingen övergång. | – |
| 2.4.3, 2.4.7 Fokus | Ordningen är **Prata med Skyttel**, **Skriv till Skyttel**, **Avbryt**, sedan resten av verktygsraden. Försvinner **Avbryt** med fokus går fokus till **Prata med Skyttel**. | Tangentordning och fokus efter **Avbryt**. | Läsordning med VoiceOver när rutan står vid nederkanten. |
| 2.5.8 Pekmål | Stoppikonen är 26 px och har en tryckyta på 44 px på mobil enhet. | Stoppikonens mått. | Träffsäkerhet på fysisk pekskärm. |
| 4.1.3 Statusmeddelanden | **Lyssnar**, **Skyttel arbetar** och **Mikrofonen är av** läses upp i tur, utan att flytta fokus och utan ljudsignaler. | Uppläsningarnas text, tur och att de inte upprepas. | Att varje uppläsning kommer en gång med riktig skärmläsare. |
<!-- markdownlint-enable MD013 -->

Samtalsnotisernas uppläsning och fokus provas i
[samtalsnotiserna](conversation-notices.md). Röstrutans plats, bredd, höjd och
pekmål kontrolleras automatiskt i
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), med de testfall
vars titel börjar med “röstrutan står på sin plats”. På riktig enhet prövas
platsen i TAL-17.

Placeringsproven kräver att hela röstrutan är synlig utan att täcka
verktygsfältets **Återställ vy**, kartans status eller teckenförklaringen under
hushållsnamnet. Panorera med **Navigera** och välj sedan **Återställ vy** före
placeringsprovet. På smal skärm kan skyddade ytor följa den synliga skärmens
rullningsflöde; de bestämmer gränsen som rutan måste lämna fri. Rutan ska inte
täcka verktygsfältet när textvyn stängs. Samtalsdelarnas samlade läsordning,
statusförekomster och kvarstående hjälpmedelsprov finns i
[den samlade bedömningen](conversation-accessibility.md).

## Controlled voice fixture

Use this disposable fixture to check Skyttel's voice controls, delegation,
delayed backend work and recovery. The browser runs the actual application and
Live SDK; authentication, OAuth/MCP and SQLite are real. External identity, Live
and Terra responses are controlled substitutes. Browser microphone and WebRTC
resources are also substitutes, with silent synthetic media tracks.

**This fixture does not listen to your microphone or speak.** It does not test
speech recognition, Swedish pronunciation, actual browser permission prompts,
device audio or real-provider availability. The application's listening label
describes the simulated connection. Keep actual speech/device results separate.
Integration tests cover these controls; #97 does not require a manual repeat.
Use the [real speech check](real-voice-tests.md) for automated provider
evidence. Human listening and equipment assessment remain separate.

### Start the isolated application

From the repository root in the devcontainer, run:

```sh
npm ci
npm run build
node --import tsx scripts/manual-voice.ts
```

The launcher accepts no origin, database or credentials. It uses a fresh private
temporary directory, ignores the normal private environment file, and makes no
real Google, Microsoft or OpenAI requests. Keep its terminal open.

Wait for `ready`, which prints `origin` and `directory`. Forward that random
port privately in VS Code's **Ports** panel, using the same host port.

For the prepared family case, enter `seed-family` in the launcher's terminal
**before opening the browser or signing in**. Wait for `seeded`. The household
is **TestHousehold**, with Molnmusik, people, accounts, addresses, payment
roles, a private draft and a concurrent Lo-name conflict. This is the same
synthetic setup as the browser test. The command refuses any database with an
existing user; it never resets your current work. Use a new launcher for a
different case.

Open the exact printed `http://127.0.0.1:PORT` origin in a new private browser
window. Sign in with Google as the controlled **Alex Exempel**. The prepared
family case opens its existing household. Otherwise, create **Talprov** through
the normal form. Use only invented information.

If the selected case begins without consent or an ongoing conversation, stop
preparation here and use that case's first start action. If it begins with text
and microphone off, start only the text conversation below. Otherwise:

Choose **Skriv till Skyttel → Nytt samtal** from the map tools and select
**Godkänn och starta** in the consent box. Then choose **Prata med Skyttel** in
the map tools to turn the microphone on. The fixture needs no hardware
microphone permission. Keep the tab open and active: its normal status requests
maintain the server's voice connection. Closing the tab is a connection-loss
check, not a pause.

### Conversation availability and task failure

`available off` makes the conversation unavailable without replacing the
household or the held task. `available on` restores it. The normal availability
check updates the notice within five seconds. `fail REQUEST` rejects a held
Terra request and shows the task-failure notice. These commands change only the
disposable fixture; they do not configure a production installation.

### Transcript fragments and delegation

Commands below go into the launcher's terminal, not a shell. Start exactly one
voice session at a time. To simulate a request, enter these separate lines:

```text
user Läs vilka typer hushållet har.
delegate
```

`user` sends one input-transcript fragment. It does not claim that a pause or
fragment is a complete instruction. `delegate` sends a separate metadata-only
delegation event with a new ID. The application builds the current task from the
fragments and prior bounded context, then calls the shared text backend.

A `held` event identifies each stopped Terra request with a numeric `id` and
shows its synthetic context, draft versions, latest tool result and tool names.
If request `1` is held, enter:

```text
tool 1 read_type_catalog {}
```

The actual MCP client reads the catalog. The next `held` event has a new ID; its
`lastToolResult` contains the actual types. If that ID is `2`, finish with:

```text
reply 2 Typkatalogen är läst. Inget har sparats.
sessions
```

`sessions` shows active provider IDs and the commentary events sent by Skyttel.
Completion must refer to the originating delegation ID. Commentary submission is
not proof of audible speech; this fixture has no speech output. For proposals
and saves, check the browser's whole draft, actual MCP results and durable
receipts. Follow the manual case's exact tool arguments, using IDs and versions
from the held request. The launcher does not repair stale arguments.

### Terminal controls

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `seed-family` | Prepare the synthetic family map and conflict before the first sign-in; refuses a nonempty installation. |
| `user TEXT` | Add a synthetic user transcript fragment; a new fragment can interrupt older backend work. |
| `assistant TEXT` | Add prior synthetic assistant speech as context; it grants no save authority. |
| `delegate` | Send a new metadata-only delegation for the accumulated user fragments. |
| `pending` | Inspect held Terra requests and their original synthetic context. |
| `tool REQUEST TOOL JSON` | Release one model tool call through the actual MCP entry point. |
| `reply REQUEST TEXT` | Release a final model reply; it cannot manufacture a durable receipt. |
| `fail REQUEST` | Fail that held Terra request at the external provider boundary. |
| `usage SECONDS` | Send cumulative Live usage, not an increment. |
| `final SECONDS` | Send a matching final Live closure event with total seconds. |
| `finalize off` | Withhold the final provider event when Skyttel requests closure. |
| `finalize on` | Restore final closure events for subsequent stops. |
| `drop` | Drop the controlled server-side provider connection. |
| `sessions` | Inspect current provider IDs and submitted commentary/close events. |
| `voice-failure startup` | Reject new Live sessions with a temporary provider failure; exercises the short startup notice and diagnostic log. |
| `voice-failure administration` | Reject new Live sessions with an authentication failure; exercises the administrator notice and diagnostic log. |
| `voice-failure off` | Restore successful provider startup for retries. |
| `restart` | Reject held responses and restart with the same temporary database and origin. |
| `quit` | Stop the application and remove the temporary database. |
<!-- markdownlint-enable MD013 -->

For a delayed response, leave a request held while the case changes or discards
the draft, cancels work, stops voice or supplies a correction. Release the old
request afterward with its original ID and arguments. The SDK may ignore an
aborted request entirely. The browser and persisted draft/receipt determine the
result; a terminal `released` event alone proves no application change.

To check incomplete final usage, send `usage 12`, then `usage 15`, then
`finalize off`. Stop voice in the browser. The last known total is 15, not 27,
and the final provider value is unknown. In the browser Network panel, the voice
`stop` response exposes `voice.seconds: 15` and `voice.usageFinal: false`.
Restore `finalize on` before the next session. These synthetic values do not
prove provider billing or any actual charge.

For restart recovery, enter `restart` and wait for `restarted`. Reload the
page, approve a fresh assistant connection and inspect the persistent draft and
previous save attempts. Conversation and voice resources do not survive;
committed map changes and durable receipts do. The controlled recovery case
prepares a pending attempt and separately interrupts an already confirmed save.
It does not hide a post-commit reply; record that distinction in its result.

### Browser transport and audio controls

Open this fixture's browser developer console. These controls exist only in the
disposable fixture and change the external browser media substitute. They do not
change production settings or the application's access rules.

Before choosing **Prata med Skyttel**, simulate denied microphone access:

```js
window.skyttelVoiceFixture.setMicrophone('deny');
```

After checking the visible error and working forms, set it back to `allow` and
start again. Use `error` instead of `deny` for a missing-device failure. To
simulate blocked audio playback, set this before starting voice:

```js
window.skyttelVoiceFixture.setPlayback('blocked');
```

Require the visible playback message and **Starta ljudet** button. Set playback
to `allow`, then press that button; the playback conversation notice should
clear. No sound is produced. `setSound('microphone', true, 0.8)` and
`setSound('remote', true)` simulate a loud user and Skyttel talking, and `false`
ends either sound. During an active session, the following console command
simulates a broken native connection:

```js
window.skyttelVoiceFixture.disconnect();
```

Use `reconnect()` within three seconds for a transient interruption. Leave it
disconnected for the application's timeout, or use `fail()` for immediate
failure. `audioError()` emits a media-output error. A transient recovery keeps
the microphone off until another explicit press. Blocked playback keeps capture
off until **Starta ljudet** succeeds. Microphone-off keeps the connection alive
for delayed answers. Open **Din profil → Inloggningssätt**, expand
**Välj inställning** if needed and choose **Logga ut** to close and release all
resources. Then inspect:

```js
window.skyttelVoiceFixture.stats();
```

Require `openPeers: 0`, `audioElements: 0`, and `state: 'ended'` for every
microphone and remote track. A disconnected connection must disable its
microphone track while waiting. These are actual silent browser media tracks,
not evidence that a physical microphone or speaker works. Reloading resets all
substitute controls; a new voice session follows normal application rules.

### Cleanup

Turn the microphone off, then type `quit` in the launcher terminal, or press
Ctrl+C. Wait for `closed`, which prints the removed directory. From another
terminal, set the variable to the exact directory printed by this launcher's
`ready` event:

```sh
SKYTTEL_VOICE_CASE_DIR='/tmp/skyttel-test-REPLACE-WITH-PRINTED-DIRECTORY'
test ! -e "${SKYTTEL_VOICE_CASE_DIR:?}" && printf '%s\n' 'Fixture removed'
unset SKYTTEL_VOICE_CASE_DIR
```

Close the private browser window and remove its port forward. If the process is
forcibly killed, stop any remaining process before removing only its printed
temporary directory. Each new launcher starts empty. Do not publish terminal
recordings: the intentionally visible fixture context is synthetic household
content. Never use this launcher with real household information.

## Separata röstkonfigurationer

### TAL-19: Avbryt bevarar långt samtal med mikrofonen av

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. I steg 2, slå av mikrofonen medan
Skyttel arbetar och före Avbryt. Utför inte den påslagna varianten först.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-19.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-19"
  },
  "reference": "Chromium; mikrofon av före Avbryt, sju långa turer och samma sena förslag.",
  "outcomes": [
    "Mikrofonen förblir av även efter ny anslutning och sent förslag.",
    "Alla sju turer, fortsatt fråga och hela Lo-förslaget bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [TAL-18](#tal-18-avbryt-bevarar-ett-långt-samtal-med-mikrofonen-på) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Mikrofonen förblir av även efter ny anslutning och sent förslag.
- Alla sju turer, fortsatt fråga och hela Lo-förslaget bevaras.

### TAL-20: röstrutans fria plats på dator

**Syfte:** Behålla åtkomliga verktyg och kartåterkoppling medan röstrutan växer.

**Användare:** Alex.

**Förutsättningar:** Ny kontrollerad installation, Lo Exempel i utkastet, 1280 ×
800 före första UI-handlingen.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-20.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-20"
  },
  "reference": "Chromium 1280 × 800; kontrollerat lyssnande och väntande röstuppdrag.",
  "outcomes": [
    "Röstrutan, arbetsverktygen och kartåterkopplingen täcker inte varandra.",
    "Längre statusord behåller en fri, synlig plats och åtkomlig stoppknapp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta Prata med Skyttel. Öppna Navigera, panorera höger, stäng navigeringen
   och välj Återställ vy.
2. Läs röstrutan, verktygsraden och kartåterkopplingen. Kontrollera att inget
   täcks och att sidan inte behöver rullas i sidled. På dator: växla Tabell och
   Karta, öppna textvyn, visa utkastet, stäng textvyn och läs den fria platsen
   vid varje steg.
3. Låt ett kontrollerat Beskriv utkastet-uppdrag vänta enligt tidslinje TAL-14.
   Läs Skyttel arbetar och nå Avbryt utan att den bredare röstrutan täcker andra
   kontroller.

**Förväntat resultat:**

- Röstrutan, arbetsverktygen och kartåterkopplingen täcker inte varandra.
- Längre statusord behåller en fri, synlig plats och åtkomlig stoppknapp.

### TAL-21: röstrutans fria plats på bred skärm

**Syfte:** Behålla åtkomliga verktyg och kartåterkoppling medan röstrutan växer.

**Användare:** Alex.

**Förutsättningar:** Ny kontrollerad installation, Lo Exempel i utkastet, 820 ×
1180 före första UI-handlingen.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-21.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-21"
  },
  "reference": "Chromium 820 × 1180; kontrollerat lyssnande och väntande röstuppdrag.",
  "outcomes": [
    "Röstrutan, arbetsverktygen och kartåterkopplingen täcker inte varandra.",
    "Längre statusord behåller en fri, synlig plats och åtkomlig stoppknapp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta Prata med Skyttel. Öppna Navigera, panorera höger, stäng navigeringen
   och välj Återställ vy.
2. Läs röstrutan, verktygsraden och kartåterkopplingen. Kontrollera att inget
   täcks och att sidan inte behöver rullas i sidled.
3. Låt ett kontrollerat Beskriv utkastet-uppdrag vänta enligt tidslinje TAL-14.
   Läs Skyttel arbetar och nå Avbryt utan att den bredare röstrutan täcker andra
   kontroller.

**Förväntat resultat:**

- Röstrutan, arbetsverktygen och kartåterkopplingen täcker inte varandra.
- Längre statusord behåller en fri, synlig plats och åtkomlig stoppknapp.

### TAL-22: röstrutans fria plats på smal skärm

**Syfte:** Behålla åtkomliga verktyg och kartåterkoppling medan röstrutan växer.

**Användare:** Alex.

**Förutsättningar:** Ny kontrollerad installation, Lo Exempel i utkastet, 390 ×
844 före första UI-handlingen.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), TAL-22.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-box.spec.ts",
    "caseId": "TAL-22"
  },
  "reference": "Chromium 390 × 844; kontrollerat lyssnande och väntande röstuppdrag.",
  "outcomes": [
    "Röstrutan, arbetsverktygen och kartåterkopplingen täcker inte varandra.",
    "Längre statusord behåller en fri, synlig plats och åtkomlig stoppknapp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta Prata med Skyttel. Öppna Navigera, panorera höger, stäng navigeringen
   och välj Återställ vy.
2. Läs röstrutan, verktygsraden och kartåterkopplingen. Kontrollera att inget
   täcks och att sidan inte behöver rullas i sidled.
3. Låt ett kontrollerat Beskriv utkastet-uppdrag vänta enligt tidslinje TAL-14.
   Läs Skyttel arbetar och nå Avbryt utan att den bredare röstrutan täcker andra
   kontroller.

**Förväntat resultat:**

- Röstrutan, arbetsverktygen och kartåterkopplingen täcker inte varandra.
- Längre statusord behåller en fri, synlig plats och åtkomlig stoppknapp.

### TAL-23: verkligt svenskt tal genom familjeärendet

**Syfte:** Hör och bedöm ett riktigt svenskt familjeärende, rättelser,
fullständigt sparande och fortsatt formulärarbete.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör och bedöm ett riktigt svenskt
familjeärende, rättelser, fullständigt sparande och fortsatt formulärarbete.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Hör och bedöm ett riktigt svenskt familjeärende, rättelser, fullständigt sparande och fortsatt formulärarbete."
  },
  "reference": "Verklig Live/Terra med separat uttryckligt medgivande till avgiftsbelagda anrop och påhittade data.",
  "outcomes": [
    "Faktiskt hört och utfört familjearbete bevarar konton, adresser, ekonomiska värden och roller.",
    "Bara den faktiskt provade utrustningen och leverantörskörningen redovisas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ det verkliga talflödet i den separata tidslinjen nedan, med riktig
   mikrofon, högtalare och konfigurerad testidentitet.
2. Beskriv hushållets tjänst, konto, adresser, roller, pris och skilda
   kunskapsstatusar; svara och rätta muntligt. Läs sedan fullständigt utkast,
   karta och kvitto.
3. Anteckna faktisk talförståelse, mikrofonavslag, ljuduppspelning och
   kvarvarande oskickad formulärtext separat från syntetiska prov.

**Förväntat resultat:**

- Faktiskt hört och utfört familjearbete bevarar konton, adresser, ekonomiska
  värden och roller.
- Bara den faktiskt provade utrustningen och leverantörskörningen redovisas.

**Separat verklig taltidslinje:**

1. Följ
   [förberedelsen i TAL-17](#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
   i en ny isolerad installation med påhittade data. Skapa Talprov och lägg Lo
   Exempel, typ Person, med beskrivningen Påhittad uppgift i utkastet.
   Kontrollera att mikrofonen inte används före **Prata med Skyttel**. Välj
   knappen, **Godkänn och starta** och tillåt mikrofonen. Om ljud blockeras,
   välj **Starta ljudet**. Öppna sedan **Tabell → Redigera Lo Exempel** och
   skriv **Osänd text som ska finnas kvar** i beskrivningen utan att lägga den i
   utkastet. Låt mikrofonen fortsätta.
2. Beskriv familjens Molnmusik med rösten: separat tjänstekonto, kontaktadress
   och inloggningsadress, Alex som avtalspart, Kim som betalare och ett kort som
   betalningsmedel. Lo använder tjänsten. Ange 149 kr per månad.
3. Svara muntligt på frågor, även med korta svar och rättelser. Ange ett
   bankkonto uttryckligen som ospecificerat. Lämna en uppgift okänd och en annan
   osäkert uppgiven. Be om en sammanställning av hela utkastet.
4. Kontrollera att det tidigare Lo-förslaget ingår. Konto och e-postadress ska
   förbli olika objekt. Säg en rättelse av inloggningsadressen.
5. Säg **Rätta priset till 189 kr och spara**. Inget tangentbord behövs för
   kartarbetet efter röststart.
6. Kontrollera först formulärets oskickade text. Tryck Escape, välj
   **Fortsätt redigera** och läs den igen. Lämna sedan uttryckligen med
   **Kasta ändringarna och fortsätt**. Öppna **Rapporter → Ändringshistorik** och
   återläs roller, pris
   och kunskapsstatus. Välj **Tillbaka till arbetet**, stäng av mikrofonen och
   fortsätt med ett normalt formulär.
7. Anteckna den faktiskt provade enheten, mikrofonen och ljudutgången. Chrome på
   Windows, macOS, iPhone och iPad med riktiga mikrofoner och hjälpmedel ingår i
   den kvarstående mänskliga kontrollen i
   [#220](https://github.com/viscalyx/skyttel/issues/220). Redovisa varje
   kombination separat, inklusive mikrofonavslag och ljuduppspelning.

### TAL-24: riktig skärmläsare och tal samtidigt

**Separat förberedelse för statussekvensen:** Använd först en ny
[kontrollerad installation](#controlled-voice-fixture) på dator med riktig
NVDA/Chrome eller VoiceOver/Chrome. Lägg Lo Exempel, Person och **Påhittad
uppgift** i utkastet utan att starta samtalet. En operatör följer
[TAL-16:s tidslinje](voice-controls-preparation.md#tidslinje-tal-16) vid steg
1–7 nedan, särskilt aktivering utan fokusflytt i steg 2. Mediaersättningen
är tyst; människan lyssnar på den riktiga skärmläsarens statusbesked.

**Syfte:** Hör statusord och samtalstext en gång, och bedöm om skärmläsarens
röst tas upp som nytt tal.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör statusord och samtalstext en gång, och
bedöm om skärmläsarens röst tas upp som nytt tal.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör knappens eget läge med fokus på knappen utan extra status; Lyssnar en gång med fokus på Återställ vy; inget Du talar, upprepat Lyssnar eller Skyttel talar; Skyttel arbetar och Mikrofonen är av i tur. Bedöm dessutom samspel med verkligt tal separat."
  },
  "reference": "Kontrollerad fokus-/aktivitetsekvens med riktig NVDA/Chrome Windows eller VoiceOver/Chrome macOS; separat TAL-17 med verklig röst, även iPhone/iPad.",
  "outcomes": [
    "Beskeden hörs i rätt tur utan upprepning eller oavsiktligt nytt tal.",
    "De faktiskt provade hjälpmedlens namn, lägen och fokus redovisas."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/voice-box.spec.ts",
      "caseId": "TAL-16",
      "purpose": "Samma fokuserade och ofokuserade aktivitet, statusförekomst och tangentordning; DOM-underlag hör inte skärmläsaren."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta **Prata med Skyttel → Godkänn och starta**. Slå av med fokus kvar
   på samma knapp. Hör knappens eget läge, utan extra statusuppläsning.
2. Slå på mikrofonen och flytta fokus till **Återställ vy** innan
   uppläsningen börjar. Hör **Lyssnar** exakt en gång. Den separata
   tidslinjen erbjuder också aktivering av samma knapp utan fokusflytt;
   granska faktiskt hört resultat med skärmläsaren, inte bara DOM-status.
3. Låt förberedelsen ge egen aktivitet och sedan tystnad. Läs **Du talar**
   och åter **Lyssnar** i rutan, men hör inget **Du talar** och inget nytt
   **Lyssnar**.
4. Låt **Beskriv utkastet.** vänta. Hör **Skyttel arbetar**. Låt svaret och
   inkommande aktivitet börja; hör inget statusbesked **Skyttel talar**.
   Stoppknappen heter **Avbryt**.
5. Tabba från **Prata med Skyttel** till **Skriv till Skyttel**, **Avbryt**
   och **Utkast**. Hör namnen i samma ordning. Röstrutan är gruppen
   **Röstruta**; vågformen läses inte.
6. Slå av mikrofonen, flytta fokus till **Återställ vy** och låt den
   inkommande aktiviteten upphöra. När rutan försvinner, hör **Mikrofonen
   är av**. Alla statusbesked väntar på sin tur; inga ljudsignaler hörs.
7. Slå på mikrofonen igen och öppna **Inställningar**. Låt inkommande
   aktivitet börja. Röstrutan står kvar i Inställningarnas statusrad och
   följer rösten där. Tabba till **Avbryt**, tryck Retur och kontrollera fokus
   på **Tillbaka till kartan** när stoppknappen försvinner. Avsluta och
   städa den kontrollerade installationen enligt guiden.
8. Gör därefter det separata verkliga TAL-17 med hjälpmedlet aktiverat.
   Öppna och stäng textvyn, tala och stäng av mikrofonen under arbetet. Hör
   Skyttels svar och skärmläsarens status.
9. Bedöm läsordning vid nederkanten, återgångsfokus efter Avbryt och samspel
   mellan de två rösterna.

**Förväntat resultat:**

- Beskeden hörs i rätt tur utan upprepning eller oavsiktligt nytt tal.
- Den exakta statussekvensen i steg 1–7 bedöms med verklig skärmläsare:
  särskilt tystnaden vid knappfokus, Du talar, återkommande Lyssnar och
  Skyttel talar. Syntetisk media och DOM bevisar inte den hörda observationen.
- De faktiskt provade hjälpmedlens namn, lägen och fokus redovisas.

### TAL-25: verklig mikrofonbehörighet och användningsindikator

**Syfte:** Bedöm operativsystemets och webbläsarens riktiga mikrofonprompt,
återkallad behörighet och användningsindikator.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Bedöm operativsystemets och webbläsarens
riktiga mikrofonprompt, återkallad behörighet och användningsindikator.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "os-permission",
    "observation": "Bedöm operativsystemets och webbläsarens riktiga mikrofonprompt, återkallad behörighet och användningsindikator."
  },
  "reference": "Fysiska mikrofoner och stödplattformarnas egna behörighetskontroller.",
  "outcomes": [
    "Behörigheten och faktiskt fångat ljud skiljs från en tyst men levande anslutning.",
    "Avslag och återkallande lämnar text/formulär användbara utan att en dold mikrofonstart uppstår."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Börja utan mikrofonbehörighet. Starta Prata med Skyttel, neka och läs nästa
   möjliga handling.
2. Tillåt enligt webbläsarens riktiga inställningar och starta uttryckligen
   igen. Säg **Lo Exempel finns i vårt provhushåll.**, slå av och säg
   **Det här ska inte spelas in.** efter avslag.
3. Bedöm indikatorn och vad som faktiskt når samtalet. Logga ut, kontrollera att
   resurserna frigörs och återställ behörigheten.

**Förväntat resultat:**

- Behörigheten och faktiskt fångat ljud skiljs från en tyst men levande
  anslutning.
- Avslag och återkallande lämnar text/formulär användbara utan att en dold
  mikrofonstart uppstår.

### TAL-26: verkligt röststopp vid inloggningens tidsgräns

**Syfte:** Bedöm att verklig mikrofon och ljudöverföring stannar när
inloggningen går ut och att beskedet kan uppfattas med hjälpmedel.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
med enbart påhittade uppgifter. Verkliga leverantörsanrop kräver separat
godkännande. Anteckna serverns bekräftade inloggningstid. Gör provet vid
åttatimmarsgränsen för vanlig inloggning, med aktuell tillgång och
medgivande. Håll sessionen aktiv med verkliga handlingar före provet.
Ändra inte enhetens klocka. Bevara ett förslag i utkastet före provet.

**Kräver mänsklig observation:** Kontrollera enhetens faktiska
mikrofonindikator och ljud, samt hör beskedet med riktig skärmläsare.
Syntetisk serverkontroll bevisar inte att mikrofonen fysiskt stannar eller
att skärmläsaren läser beskedet korrekt.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Kontrollera riktig mikrofonindikator, upphört ljud och skärmläsarens besked vid serverns inloggningsgräns."
  },
  "reference": "Fysisk mikrofon och ljudutgång med NVDA/Chrome eller VoiceOver; vanlig inloggning vid åttatimmarsgränsen, vid 1280, 390 och 320 pixlar.",
  "outcomes": [
    "Rösten stannar och utgångsbeskedet finns kvar vid ny inloggning utan att fokus flyttas av beskedet.",
    "Avvisat tal startar inte automatiskt efter ny inloggning och tidigare lagrat utkast finns kvar."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-expiry-http.test.ts",
      "title": "Live stops at the exact server deadline without a poll and rejects late fragments",
      "purpose": "Verklig HTTP-installation med syntetisk Live provar exakt servertid, ofullständigt tal och avvisad sen fortsättning utan pollning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-expiry-http.test.ts",
      "title": "a committed save receipt survives a late negation, fresh login and restart without replay",
      "purpose": "Ett faktiskt genomfört sparande och dess kvitto finns kvar efter sen negation, ny inloggning och omstart; avbrottet innebär ingen ångring."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta **Prata med Skyttel** strax före den bekräftade tidsgränsen.
   Öppna textvyn i en variant och håll den stängd i en annan.
2. Börja en ofullständig instruktion nära gränsen, utan att begära ett
   verkligt sparande. Fortsätt tala när gränsen passeras. Kontrollera
   mikrofonindikatorn och att inget nytt uppdrag fortsätter efter gränsen.
3. Läs och hör **Din inloggning har gått ut. Logga in igen.** samt
   instruktionen att lämna hela instruktionen på nytt. Kontrollera att
   beskedet finns kvar vid inloggningen, kan läsas vid förstoring och
   inte flyttar fokus. Anteckna faktiskt hörd uppläsning och eventuella
   upprepningar.
4. Logga in igen. Kontrollera ditt tidigare utkast och att det avvisade
   talet inte skickas igen. Starta ett nytt samtal och lämna hela
   instruktionen först när du själv vill fortsätta.

**Förväntat resultat:**

- Mikrofon och röst stannar; inga ofullständiga ord blir ett nytt uppdrag.
- Utgång och behovet av en hel ny instruktion går att uppfatta utan ljud.
- Tidigare lagrat utkast och genomförda sparanden finns kvar. Avbrottet
  betyder inte att ett redan genomfört sparande görs ogjort.
- Anteckna release, miljö, enhet, bredd, hjälpmedel och faktiskt utfall.
  Detta fall är inte genomfört genom att serverunderlaget passerar.

# Manuella testfall för samtalsnotiser

Fallen provar korta besked om bruten kontakt, otillgängliga samtal och
uppdrag som Skyttel inte kan slutföra. De omfattar knappar, textinmatning,
mikrofon, placering, uppläsning och fokus. Kartans återkoppling om det
privata utkastet och sparandet ska finnas kvar.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex Exempel är administratör i provhushållet. Alex loggar in med Google
i den kontrollerade miljön. Samma samtalsknappar och notiser gäller för
vanliga medlemmar; inga administrativa rättigheter används av samtalet.

## Allmän förberedelse

1. Starta en ny installation enligt
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Använd bara påhittade uppgifter. Skapa ett hushåll och lägg **Lo Exempel**
   i ditt privata utkast genom **Lista → Nytt objekt**. Spara inte.
2. Terminalkommandona nedan hör till startguiden. `available off` gör
   samtalet otillgängligt, och `available on` återställer tillgängligheten.
   Vänta upp till fem sekunder på beskedet. Skicka ett skrivet uppdrag och
   kör `fail REQUEST` med det aktuella `held`-anropets ID för uppdragsfel.
   `reply REQUEST Hej.` ger ett nytt kontrollerat svar.
3. Använd webbläsarens nätverksläge **Offline** för kontaktavbrott, och
   återställ till normalt nätverk efter varje fall. Börja en ny provmiljö
   inför NOT-01, NOT-02 och NOT-06. Behåll samma flik under respektive fall.
4. Miljön använder riktig server och tillfällig SQLite men ersätter externa
   leverantörer, mikrofon och ljudtransport. Den verifierar inte verklig
   mikrofonbehörighet, tal eller fysisk nätverksåterhämtning.

## Knappar och inmatning

### NOT-01: avstängda knappar visar notisen utan att öppna textvyn

**Syfte:** Förklara hindret först efter användarens tryck, utan att starta
samtalet eller flytta fokus när notisen visas.

**Användare:** Alex.

**Förutsättningar:** Ny flik utan samtal. Kör `available off` före starten.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallet “NOT-01: utan samtal visar avstängda samtalsknappar en stängbar
notis utan att öppna textvyn”.

**Steg:**

1. Läs kartan utan att trycka på samtalsknapparna.
2. Fokusera **Prata med Skyttel** och tryck Retur. Läs notisen.
3. Välj **Stäng notisen**. Fokusera **Skriv till Skyttel** och tryck Retur.
4. Stäng notisen igen. Läs utkastets återkoppling och övriga verktyg.

**Förväntat resultat:**

- Ingen notis visas före första trycket. Båda knapparna ser avstängda ut
  men går att trycka på. Hjälpmedel märker dem inte som inaktiverade;
  beskrivningen slutar med **Inte tillgängligt just nu.**
- Texten är **Samtal med Skyttel är inte tillgängligt just nu. Kontakta
  administratören om det fortsätter.** Symbolen är en överstruken cirkel
  och dold för hjälpmedel. Textvyn och medgivanderutan öppnas inte.
- Fokus stannar på den valda knappen när notisen visas. Stängning återför
  fokus till **Prata med Skyttel** och läser inte upp ett återkomstbesked.
- **Aktuell status** och **Visa samtals- och utkastdetaljer** finns inte.
  **1 förslag · privat utkast** finns kvar i kartans återkoppling.

### NOT-02: kontaktavbrott stoppar inmatning men behåller skrivande

**Syfte:** Stoppa mikrofon och sändning på riktigt medan texten går att
skriva och läsa. Återkomst får inte slå på mikrofonen.

**Användare:** Alex.

**Förutsättningar:** Ny flik, normalt nätverk och `available on`.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallet “NOT-02: bruten kontakt stoppar mikrofon och sändning medan
texten går att skriva och läsa”.

**Steg:**

1. Välj **Prata med Skyttel**, godkänn för besöket och invänta **Lyssnar**.
2. Sätt webbläsaren i **Offline**.
3. Välj **Skriv till Skyttel**. Skriv **Text som inte ska skickas än.**
   Tryck Retur och kontrollera **Skicka**.
4. Återställ nätverket. Skicka texten och släpp dess `held`-anrop med
   `reply REQUEST Hej.`. Slå därefter själv på mikrofonen.

**Förväntat resultat:**

- Mikrofonen stängs av vid avbrottet. Knappen ser avstängd ut men är
  tillgänglig för hjälpmedel; beskrivningen slutar med **Inte tillgängligt
  just nu.** Ett tryck visar hindret utan att börja lyssna.
  Notisen säger **Ingen kontakt med Skyttel. Mikrofonen är av. Slå på den
  igen när kontakten är tillbaka.** Den har ingen stängknapp.
- Textknappen fungerar. Samtalstexten går att läsa och meddelandefältet
  går att skriva i. Retur sänder inte texten; **Skicka** är inaktiverad.
- Notisen försvinner när kontakten återkommer. Hjälpmedel läser i tur
  **Kontakten med Skyttel är tillbaka.** Texten finns kvar att skicka,
  och mikrofonen är fortfarande av tills användaren slår på den.
- Automationen räknar sändningsanrop och modellanrop och kontrollerar
  mikrofonspårets avstängda läge. Ett manuellt prov med den kontrollerade
  mikrofonen ersätter inte ett prov med fysisk mikrofon och nätverk.

### NOT-03: flytt till textvyn upprepar inte uppläsningen

**Syfte:** Visa samma besked en gång och läsa upp det en gång även vid vybyte.

**Användare:** Alex.

**Förutsättningar:** Påslagen mikrofon och stängd textvy enligt NOT-02.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallet “NOT-03: en notis flyttas till textvyn utan ny uppläsning och
försvinner när kontakten återkommer”.

**Steg:**

1. Fokusera mikrofonknappen. Sätt nätverket i **Offline** och läs notisen.
2. Öppna textvyn med **Skriv till Skyttel**. Stäng den med **Stäng textvyn**.
3. Återställ nätverket.

**Förväntat resultat:**

- Kontakttexten läses upp med avbrytande uppläsning när avbrottet inträffar.
  Att notisen visas flyttar inte fokus.
- Med textvyn öppen finns notisen bara som en rad ovanför meddelandefältet.
  Med textvyn stängd finns den bara vid röstrutans plats. Vybytet läser
  inte upp samma besked igen.
- Återkomstbeskedet läses i tur. Ingen notis finns kvar efter återkomsten.

## Ordning, stängning och fokus

### NOT-04: bruten kontakt går före andra besked

**Syfte:** Visa en notis åt gången och låta kontaktavbrottet gå före
otillgängligt samtal och uppdragsfel.

**Användare:** Alex.

**Förutsättningar:** Textvy och normalt nätverk. Behåll samma samtal.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallet “NOT-04: bruten kontakt går före otillgängligt samtal och uppdragsfel”.

**Steg:**

1. Skicka **Ge ett förslag.** och kör `fail REQUEST` för dess hållna anrop.
2. Kör `available off`. Skriv **Oskickad text finns kvar.** utan att skicka.
3. Sätt nätverket i **Offline**, återställ det och kör `available on`.

**Förväntat resultat:**

- Först visas **Skyttel kunde inte slutföra uppdraget. Försök igen.**
  Otillgängligt samtal ersätter sedan detta besked och inaktiverar Skicka.
- Kontaktavbrottet ersätter otillgängligheten. Bara en notis visas.
- Efter återkomst syns otillgängligheten igen, tills `available on`
  återställer samtalet. Uppdragsfelet syns då igen och texten finns kvar.
  Återkomsten till tillgängligt samtal läses upp i tur.

### NOT-05: uppdragsfel försvinner vid stängning eller nytt försök

**Syfte:** Ge ett stängbart besked och bevara logiskt fokus.

**Användare:** Alex.

**Förutsättningar:** Textvy, normalt nätverk och tillgängligt samtal.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallet “NOT-05: uppdragsfelet kan stängas eller försvinna vid nästa
försök och fokus stannar logiskt”.

**Steg:**

1. Skicka ett uppdrag och kör `fail REQUEST`. Kontrollera fältets fokus.
2. Välj **Stäng notisen** med tangentbord.
3. Skicka ett nytt uppdrag och låt även detta misslyckas med `fail REQUEST`.
4. Skicka **Ett nytt försök.** Håll svaret och släpp sedan
   `reply REQUEST Ett nytt svar.`.

**Förväntat resultat:**

- Notisen visar en varningstriangel och texten **Skyttel kunde inte
  slutföra uppdraget. Försök igen.** Texten läses i tur. Fältet behåller
  fokus när notisen visas.
- Stängning återför fokus till **Prata med Skyttel**. Det andra felet
  ger ett nytt stängbart besked.
- Det tredje försöket tar bort notisen redan medan svaret väntar.
  Det nya svaret står sedan i samtalstexten. Utkastet finns kvar.

### NOT-06: ett avslutat hinder kräver ett nytt tryck vid nästa avbrott

**Syfte:** Skilja automatisk återkomst från stängning utan pågående samtal.

**Användare:** Alex.

**Förutsättningar:** Ny flik utan samtal, normalt nätverk och `available on`.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallet “NOT-06: en stängbar kontakt-notis försvinner automatiskt och
nästa avbrott väntar på ett nytt tryck”.

**Steg:**

1. Sätt nätverket i **Offline**. Välj **Skriv till Skyttel**.
2. Fokusera **Stäng notisen** utan att trycka och återställ nätverket.
3. Bryt nätverket igen. Tryck **Prata med Skyttel** och stäng notisen.
4. Återställ nätverket igen.

**Förväntat resultat:**

- Varje avbrott väntar på ett nytt tryck innan en notis visas. Textvyn
  öppnas inte. Texten är **Ingen kontakt med Skyttel. Försök igen när
  kontakten är tillbaka.** och notisen har en stängknapp.
- Automatisk återkomst tar bort notisen, återför fokus från stängknappen
  till **Prata med Skyttel** och läser i tur upp återkomstbeskedet.
- Manuell stängning ger inget återkomstbesked, inte heller när det redan
  stängda hindret senare upphör.

## Plats och tangentordning

### NOT-07: en kontakt-notis täcker inte kartans återkoppling

**Syfte:** Bevara kartans rad med Återställ vy och gemensam återkoppling.

**Användare:** Alex.

**Förutsättningar:** Påslagen mikrofon och stängd textvy. Prova dator,
telefonbred skärm och kort liggande fönster. I korta fönster öppnas
**Visningsval** före kontrollen av **Återställ vy**.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallen “NOT-07: notisen har sin plats och täcker inte kartans
återkoppling vid 1280 × 900”, “NOT-07: notisen har sin plats och täcker
inte kartans återkoppling vid 700 × 900”, “NOT-07: notisen har sin plats
och täcker inte kartans återkoppling vid 390 × 844” och “NOT-07: notisen
har sin plats och täcker inte kartans återkoppling vid 667 × 375”.

**Steg:**

1. Bryt och återställ kontakten genom webbläsarens nätverksläge.
2. Läs notisen, utkastets återkoppling och kartans rad med **Återställ vy**.

**Förväntat resultat:**

- Med röstrutan borta finns kortet på rutans plats. På smal skärm står
  det över hela bredden, ovanför återkopplingen och kartans nederkant.
- Notisen täcker varken **Återställ vy** eller utkastets återkoppling.
  Inget måste rullas i sidled för att läsa notisen.
- Vid återkomst är mikrofonen av. Automationen bryter även ljudtransporten
  oberoende av HTTP och kontrollerar kortets geometri vid de fyra måtten.

### NOT-08: röstruta och uppdragsnotis har var sin plats

**Syfte:** Behålla placering och tangentordning när båda syns.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen på, normalt nätverk och textvyn öppen.
Prova dator, bred pekskärm och telefonbred skärm.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts),
testfallen “NOT-08: en uppdragsnotis står bredvid röstrutan utan att täcka
återkoppling vid 1280 × 900”, “NOT-08: en uppdragsnotis står bredvid
röstrutan utan att täcka återkoppling vid 820 × 1180” och “NOT-08: en
uppdragsnotis står bredvid röstrutan utan att täcka återkoppling vid 390 × 844”.

**Steg:**

1. Skicka **Ge ett förslag.** och kör `fail REQUEST`.
2. Stäng textvyn. Läs notisen, röstrutan och utkastets återkoppling.
3. Fokusera **Skriv till Skyttel** och tryck Tab. Tryck Retur på
   **Stäng notisen**.

**Förväntat resultat:**

- På bred skärm står notisen i ett eget kort under röstrutan. På smal
  skärm står kortet ovanför röstrutan, över hela bredden. Symbolen står
  till vänster, texten bredvid och stängknappen uppe till höger.
- Ingen överlappning döljer röstrutan eller återkopplingen. Tab går från
  textknappen till notisens stängknapp när ingen Avbryt-knapp finns.
- Stängning återför fokus till mikrofonknappen. Mikrofonen och
  **Lyssnar** finns kvar; att stänga ett felbesked avslutar inget samtal.

## Symboler och läsbarhet

### NOT-09: symbolfärg och läsbarhet skiljer hinder från händelse

**Syfte:** Skilja hinder från händelser med både form, färg och text.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen, normalt nätverk
och ljust tema. Textvyn har öppnats med medgivande och stängts igen.

**Integrationstest:**
[conversation-audit.spec.ts](../../tests/integration/conversation-audit.spec.ts),
testfallen “NOT-09: symbolfärg och läsbarhet skiljer hinder från händelse i
light tema” och samma titel med “dark tema”.

**Steg:**

1. Kör `available off`. Vänta på knappbeskrivningen **Inte tillgängligt
   just nu.** Tryck på mikrofonknappen och läs notisen.
2. Kör `available on` och vänta på att notisen försvinner.
3. I webbläsarens konsol, kör
   `window.skyttelVoiceFixture.setMicrophone('deny')`. Tryck på
   mikrofonknappen och läs notisen.
4. Upprepa i mörkt tema. Mät symbolens kontrast mot kortets bakgrund
   och textens kontrast med ett kontrastverktyg.

**Förväntat resultat:**

- Hindret har en överstruken cirkel; mikrofonhändelsen har en överstruken
  mikrofon. Symbolerna står till vänster om texten och har olika färg.
- Symbolerna har minst 3:1 kontrast, och texten minst 4,5:1, i båda teman.
  Automationen mäter de faktiskt beräknade färgerna på de ogenomskinliga
  korten. Den bedömer inte färgseende eller fysisk bildskärm.
- Symbolen är dold för hjälpmedel; text och namngivna kontroller bär
  beskedet. Båda fallen är stängbara när inget samtal pågår.

### NOT-10: ett väntande sparförsök visar frågesymbol och kontrollknapp

**Syfte:** Visa ett kontrollfel utan att ge en ny befogenhet att spara.

**Användare:** Alex.

**Förutsättningar:** Ett registrerat men inte genomfört sparförsök enligt
[SPAR-02](operations.md#spar-02-automatiskt-kontrollera-ett-väntande-sparande-från-en-annan-klient).
Prova 390 × 844 px och blockera `*/text-assistant/recover` i webbläsarens
nätverkspanel innan sidan laddas om.

**Integrationstest:**
[conversation-audit.spec.ts](../../tests/integration/conversation-audit.spec.ts),
testfallet “NOT-10: ett verkligt väntande sparförsök visar frågesymbol och
kontrollknapp under texten”.

**Steg:**

1. Ladda om och vänta på **Skyttel kunde inte kontrollera om utkastet
   sparades.** Om vägledningen visas, stäng den med tangentbordet.
   Läs symbolen, texten och kontrollknappen.
2. Kontrollera mikrofonens läge, det privata förslaget och sparförsöket.
3. Ta bort nätverksblockeringen. Välj **Kontrollera om utkastet sparades**.
   Följ resultatet enligt SPAR-02.

**Förväntat resultat:**

- Ett frågetecken i cirkel står till vänster. **Kontrollera om utkastet
  sparades** står under texten, med minst 44 px hög tryckyta. Ingen
  stängknapp finns, och kortet kräver ingen rullning i sidled.
- Mikrofonen är av. Förslaget är identiskt med det som registrerades;
  felet har varken sparat det eller kastat det.
- Kontrollen använder samma försöks-ID. Automationen använder en riktig
  registrering och avbryter bara kontrollsvaret till webbläsaren.

### NOT-11: varje situation har sin avtalade symbol och typfärg

**Syfte:** Granska alla former utan att bara jämföra interna SVG-sökvägar.

**Användare:** Alex.

**Förutsättningar:** Kör de länkade fallen i den kontrollerade miljön.
Prova både ljust och mörkt tema. Detta fall är enbart manuellt; ingen
mänsklig formbedömning redovisas som utförd.

**Integrationstest:** Inget. De länkade fallen automatiserar situationens
text, kontroller och beteende, inte människans igenkänning av symbolen.

**Steg:**

1. Utlös varje rad genom det angivna fallet. Läs först texten, jämför
   sedan den synliga symbolen med tabellen och anteckna resultat per rad.
2. Kontrollera att alla hinder har samma symbolfärg som hindret i NOT-09,
   och alla händelser samma färg som mikrofonhändelsen. Se också att
   formerna går att skilja åt utan färg.

**Förväntat resultat:**

<!-- markdownlint-disable MD013 -->
| Situation och körbart fall | Synlig symbol | Typfärg |
| --- | --- | --- |
| Kontroll pågår, SPARKONTROLL-01 | Frågetecken i cirkel | Hinder |
| Kontrollfel, NOT-10 | Frågetecken i cirkel | Hinder |
| Bruten kontakt, pågående samtal, NOT-02 | Överstruken kontaktsymbol | Hinder |
| Bruten kontakt, inget samtal, NOT-06 | Överstruken kontaktsymbol | Hinder |
| Samtal otillgängligt, NOT-01 | Överstruken cirkel | Hinder |
| Full kontext efter misslyckad sammanfattning, KONTEXT-10 | Mätare | Hinder |
| Nekad mikrofon, ROSTFEL-01 deny | Överstruken mikrofon | Händelse |
| Ingen mikrofon, ROSTFEL-01 error | Överstruken mikrofon | Händelse |
| Upptagen mikrofon, ROSTFEL-01 busy | Överstruken mikrofon | Händelse |
| Röststödet saknas, ROSTFEL-01 unsupported | Överstruken mikrofon | Händelse |
| Tillfälligt röstfel, ROSTFEL-02 startup | Varningstriangel | Händelse |
| Avbruten röst, ROSTFEL-03 | Överstruken mikrofon | Händelse |
| Administrationsfel, ROSTFEL-02 administration | Varningstriangel | Händelse |
| Återkallat medgivande, MEDGIVANDE-13 | Varningstriangel | Händelse |
| Misslyckat uppdrag, NOT-05 | Varningstriangel | Händelse |
| Stoppat ljud, ROSTFEL-04 | Överstruken högtalare | Hinder |
<!-- markdownlint-enable MD013 -->

Läs [kontrollfallen](save-check.md), [kontextfallen](conversation-context.md),
[röstfelen](voice-errors.md) och [medgivandefallen](conversation-consent.md)
för respektive förberedelse och utlösning. NOT-11 kompletterar deras
beteendekontroller med en uttrycklig granskning av form och typfärg.

## WCAG 2.2 AA: utformning och verifiering

Utformningen syftar till WCAG 2.2 AA. Automationen provar det ändrade
flödet genom gränssnittet mot riktig server och tillfällig SQLite.
Ingen manuell skärmläsar-, kontrast- eller fysisk enhetskontroll intygas.
Fullständig överensstämmelse för hela sidor och flöden är inte verifierad.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning och automatisk kontroll | Återstår manuellt |
| --- | --- | --- |
| 1.1.1, 1.3.1 Icke-textuellt innehåll och struktur | Symbolen är dold; text, namngiven notis och knappar bär beskedet. Automationen kontrollerar text och dold symbol. | Läsordning med NVDA och VoiceOver. |
| 1.4.1 Färg | Hinder och händelser har olika symbolfärg. De tre grundfallen har också skilda symbolformer och texter; en händelse har stängknapp. | Igenkänning utan färgseende. |
| 1.4.3, 1.4.11 Kontrast | NOT-09 mäter text minst 4,5:1 och symbol minst 3:1 på hinder- och händelsekort i båda teman. | Fysisk bildskärm, avstängda knappar, kanter och fokus i båda teman. |
| 1.4.4, 1.4.10 Förstoring och omflöde | Automatisk geometri vid fyra kontaktmått och tre samtidiga mått; inget dolt fält eller dold återkoppling. | Verklig zoom 200 och 400 procent samt långa texter i korta fönster. |
| 2.1.1, 2.4.3 Tangentbord och fokusordning | Tab och Retur stänger notisen. Visning flyttar inte fokus; borttagning återför det till mikrofonknappen. Automationen provar detta. | Hjälpmedlens kommandon och flytt av en fokuserad notis mellan vyer. |
| 2.4.7, 2.4.11 Synligt fokus | Fokusramen är kartans vanliga ram; kortet överlappar inte återkoppling eller kartans rad. | Synlig ram och fullständiga tangentbordsflöden på fysisk telefon. |
| 2.5.8 Pekmål | Stängknappen har 44 × 44 px. | Träffsäkerhet på fysisk pekskärm. |
| 3.3.1, 3.3.3 Felbeskrivning och förslag | Varje grundfel har begriplig text och nästa steg. Fältet behåller oskickad text, och sändning stoppas vid hinder. Automationen kontrollerar detta. | Att texterna förstås med hjälpmedel. |
| 4.1.2, 4.1.3 Namn, roll, värde och status | Avbrytande eller väntande uppläsning följer notisens situation. Flytt läser inte upp igen. Automatisk återkomst läses i tur; stängning ger inget återkomstbesked. | Faktisk uppläsning och tur i minst två skärmläsare. |
<!-- markdownlint-enable MD013 -->

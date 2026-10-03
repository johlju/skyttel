# Manuella testfall för objektlistor

Testfallen gäller att hitta och återfinna objekt genom typgrupper,
filtrering, sortering och sidval samt att visa en vald träff i kartan.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd **Alex Exempel** med tillgång till testhushållet. Provkartan och
inloggningen innehåller enbart påhittade uppgifter.

## Allmän förberedelse

1. Starta provkartan enligt [stora kartor](large-map.md#allmän-förberedelse).
   Den innehåller 500 objekt fördelade på fem typer och 1 500 samband.
2. Öppna **Lista**. Prova både dator och telefon. Använd tangentbord och
   pekning, ljust och mörkt tema samt webbläsarens förstoring.
3. Starta om provkartan mellan fallen. För kartfokus använder du ett litet
   testhushåll enligt förutsättningarna i LISTA-03.

## Sökning och filtrering

### LISTA-01: flera typval kombineras med sökning och markeringar

**Syfte:** Begränsa en stor lista utan att ändra objektmarkeringarna eller
hushållets uppgifter.

**Användare:** Alex Exempel.

**Förutsättningar:** Provkartan med 500 objekt är öppen i Lista.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallet
“LISTA-01: multiple type filters combine with search and marks across 500 objects”.

**Steg:**

1. Markera Provobjekt 000 och Provobjekt 001. Öppna **Filter** och kryssa
   i **Person** och **Tjänst**. Kontrollera 200 träffar.
2. Sök efter **sammanhang 0.**. Kontrollera tio träffar och fem vid vardera
   av provkartans typer. Välj **Bara markerade** och kontrollera två träffar.
3. Välj **Alla typer**. Kontrollera att typkryssen försvinner, men de två
   markeringarna och träffarna består. Stäng av **Bara markerade**.
4. Välj **Person** och **Visa 5 objekt**. Kontrollera stängt filter,
   synligt typval i filterraden och fokus i **Sökträffar**.
5. Sök efter **finns inte**. Läs det tomma resultatet och välj
   **Rensa sökning och filter**.

**Förväntat resultat:**

- Typval kombineras med eller; sökning och markeringsfilter begränsar vidare.
- Filter förblir öppet under val. Typgrupperna visar sina träffantal.
- Återställda filter ger 500 träffar och behåller båda markeringarna.
- Inga hushållsuppgifter eller personliga placeringar ändras.

## Återfinna en lista

### LISTA-02: sortering, sida och rulläge består vid tillfälliga besök

**Syfte:** Behålla orienteringen och oskickad redigering när listan lämnas.

**Användare:** Alex Exempel.

**Förutsättningar:** Provkartan med 500 objekt är öppen i Lista.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallet
“LISTA-02: sorting, pages and scroll survive details, settings and
map-result navigation”.

**Steg:**

1. Sök efter **Provobjekt**, välj typerna Person och Tjänst och stäng
   filtret med **Visa 200 objekt**.
2. Bläddra genom de fyra sidorna med båda sorteringarna. Kontrollera samma
   200 objekt. Lämna **Typ, sedan namn** och sida fyra valda.
3. Rulla till Provobjekt 496 och välj **Uppgifter**. Välj **Redigera valt
   objekt** och skriv **Oskickat under listbesöket** i Beskrivning.
4. Återgå till Lista med **Öppna paneler**. Kontrollera rulläget. Stäng
   listpanelen, öppna Lista igen och kontrollera samma sida och rulläge.
5. Besök Inställningar och välj **Tillbaka till kartan**. Kontrollera
   sökning, typval, sortering, sida och rulläge.
6. Välj Provobjekt 496:s namn för att visa det i kartan. Kontrollera att
   redigeringspanelen finns kvar med sin text. Öppna Lista igen.
7. Sök efter **Provobjekt 496**. Kontrollera en träff utan kvarvarande
   ogiltigt sidval.

**Förväntat resultat:**

- Sortering ändrar ordningen och sidornas fördelning, inte resultatmängden.
- Tillfälliga besök behåller listans val och rulläge samt oskickad text.
- Kartträffen stänger bara listan. Befintligt redigeringsarbete består.
- Sökning med färre träffar visar en giltig sida.

## Visa en träff i kartan

### LISTA-03: kartträffen fokuserar direkta grannar och behåller samtalet

**Syfte:** Skilja listans markering, kartvisning och uppgifter åt.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett testhushåll har Lo Exempel, Kim Exempel och
Långt borta. Lo har ett samband till Kim och Kim har ett till Långt borta.
Placera det sista objektet tydligt längre bort i den personliga vyn.
Textassistenten är tillgänglig med testmiljöns ersättare för modelltjänsten.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallet
“LISTA-03: a map result focuses only its direct neighbors and closes only the list”.

**Steg:**

1. Välj **Skriv till Skyttel** och **Godkänn och starta** i medgivanderutan.
   Skriv **Oskickat medan jag söker** utan att skicka.
2. Öppna Lista och markera både Lo och Kim. Sök efter **Lo Exempel**.
   Kontrollera att kameran behåller sitt läge medan du skriver.
3. Välj träffens namn för att visa Lo i kartan. Kontrollera att Lo och
   Kim ryms och att Långt borta inte utökar utsnittet.
4. Öppna Lista igen och kontrollera samma sökning med en träff.

**Förväntat resultat:**

- Lo blir ensam markerad, Kim avmarkeras och ingen detaljpanel öppnas.
- Endast listan stängs; samtalet och dess oskickade text finns kvar.
- Sökningen bevaras och hushållets data och personliga placeringar är orörda.

### LISTA-04: smal lista och uppgifter fungerar när grafiken avbryts

**Syfte:** Behålla ett tillgängligt listalternativ vid förlorad kartgrafik.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från LISTA-03. Prova vid 390 och 320 pixlars
bredd. Automatprovet använder webbläsarens riktiga WebGL-förlust; vid manuell
körning behövs en testmiljö där grafikavbrott kan framkallas.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallen
“LISTA-04: narrow lists retain search and accessible details after graphics
loss at 390px” och “LISTA-04: narrow lists retain search and accessible details
after graphics loss at 320px”.

**Steg:**

1. Öppna Lista, sök efter Lo Exempel och välj Person i Filter. Kontrollera
   tangentbordsfokus och att typvalet går att peka på.
2. Välj **Visa 1 objekt** och kontrollera resultatfokus. Välj Lo:s namn
   för att visa objektet i kartan. Kontrollera markering utan detaljpanel.
3. Öppna Lista igen och framkalla grafikavbrottet. Kontrollera att listan
   och sökningen består och att knappen för kartvisning blir inaktiv.
   Läs beskedet om att fortsätta genom **Uppgifter**.
4. Välj **Uppgifter**, kontrollera rubrikfokus och redigera Beskrivning
   till **Utan grafik**. Återgå till Lista genom panelväljaren.

**Förväntat resultat:**

- Namn, typval, resultat och uppgifter kan nås utan vågrät sidrullning.
- Grafikavbrottet stänger inte listan eller raderar markering och sökning.
- Uppgifter och oskickad redigering fungerar utan grafik. Hushållets data
  och personliga placeringar ändras inte genom listvalen.

### LISTA-05: återgång på kort skärm bevarar synlig träff och fokus

**Syfte:** Återgå till samma listarbete när hela arbetsytan behöver rullas.

**Användare:** Alex Exempel.

**Förutsättningar:** Testhushållet med 500 objekt. Prova en kort skärm
med 320 × 250 CSS-pixlar och verklig webbläsarzoom på 400 procent.

**Integrationstest:**
[object-list-flow.spec.ts](../../tests/integration/object-list-flow.spec.ts),
“LISTA-05: short-screen list returns preserve the visible result and keyboard focus”.

**Steg:**

1. Öppna Lista och rulla till **Provobjekt 045**. Fokusera **Uppgifter**
   och anteckna rulläget.
2. Öppna uppgifterna. Välj **Lista och utkast** i panelväljaren.
3. Kontrollera samma rulläge och synligt fokus på träffens **Uppgifter**.
4. Besök Inställningar och välj **Tillbaka till kartan**. Kontrollera
   samma rulläge och att den fokuserade kontrollen är synlig och går att peka på.
5. Fokusera träffens namn och anteckna dess rulläge. Välj namnet för att
   visa objektet i kartan. Öppna Lista igen.
6. Öppna verktygen och välj **Sök i kartan**. Kontrollera fokus i sökfältet.

**Förväntat resultat:**

- Listan återgår till samma rulläge efter varje besök.
- Fokus återgår till den använda träffkontrollen, synligt och åtkomligt
  utan att verktygen täcker den. Ett uttryckligt sök- eller detaljval
  behåller sitt eget fokusmål.
- Vanliga paneler och kartans särskilda visning behåller sina fokusregler.
  Inga fördröjda fokusbyten får flytta ett senare valt fält.

### LISTA-06: en synlig inaktiv lista öppnar uppgifter vid första klicket

**Syfte:** Kunna använda en listträff direkt när ett annat fönster är aktivt.

**Användare:** Alex Exempel.

**Förutsättningar:** Testhushållet med 500 objekt på en datorskärm där
Lista och en objektpanel kan visas samtidigt.

**Integrationstest:**
[object-list-flow.spec.ts](../../tests/integration/object-list-flow.spec.ts),
“LISTA-06: an inactive visible list opens details on the first pointer click
without moving the result”.

**Steg:**

1. Öppna Lista och välj **Uppgifter** vid **Provobjekt 000**. Låt
   objektpanelen vara aktiv medan listan syns bredvid.
2. Rulla listan till **Provobjekt 045** utan att först klicka i listan.
3. Tryck ned musknappen på träffens **Uppgifter**. Kontrollera att träffen
   stannar under pekaren när listan blir aktiv. Släpp musknappen.
4. Kontrollera rätt objektpanel och rubrikfokus utan ett extra klick.
5. Välj Lista och utkast i panelväljaren och kontrollera samma rulläge.

**Förväntat resultat:**

- Det första klicket öppnar rätt uppgifter. Listans rulläge och träffens
  position ändras inte medan musknappen hålls nere. En uttrycklig återgång
  till listan behåller rulläget.
- Hushållets objekt, samband och utkast ändras inte av att uppgifterna öppnas.

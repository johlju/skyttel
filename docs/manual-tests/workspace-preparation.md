# Kontrollerad förberedelse för arbetsyta och personlig vy

Använd bara en isolerad provinstallation och påhittade uppgifter. Console
är separat teknisk förberedelse; vanliga fall granskar synliga kontroller,
värden och fokus. Inga interna svarskoder behöver avläsas i UI-stegen.

## Fysiska enheter och egen provdata

Använd den vanliga separata HTTPS-provinstallationen med konfigurerad
providerinloggning och hushållstillgång enligt
[ingången för faktisk telefon och surfplatta](../development/testing.md#interactive-fixture-processes)
och [den publika HTTPS-ingången](../development/testing.md#delivery-controls-for-an-ordinary-https-test-installation).
Öppna samma HTTPS-adress på enheten, logga in som provanvändaren och
kontrollera hushållsnamnet före förberedelsen. Datorns syntetiska
loopback-launcher används bara på datorn där den körs. NVDA på den datorn
kan använda loopback; VoiceOver på en faktisk telefon använder HTTPS.

För KAMERA-10/11/12: skapa Lo Exempel, Kim Exempel, Alex Exempel och
Långt borta via **Nytt objekt**, med typen Person och tom beskrivning.
Öppna **Samband för Lo Exempel** och skapa **Använder** till Kim Exempel;
skapa motsvarande samband från Kim till Långt borta. Lägg alla förslag
i utkastet och välj **Spara hela utkastet** i **Visa utkastet**.
Placera sedan objekten via **Navigera → Ordna min vy** och de sex
flyttknapparna: sprid Lo, Kim och Alex i bildplan och höjd, med Lo utanför
mitten och Långt borta tydligt utanför gruppen. Vänta på sparad personlig
vy och ladda om. Kontrollera objekten, de två sambanden och tomt utkast.
Lägg sedan **Privat kameraförslag** som varje objekts föreslagna beskrivning
via **Redigera → Lägg i utkastet och stäng** utan samlat sparande. Redigera
båda sambanden via **Samband för** objektet, **Redigera samband** och
**Uppgiftens säkerhet → Osäkert uppgivet**. Välj **Lägg i utkastet** och
stäng sambandsdialogen. Kontrollera fyra objektförslag och två osäkra
sambandsförslag före kameragesterna; sparade objekt, samband och samtliga
privata förslag ska bestå genom kamerafallet.
Alla fingergester utförs på den faktiska enheten; zoomdelen utförs på
datorn med webbläsarens riktiga zoomkontroll.

För PLACERING-11/12: skapa Lampan och Cykeln med typen Person och tom
beskrivning genom samma vanliga formulär. Spara hela utkastet innan
fallet börjar. På telefonen: öppna **Karta** och kontrollera båda namnen;
personliga flyttar utförs på just den enheten. Ställ **Alla etiketter**
på av och **Inställningar → Rymdkartan → Visa bakgrund** på av
före toastprovet. Ladda om med tomt urval före fingerprovet.

För YTA-11/12 och INST-12/13: börja med ett tomt provhushåll och tomt
privat utkast. Skapa fallen **Familjens gemensamma cykel**,
**Kvar bakom profilen** och **Behåll mobiltexten** först i respektive
procedurs angivna formulärsteg. Privata förslag och oskickad text skapas
på nytt i den aktuella inloggade profilen; de överförs inte genom ett
sparat hushållsarkiv. Mellan delprocedurerna används ett nytt tomt
provhushåll i en separat provinstallation, så att ett föregående förslag
inte blir nästa falls startläge. Samtalsstart som kräver faktisk tjänst
körs och redovisas separat från dessa förberedelser.

Efter varje fall: återställ riktig zoom till 100 procent, släpp alla
fingrar, stäng öppna formulär genom deras uttryckliga förlustval och
stäng provprofilen. Avsluta den separata provinstallationen enligt dess
förberedelse och ta bara bort dess provdata. En omstart inne i ett
beständighetsprov behåller däremot samma databas och profil enligt
[den exakta omstarten](../development/devcontainer.md#disposable-local-database);
skapa inte om databasen och kör inte `db:setup` mellan avläsningarna.

## Kontrollerat grafikavbrott för kamera

I KAMERA-03 steg 4 används endast kodblocket för grafikavbrott under
[befintlig grafikförberedelse](map-graphics-preparation.md#lista-04-och-lista-08),
med kamerafallets redan skapade objekt. Öppna Los åtgärder först, kör
avbrottet och lämna Console för att kontrollera den inaktiva fokusknappen.
Kör sedan `skyttelGraphics.restoreContext()` i samma Console och återgå
till kartan före kontrollen av återställd fokusering. Återställ grafiken
före avslut. På fysisk pekskärm används dess webbläsares utvecklarverktyg
eller ansluten fjärrinspektion; saknas stöd redovisas grafikdelen som ej
utförd, utan att intyga den mänskliga observationen som helt genomförd.

## En kontrollerad begäran

Bygg installationen med `npm run build`. Starta den vanliga isolerade
provservern och skapa provhushållet. Kopiera hushållets ID från adressen.
Starta transporten i en separat terminal:

```bash
npm run test:env -- node --import tsx scripts/manual-transport.ts \
  --origin https://PROVADRESS --upstream http://127.0.0.1:4317 \
  --household HOUSEHOLD_ID --port 4318
```

Ersätt publika adressen, applikationens loopbackport och hushållets ID.
Rikta samma HTTPS-ingång till transportens loopbackport 4318. Transporten
ersätter inte inloggning eller behörighet. Kontrollera normal läsning
innan du armar något; välj `status` för att se väntande leverans.
`release` släpper samma verkliga svar eller begäran. `drop` avbryter
väntande leverans; `clear` tar bort en ännu inte använd armering.

`after` håller svaret efter faktisk hantering i applikationen. Terminalen
visar `application-completed` före `held-after`. `before` håller begäran
innan den når applikationen och visar `held-before`. Bara nästa matchande
begäran i angivet provhushåll påverkas. Håll och släpp i samma terminal;
byt inte databas eller publik adress. Detta fungerar även över omladdning.

## Väntande personlig flytt

För [KAMERA-04](map-camera.md#kamera-04-fokusera-i-en-kort-vy-med-åtkomliga-verktyg),
kör `arm position:after` före flytten i steg 7. Flytta Lo och invänta
`held-after`: flytten är då genomförd, men webbläsaren väntar på svaret.
Gör den angivna senare fokuseringen eller stängningen. Kör `release`
och granska samma sena svar. Arma på nytt före den andra fokussituationen.
Innan nästa fall ska `status` visa ingen väntande eller armerad begäran.

## Väntande formulärsvar

För [PANEL-05](workspace-panels.md#panel-05-väntande-tillägg-före-ny-sökning),
kör `arm stage:after` efter att Cykeln och Bilen lagts i utkastet men
före det markerade formulärtillägget. När `held-after` visas finns det
kompletta förslaget redan på servern. Browsern väntar; granska modalen
och bakomliggande fokus. Kör `release` i steg 3. Vanlig offlineväxling
kan inte ersätta detta efterbehandlade, väntande svar.

## Sen första personlig inläsning

För [PLACERING-06](personal-view.md#placering-06-sen-första-inläsning-och-bevarad-kamera-vid-uppdatering),
kör `arm read-view:after` efter de sparade personliga flyttarna men
före omladdningen i steg 2. Ladda om och invänta `held-after` i terminalen.
Den personliga läsningen är då genomförd, medan den första visningen
väntar på svaret. Kartgrafiken får visas först. Granska tabell, karta
och inaktivt bakgrundsval. Kör `release` i steg 3 och granska den första
inramningen. Låt senare läsningar passera normalt; arma inte igen.

## Väntande och avvisad kartläsning

För [YTA-04](workspace-shell.md#yta-04-laddning-och-misslyckad-hämtning),
kör `arm read:before` före omladdningen. Invänta `held-before` och läs
webbläsarens laddningsbesked. Kör `drop` i steg 2. Begäran har då inte
nått applikationen. Välj **Hämta aktuellt underlag** i steg 3 utan ny
armering; inloggningen och andra hushålls läsningar förblir opåverkade.

## Separat åtkomstprov

PLACERING-05:s webbläsarsteg provar faktisk nekad ingång, egna personliga
flyttar, eget bakgrundsval och återkallad tillgång. Följande ytterligare
HTTP-underlag körs endast i en profil som saknar tillgång till hushållet.
Ange hushållets ID från den behöriga administratörens nätverkspanel.
Utloggad profil ska få tre 401-svar; fel hushåll och återkallad medlems
profil ska få tre 403-svar. De tomma ändringarna nekas före valideringen.

```js
await (async () => {
  const householdId = prompt('Provhushållets ID');
  const identity = await (await fetch('/api/version')).json();
  const viewPath = `/api/households/${encodeURIComponent(householdId)}/map/view`;
  console.log('read', (await fetch(viewPath)).status);
  for (const kind of ['position', 'settings']) {
    const response = await fetch(`${viewPath}/${kind}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Skyttel-Build': `${identity.commit}:${identity.version}`,
      },
      body: '{}',
    });
    console.log(kind, response.status);
  }
})();
```

Provet ska inte skapa något utkast, ändra personliga val eller återställa
tillgång. Stäng de obehöriga profilerna efter åtkomstprovet. Släpp alltid
hållna svar, ta bort oanvänd armering med `clear` och kontrollera `status`
innan andra fall börjar.
Om du använder HTTPS-portvidarebefordran, återställ appens HTTPS-ingång
innan du avslutar transporten med `quit`.

# Manuella testfall för historik och ångring

Testfallen gäller läsning av sparade ändringsgrupper, ångring som ett nytt
privat förslag samt konflikter och återställning efter vanlig borttagning.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd två konfigurerade testidentiteter: **Alex Exempel** som
administratör och **Robin Exempel** som vanlig medlem i samma hushåll.
Namnen avser testernas roller; logga in genom installationens
konfigurerade identitetsleverantör. Bjud in Robin enligt
[tillgång till hushållet](../user-guide/access.md). Använd skilda
webbläsarprofiler så att båda kan arbeta samtidigt.

## Allmän förberedelse

1. Använd en separat utvecklingsdatabas med påhittade uppgifter, exempelvis
   i devcontainern enligt [utvecklingsguiden](../development/devcontainer.md).
   Testerna behöver ingen publik adress eller extern assistent.
2. Skapa ett tomt testhushåll som Alex och ge Robin tillgång. Skapa personen
   **Lo Exempel** med **Nytt objekt**, **Objektets namn**, **Objekttyp**
   och **Lägg i mitt utkast**. Välj **Spara hela utkastet**.
3. Kontrollera att båda användarna ser Lo och har **Inga förslag** i sina
   egna utkast. Läs [historikguiden](../user-guide/history.md) för begreppen.
4. Använd ett nytt tomt testhushåll för varje fall. Behåll samma databas
   vid omstart inom ett fall. Kör ingen återställning av demodata då.

## Historik och oberoende ändringar

### HISTORIK-01: läs ett sparande och bevara oberoende arbete vid ångring

**Syfte:** Läsa tidigare och nya värden och återuppta ett privat
ångringsförslag från en annan klient utan att förlora oberoende arbete.

**Användare:** Alex Exempel. Robin Exempel kan kontrollera den gemensamma
kartan före och efter sparandet.

**Förutsättningar:** Lo Exempel enligt förberedelsen, utan beskrivning.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts),
testfallet “HISTORIK-01: history explains a save and undo preserves
independent work after restart”.

**Steg:**

1. Ändra namnet **Lo Exempel** till **Lo Lind** som Alex, lägg ändringen
   i utkastet och spara hela utkastet.
2. Öppna Lo igen, ange **Oberoende beskrivning** under **Beskrivning**
   och spara ändringen i ett separat sparande.
3. Lägg den nya personen **Robin Exempel** i Alex utkast utan att spara.
   Personen i kartan är skild från Skyttel-användaren med samma namn.
4. Välj **Visa historik**. Hitta gruppen med namnbytet, öppna
   **Identifiera sparandet och användaren** och anteckna sparande-ID,
   tidpunkt och användare. Kontrollera värdena före och efter.
5. Välj **Ångra sparandet** i den gruppen. Granska **Hela mitt utkast**
   och kontrollera den gemensamma kartan som Robin.
6. Välj **Kasta hela utkastet**. Kontrollera att utkastet blir tomt medan
   den gemensamma kartan och de tre historikgrupperna är oförändrade.
7. Lägg personen Robin Exempel i utkastet igen. Ångra samma namnbytesgrupp
   på nytt och granska båda förslagen tillsammans.
8. Starta om appen med samma databas. Logga in som Alex i en annan
   webbläsarprofil och öppna samma hushåll. Granska hela utkastet igen.
9. Välj **Spara hela utkastet**. Kontrollera kvittot, öppna historiken igen
   och ladda om Robins karta.

**Förväntat resultat:**

- Namnbytesgruppen visar Lo Exempel före, Lo Lind efter, sparande-ID,
  tidpunkt samt Alex namn och användar-ID. Det privata objektförslaget
  Robin Exempel finns inte i historiken före sparandet.
- Ångringsförslaget visar Lo Exempel med **Oberoende beskrivning** och
  behåller det nya objektet Robin Exempel i samma utkast. Robins gemensamma
  karta visar fortfarande Lo Lind och inget nytt Robin-objekt.
- **Kasta hela utkastet** tar bara bort de privata förslagen. Det ångrar
  inget genomfört sparande och skapar ingen historikgrupp.
- Samma utkast finns kvar efter omstart och klientbyte. Efter det nya
  sparandet ser båda användarna Lo Exempel med beskrivningen och det nya
  objektet Robin Exempel.
- Sparandet ger ett nytt kvitto och en fjärde historikgrupp. De tre tidigare
  grupperna, inklusive namnbytesgruppen, finns kvar oförändrade.

## Återställning

### HISTORIK-02: återställ upphörda objekt och samband med samma identiteter

**Syfte:** Återställa vanlig borttagning utan att ändra status, skapa nya
identiteter eller påverka anslutna objekt.

**Användare:** Alex Exempel och Robin Exempel.

**Förutsättningar:** Lo Exempel enligt förberedelsen. Skapa och spara
objektet **Blått kort** av typen **Kort** och sambandet
**Lo Exempel → Använder → Blått kort**.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts),
testfallet “HISTORIK-02: deletion undo restores ended objects and
relationships with their identities”.

**Steg:**

1. Markera Lo Exempel som **Upphört** under **Objektets status**.
   Markera sambandet till kortet som **Upphört** under **Sambandets status**.
   Lägg båda ändringarna i utkastet och spara hela utkastet.
2. Öppna **Åtgärder för Lo Exempel** i listan och välj **Ta bort**.
   Granska borttagningen av objektet och sambandet. Spara utkastet.
3. Starta om appen med samma databas och logga in som Alex från en annan
   webbläsarprofil. Öppna **Visa historik** och hitta borttagningsgruppen.
   Öppna **Objektets identitet**. Anteckna objektets och sambandets ID:n,
   status och tidigare värden.
4. Välj **Ångra sparandet** i borttagningsgruppen. Granska förslaget.
   Kontrollera som Robin att Lo och sambandet fortfarande saknas.
5. Granska hela Alex utkast och välj **Spara hela utkastet**.
6. Ladda om Robins karta. Öppna objektet, sambanden och den nya
   historikgruppen. Jämför identiteter och värden med anteckningarna.

**Förväntat resultat:**

- Historiken visar det borttagna objektet och sambandet med tidigare
  värden och tomma eftervärden. Blått kort finns kvar i kartan.
- Borttagningen kan ångras efter omstart och klientbyte. Ångringen är
  privat före det nya sparandet.
- Lo och sambandet återkommer med samma ID:n, värden och statusen Upphört.
  Blått kort behåller sin identitet, sina värden och sin egen status.
- Det nya sparandet ger en ny historikgrupp. Borttagningsgruppen finns kvar.
  Ingen permanent radering utförs eller återställs i detta fall.

## Överlappande ändringar

### HISTORIK-03: granska senare konflikter och stoppa egna överlapp atomiskt

**Syfte:** Kräva ett nytt val för senare gemensamma ändringar och stoppa
hela ångringen när det egna utkastet redan innehåller ett överlapp.

**Användare:** Alex Exempel och Robin Exempel.

**Förutsättningar:** Lo Exempel enligt förberedelsen. Håll båda
webbläsarprofilerna tillgängliga under hela fallet.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts),
testfallet “HISTORIK-03: later overlaps need a fresh choice and own
overlaps block atomically”.

**Steg:**

1. Byt Lo Exempels namn till **Lo Lind** som Alex och spara. Hitta och
   anteckna namnbytesgruppen i historiken.
2. Byt samma namn till **Lo Ek** som Robin och spara.
3. Ladda om Alex sida. Lägg namnändringen **Privat namn** och det nya
   objektet **Robin Exempel**
   i Alex utkast utan att spara. Öppna historiken och välj
   **Ångra sparandet** i gruppen från steg 1.
4. Kontrollera felet, hela utkastet och Robins gemensamma karta.
5. Välj **Kasta förslaget** för just namnändringen till Privat namn.
   Kontrollera att objektförslaget Robin Exempel finns kvar i utkastet
   och försök ångra gruppen från steg 1 igen.
6. Granska konflikten i **Hela mitt utkast**. Kontrollera att
   **Spara hela utkastet** är spärrat före ett konfliktval.
7. Välj **Behåll mitt förslag**. Kontrollera som Robin att Lo Ek
   fortfarande är sparat och inget nytt objekt Robin Exempel finns.
8. Granska hela Alex utkast igen och välj **Spara hela utkastet**.
   Ladda om Robins karta och kontrollera historiken.

**Förväntat resultat:**

- Det egna överlappet i steg 3 stoppar hela ångringen. Namnförslaget
  Privat namn och det oberoende förslaget Robin Exempel finns kvar.
  Ingen ny historikgrupp eller gemensam ändring uppstår.
- När enbart namnförslaget kastas kan ångringen läggas till. Konflikten
  visar Lo Lind som underlag, Lo Exempel som förslag och Lo Ek som senare
  sparat namn. Det oberoende förslaget Robin Exempel finns kvar.
- Konfliktvalet ändrar bara Alex utkast. Först det nya sparbeskedet gör
  Lo Exempel och det nya objektet Robin Exempel gemensamma och skapar
  en ny historikgrupp. De tidigare grupperna finns kvar.

### HISTORIK-04: bevara egna uppgifter och konflikter när sparat värde väljs

**Syfte:** Behålla oberoende privata uppgifter när en ångring väljs bort,
utan att dölja en kvarvarande konflikt eller spara någon del automatiskt.

**Användare:** Alex Exempel och Robin Exempel.

**Förutsättningar:** Lo Exempel enligt förberedelsen, utan beskrivning.
Håll båda webbläsarprofilerna tillgängliga under hela fallet.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts),
testfallet “HISTORIK-04: keeping saved values retains independent private
facts and their conflicts”.

**Steg:**

1. Byt Lo Exempels namn till **Lo Lind** som Alex och spara. Hitta och
   anteckna namnbytesgruppen i historiken.
2. Byt samma namn till **Lo Ek** som Robin och spara.
3. Ladda om Alex sida. Öppna Lo Ek, ange **Egen beskrivning** under
   **Beskrivning** och lägg ändringen i utkastet utan att spara.
4. Välj **Visa historik** och **Ångra sparandet** i namnbytesgruppen
   från steg 1. Granska namnkonflikten och den egna beskrivningen i
   **Hela mitt utkast**. Gör inget konfliktval ännu.
5. Ange **Senare delad beskrivning** för Lo Ek som Robin och spara.
6. Ladda om Alex sida och granska konflikten igen. Välj **Använd sparat
   värde** för förslaget som innehåller ångringen och den egna beskrivningen.
7. Kontrollera att beskrivningen finns kvar som ett eget förslag med en
   konflikt och att **Spara hela utkastet** fortfarande är spärrat.
8. Välj **Behåll mitt förslag** för beskrivningens konflikt. Kontrollera
   som Robin att den gemensamma beskrivningen ännu är oförändrad.
9. Granska hela Alex utkast igen och välj **Spara hela utkastet**.
   Ladda om Robins karta och kontrollera den nya historikgruppen.

**Förväntat resultat:**

- Ångringen visar Lo Exempel som namnförslag och Lo Ek som senare sparat
  namn. Den oberoende privata beskrivningen finns med i samma granskning.
- **Använd sparat värde** väljer bort ångringen av namnet och behåller
  det sparade namnet Lo Ek. Egen beskrivning finns kvar i utkastet och
  jämförs med Senare delad beskrivning i en kvarvarande konflikt.
- Inget av konfliktvalen ändrar den gemensamma kartan. Hela sparandet är
  blockerat tills beskrivningens konflikt också har ett uttryckligt val.
- Först det nya sparbeskedet gör namnet Lo Ek och beskrivningen
  Egen beskrivning gemensamma. Ett nytt kvitto och en ny historikgrupp
  tillkommer. Namnbytesgruppen och övrig tidigare historik är oförändrade.

### HISTORIK-05: granska fältets värdeslag innan ett äldre värde återställs

**Syfte:** Bevara ett äldre fältvärde utan omvandling och kräva en
kompatibel definition samt ett nytt sparbesked för återställning.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo Exempel enligt förberedelsen. Lägg till fältet
**Serienummer** med värdeslaget **Tal** på objekttypen Person enligt
[guiden för egna fält](../user-guide/object-types.md). Spara definitionen,
ange värdet **42** på Lo och spara. Inget annat objekt eller privat utkast
ska använda fältet.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts),
testfallet “HISTORIK-05: restored field values require a compatible
definition and a fresh save”.

**Steg:**

1. Ta bort Lo och spara hela utkastet. Anteckna borttagningsgruppen under
   **Visa historik**.
2. Ändra det nu oanvända fältet Serienummer till värdeslaget **Text**
   och spara definitionen.
3. Välj **Ångra sparandet** i borttagningsgruppen. Granska definitionen
   och objektet under **Hela mitt utkast**.
4. Välj **Använd sparad typdefinition**. Kontrollera objektets konflikt
   och välj sedan **Använd sparat värde** för objektet.
5. Ångra samma borttagningsgrupp igen. Välj **Behåll min typdefinition**
   och granska hela utkastet. Kontrollera att Lo ännu saknas i kartan.
6. Välj **Spara hela utkastet** och kontrollera kvittot, Lo och historiken.

**Förväntat resultat:**

- Ångringen visar Serienummer som Tal i förslaget, Text i dagens
  definition och objektets äldre värde 42. Sparandet är spärrat.
- Valet av dagens definition lämnar värdet 42 som en objektkonflikt;
  det omvandlas inte till text och kan inte sparas utan ytterligare val.
  Valet av sparat objektvärde avstår från återställningen och tömmer
  utkastet. Lo saknas fortfarande i den gemensamma kartan.
- Valet av den äldre definitionen ändrar bara utkastet. Först det nya
  sparbeskedet återställer Lo med samma identitet och talvärdet 42.
- Ett nytt kvitto och en ny historikgrupp tillkommer. Borttagningsgruppen
  är oförändrad. Inget fältvärde omvandlas automatiskt.

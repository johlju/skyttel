# Manuella testfall för sammanslagning

Testfallen omfattar uttrycklig identitet, uppgifter och samband vid
sammanslagning samt privat utkast, kvitto, historik och ångring.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör och medlem i hushållet Linden. Använd en andra
webbläsare med samma inloggning för att kontrollera återupptagning.
Använd endast påhittade uppgifter och installationens testinloggning.

## Allmän förberedelse

1. Starta en isolerad testinstallation. Logga in som Alex och skapa Linden.
2. Återställ installationen mellan körningar. Behåll databasen vid omstart
   och använd samma hushåll och inloggning i båda webbläsarna.

## Sammanslagning och ångring

### SAMMANSLAGNING-01: granska identiteter, samband och ångra hela sparandet

**Syfte:** Kontrollera uttryckliga val, blockerad identitet, återupptagning
och återställning av originalidentiteter med oberoende arbete bevarat.

**Användare:** Alex i båda webbläsarna.

**Förutsättningar:** Två sparade objekt heter Lo Exempel. Det första har
beskrivningen Första uppgiften, det andra Andra uppgiften. Anteckna deras
identiteter. Båda har varsitt samband av samma typ till Blått kort;
det andra sambandet är manuellt upphört. Lägg Robin Exempel i ett eget
utkast och behåll förslaget osparat.

**Integrationstest:**
[merge.spec.ts](../../tests/integration/merge.spec.ts),
testfallet “SAMMANSLAGNING-01: explicit identities and edge choices survive
restart, lost receipt and whole-save undo”.

**Steg:**

1. Välj **Slå samman objekt**. Välj första Lo som objekt som behåller sin
   identitet och andra Lo som objekt som tas in. Granska identifierare,
   beskrivningar och samband. Välj andra objektets beskrivning.
2. Välj **Behåll sambandet** för båda och lägg förslaget i utkastet.
   Kontrollera att dubbletten avvisas utan att utkastet ändras.
3. Välj **Ta bort sambandet** för det första sambandet. Lämna bekräftelsen
   av samma företeelse omarkerad och lägg förslaget i utkastet.
4. Kontrollera att **Spara hela utkastet** är spärrad. Välj **Kasta
   sammanslagningen för att rätta**. Robin ska finnas kvar i utkastet.
5. Välj objekten och uppgifterna igen, behåll endast det andra sambandet
   och bekräfta uttryckligen att objekten är samma företeelse.
6. Lägg förslaget i utkastet. Starta om installationen och ladda om sidan.
   Kontrollera hela skillnaden. Kör engångskoden för förlorat sparsvar i
   [BILD-02](profile-images.md#bild-02-avvisa-felaktiga-bilder-och-återhämta-bildborttagning)
   i den här sidans Console **före** nästa sparande. Välj **Spara hela
   utkastet** utan att ladda om först. Koden inväntar serversvaret innan
   appen får anslutningsfelet. Kontrollera det okända utfallet och välj
   **Hämta samma kvitto igen**. Ladda om, öppna **Mina sparförsök** och
   **Visa historik**: samma genomförda försök och kvitto ska finnas, med
   exakt en ändringsgrupp för sammanslagningen. Koden återställer `fetch`
   efter ett svar; ladda om sidan för att återställa om provet avbryts.
7. Rätta det kvarvarande objektets namn till Senare namn och spara.
   Lägg Eget senare objekt i utkastet. Starta om installationen.
8. Öppna den andra webbläsaren. Välj **Visa historik**, hitta
   sammanslagningen och granska identiteter och upphörd status.
9. Välj **Ångra sparandet**, granska hela förslaget och spara.

**Förväntat resultat:**

- Samma namn bekräftar inte identiteten. Olika uppgifter och kolliderande
  samband kräver uttryckliga val. Obesvarad identitet spärrar hela sparandet.
- Utkastet och historiken överlever omstart. Förlorat svar skapar inte en
  extra ändringsgrupp. Kvitto och gemensam karta beskriver samma resultat.
- Ångringen återställer båda ursprungliga identiteterna, beskrivningarna
  och sambanden, inklusive upphörd status. Senare namn och Eget senare
  objekt bevaras. Robin ingår i samma ursprungliga sparande och ångras också.

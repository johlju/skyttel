# Manuella testfall för stora kartor

Testfallet gäller sökning, sidvisning, fokus och redigering i en karta med
500 objekt och 1 500 samband. Anteckna commit, webbläsare och godkänt eller
underkänt resultat vid körning. Tidsmätning och etikettgeometri provas separat
enligt [mätplanen](large-map-performance.md).

## Konfigurerade användare

Den tillfälliga installationen använder **Alex Exempel** som administratör.
Välj Google vid inloggning. Identitetsleverantören är en ersättare i
testmiljön; inga verkliga inloggningsuppgifter behövs.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Installera projektets beroenden och Chromium enligt
   [utvecklingsguiden](../development/devcontainer.md#prepare-and-start).
2. Kör `MAP_PAUSE=1 npm run measure:map` i utvecklingsmiljön. Öppna den
   lokala adress som skrivs ut. Vid användning av värddatorns webbläsare,
   vidarebefordra den utskrivna porten från devcontainern. Logga in.
3. Låt kommandot vänta under provet. Det skapar en separat tillfällig
   databas med enbart påhittade uppgifter. Starta om kommandot för ett nytt
   prov. Använd inte den ändrade databasen för jämförande tidsmätning.

## Hitta och redigera

### STORKARTA-01: hela innehållet är åtkomligt i en tät karta

**Syfte:** Kontrollera att färre etiketter och sidvisning inte gömmer
innehåll eller tappar formulärtext, utkast eller personliga placeringar.

**Användare:** Alex Exempel.

**Förutsättningar:** Den nya provkartan visar 500 objekt och 1 500 samband.

**Integrationstest:**
[large-map.spec.ts](../../tests/integration/large-map.spec.ts), testfallet
“STORKARTA-01: dense overview keeps readable labels and every object and
relationship reachable”.

**Steg:**

1. Öppna **Samlad vy**. Läs beskedet om färre etiketter och kontrollera
   att sökning, listor och navigering är tillgängliga.
2. Bläddra genom objektsidorna och sambandssidorna med sidvalet. Kontrollera
   räknaren och att den sista sidan nås. Välj **Provobjekt 499** genom sökning
   och kontrollera namnet i detaljerna.
3. Rensa sökningen. Använd **Visa valt innehåll i listan** och kontrollera
   att det valda objektet återfinns. Välj **Visa objektets kopplingar**
   och läs dess direkta samband.
4. Skriv **Oskickad text i den täta kartan** i **Beskrivning**. Välj
   **Visa hela rymden**, växla mellan lista och samlad vy och kontrollera
   att texten finns kvar. Lägg den i utkastet och granska hela förslaget.
5. Spara hela utkastet. Invänta kvittot, ladda om och sök objektet igen.
   Kontrollera den sparade beskrivningen och historiken. Kontrollera också
   att personliga placeringar finns kvar om du ordnade några före provet.
6. Logga ut. Kontrollera att provkartan inte visas för en oinloggad besökare.

**Förväntat resultat:**

- Alla objekt och samband kan nås via sidorna; sökning omfattar hela kartan.
- Fokus visar sammanhang utan att ändra information eller placeringar.
- Oskickad text bevaras vid navigering och sparas först på uttryckligt besked.
- Kvittot, återlästa detaljer och historik beskriver samma sparade ändring.
  Automatprovet återläser även efter serveromstart och kontrollerar samtliga
  objekt, samband och tidigare personliga placeringar.
- Utloggning tar bort tillgången till kartan. Automatprovet kontrollerar
  även nekad åtkomst med en tidigare session efter återkallat medlemskap.

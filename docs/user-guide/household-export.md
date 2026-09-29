# Exportera hushållets information

[Till användarguidens innehåll](README.md)

En aktuell administratör kan hämta hushållets fullständiga information
som en ZIP-fil. Öppna **Inställningar** och välj **Fullständig export**
under Administration. Vanliga medlemmar och externa assistenter kan
inte göra en fullständig export.

## Läs detta före exporten

Exporten innehåller hushållets gemensamma karta, typdefinitioner,
ändringshistorik, sparförsök och kvitton. Även andra användares privata
utkast, personliga placeringar och visningsval ingår, tillsammans med
bilder som behövs för innehållet och dess historik. Administratören kan
alltså läsa andras privata information i filen.

Oskickad formulärtext ingår ännu inte. Lägg först ändringarna i ditt
privata utkast om de ska följa med i exporten; du behöver inte spara dem
i den gemensamma kartan.

Förvara filen säkert. Dela den bara med personer som ska få läsa hela
innehållet. Tänk även på vem som kommer åt mappen där webbläsaren sparar
nedladdningar. Filen är inte lösenordsskyddad.

Gör egna exporter när du behöver en aktuell kopia utanför installationen.
Vid ett större driftfel kan ändringar sedan din senaste egna export gå
förlorade. En export innehåller den information som finns när kopian
skapas; senare ändringar kräver en ny export.

## Förbered och hämta filen

1. Läs informationen under **Fullständig export** och välj
   **Förbered fullständig export**.
2. Vänta på **Exporten är klar att hämta**. Stora hushåll kan ta längre
   tid att förbereda. Sluttiden visas på sidan; filen kan hämtas i tio
   minuter efter att den blir klar.
3. Välj **Hämta ZIP-fil**. Skyttel tar emot och kontrollerar hela filen
   innan webbläsarens nedladdning startar.
4. Spara `skyttel-hushall.zip` på en säker plats. Kontrollera i
   webbläsarens nedladdningar att filen verkligen finns sparad och går
   att öppna som ZIP. Meddelandet i Skyttel bekräftar att webbläsarens
   nedladdning startar, inte att filen finns på din disk.

Behåll hela ZIP-filen. Den innehåller ett format med angiven version,
maskinläsbart innehåll och bilddata. En aktuell administratör kan
[återimportera ett befintligt hushåll](household-import.md). Exporten ger
inte någon ny tillgång till hushållet och innehåller inte sessioner,
aktiva OAuth-token eller serverhemligheter.

## Avbryt eller försök igen

Välj **Avbryt export** för att avbryta förberedelsen eller hämtningen.
Du kan också avbryta en färdig export innan du hämtar den. Hushållets
information påverkas inte. Om du lämnar exportsidan avbryts pågående
arbete och Skyttel försöker ta bort den förberedda kopian. Du kan återgå
till kartan med ditt pågående kartarbete kvar.

Om förberedelsen avbryts innan svaret kommer fram kan Skyttel inte
bekräfta att en färdig kopia tas bort. En sådan tillfällig kopia kan finnas
kvar tills giltighetstiden går ut. Ingen fil erbjuds från det avbrutna
försöket; välj **Förbered fullständig export** om du vill börja om.

En förberedd fil kan hämtas en gång. Om anslutningen avbryts, filen inte
kan kontrolleras eller giltighetstiden går ut väljer du
**Förbered fullständig export** igen. Ingen ofullständig fil erbjuds
som en lyckad export. Om ett avbrott inte kan bekräftas visas ett
felmeddelande; en tillfällig kopia kan finnas kvar tills tiden går ut.

Din administratörsroll kontrolleras igen när du hämtar filen. Om rollen
eller tillgången ändras stängs exportflödet. En redan sparad fil finns
fortfarande hos den som hämtar den och måste hanteras separat.

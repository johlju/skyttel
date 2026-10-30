# Installationens diagnostik med LangSmith

Den här guiden hjälper installationsansvarig att styra sändning och läsa
leveransstatus. Hushållets administratörsroll ger inte denna tillgång.

Öppna **Inställningar** och **Diagnostik med LangSmith** under **Drift**.
Sändningsvalet gäller hela installationen. Det är skilt från varje
Skyttel-användares [samtalsmedgivande](text-assistant.md).

När leveransen är ansluten och sändningen aktiverad kan LangSmith få exakt
samtalstext, modellens in- och utdata samt hushållets verktygsfrågor och
resultat. Rått ljud ingår inte. Ett aktiverat val med **Inte ansluten**
betyder att leveransen inte är ansluten eller konfigurerad, inte att
någon information levereras. Denna förberedande version ansluter ingen
produktionsleverans.

## Stäng av eller aktivera sändning

Välj **Stäng av sändning** för att stoppa nya leveranser, kasta väntande
händelser och avbryta pågående leverans där det går. Valet finns kvar
efter omstart. Redan skickade förfrågningar kan inte återkallas.
Radering hos LangSmith är en separat åtgärd.

**Aktivera sändning** tillåter bara nya händelser. Kastade händelser
återskapas eller skickas inte igen. Ett nytt konfigurerat system har
sändningen aktiverad som grundval.

## Läs status och återhämta en spärr

Välj **Uppdatera leveransstatus** för aktuellt sändningsläge, senaste
lyckade leverans, antal förlorade händelser och en säker felkategori.
Tidpunkten för senaste lyckade leverans, antalet förlorade händelser och
den senaste felkategorin finns bara i minnet och nollställs vid omstart.
Valet att aktivera eller stänga av sändning och en eventuell spärr finns
kvar efter omstart. Leveransstatus bevisar varken lyckat samtal eller
fullständig historik.

Förbrukad kostnadsfri kvot eller ogiltiga LangSmith-uppgifter spärrar
sändningen utan att samla en kö. Spärren finns kvar efter omstart och
hävs inte genom vanlig aktivering. Kontrollera och åtgärda orsaken hos
LangSmith. Välj sedan **Starta om sändning efter kontroll**. Leveransen
måste vara ansluten för att spärren ska kunna hävas. Återhämtning ger
inte tillstånd att lägga till betalningsmetod eller betaltjänst.

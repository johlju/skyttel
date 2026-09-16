# Fullständig export återställer innehåll men inte gammal åtkomst

Hushållets innehåll ska kunna återställas och flyttas utan den gamla
driftvärdens disk, så administratören exporterar allt unikt innehåll i
ett format med angiven version och stabila identiteter, inklusive
historik, bildversioner, privata utkast och personliga vyer.
Återimport ersätter innehållet i en sammanhållen operation i stället för
att slå ihop det, men behåller aktuell åtkomst i ett befintligt hushåll;
i en ny installation bekräftas åtkomst och inloggningskopplingar
uttryckligen, så att en gammal export inte återaktiverar borttagna
användare.
Administratörens insyn i andras utkast genom exporten ska framgå, och
serverhemligheter, sessioner och aktiva OAuth-token ingår inte i formatet.

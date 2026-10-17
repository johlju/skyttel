---
status: accepted
---

# Separat lagringssamtycke och ihågkommen inloggning

Skyttel skiljer mellan ett webbläsarspecifikt lagringssamtycke och ett
separat, serverbekräftat val att aktivera ihågkommen inloggning.
Funktionsvalet görs efter inloggningen för att användaren ska förstå att
det avser Skyttel och inte Google eller Microsoft, även om det kräver
ett nytt aktiveringsflöde på servern.
Webbläsarmetadata ger aldrig åtkomst, och ihågkommen inloggning gäller
högst sju dygn från den ursprungliga autentiseringen.

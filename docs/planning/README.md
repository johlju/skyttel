# Grundspecifikationens beslut

[Skyttel – väg till grundspecifikationen för första användbara versionen](https://github.com/viscalyx/skyttel/issues/2)
är den gemensamma beslutskartan. Använd den för att hitta produktbeslut och
deras resolutioner inför implementation och produktverifiering.
Grundspecifikationens acceptanskriterier och avgränsningar styr arbetet.

Beslut om informationslivscykeln finns i
[Vilken information ska sparas, ändras över tid och kunna återställas?](https://github.com/viscalyx/skyttel/issues/9#issuecomment-5655680457).
Beslut om assistenternas gemensamma MCP-ingång finns i
[Vilken roll ska externa AI-assistenter få i första Skyttel?](https://github.com/viscalyx/skyttel/issues/10#issuecomment-5662601732).
Beslut om sparflödet och resultat från det godkända externa MCP-provet finns i
[Kan en extern assistent genomföra Skyttels gemensamma MCP-flöde?](https://github.com/viscalyx/skyttel/issues/15#issuecomment-5667325819).
Beslut om plattform och distribution finns i
[Vilka enheter och distributionsformer behöver första Skyttel?](https://github.com/viscalyx/skyttel/issues/11#issuecomment-5663538779).
Beslutens detaljer hör hemma i respektive resolution. Ordlistan
[Skyttels begrepp](../../CONTEXT.md) anger de gemensamma termerna.

Beslut om hushållets redigerbara typer finns i
[Hur ska hushållet skapa och ändra egna objekt- och sambandstyper?](https://github.com/viscalyx/skyttel/issues/26#issuecomment-5696089834).
Den godkända grundspecifikationen, samlade acceptanskriterier och
återstående produktverifiering finns i
[Vad ska första användbara Skyttel innehålla och hur vet vi att det räcker?](https://github.com/viscalyx/skyttel/issues/13#issuecomment-5697070021).

## Arkitekturbeslut

Följ dessa ADR:er vid ändringar som berör arkitekturen:

- [Gemensam hushållskarta med lika vardagsåtkomst](../adr/0001-gemensam-hushallskarta.md).
- [E-postadresser är egna objekt i hushållets karta](../adr/0002-epostadressens-separata-identitet.md).
- [Hushållets typer är redigerbara data med bevarad historik](../adr/0003-redigerbara-typer-med-historik.md).
- [Gemensam MCP-ingång med avgränsat kartarbete](../adr/0004-gemensam-mcp-ingang.md).
- [Privata utkast sparas som en kontrollerad ändringsgrupp](../adr/0005-utkast-sparas-samlat.md).
- [Fullständig export återställer innehåll men inte gammal åtkomst](../adr/0006-export-med-separat-atkomst.md).
- [En portabel applikationscontainer med SQLite och små bilder i databasen](../adr/0007-portabel-applikationscontainer-med-sqlite.md).
- [Autentisering av Skyttel-användare](../adr/0008-autentisering-av-skyttel-anvandare.md).

Motiveringar till urval och bortval finns i
[ADR-inventeringen](https://github.com/viscalyx/skyttel/issues/28#issuecomment-5697479965)
och [urvalsbeslutet](https://github.com/viscalyx/skyttel/issues/29#issuecomment-5697731641).

## Avgränsningar vid triage

Använd [inventeringen av avgränsningsbeslut](https://github.com/viscalyx/skyttel/issues/30#issuecomment-5697500300)
som källstöd vid triage. Skilj varaktiga avslag från första versionens
begränsningar, uppskjutet arbete och kartläggningens egna gränser.
Inventeringen ger inte grund för att lägga något av dess fall i
`.out-of-scope/`.

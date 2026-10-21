/** Public descriptions of actual executor stages; never provider reasoning or tool arguments. */
export function assistantToolActivity(name: string): string {
  if (name === 'read_map') return 'Läser kartan via MCP';
  if (name === 'read_my_draft') return 'Kontrollerar utkastet via MCP';
  if (name === 'read_type_catalog') return 'Läser objekt- och sambandstyper via MCP';
  if (name === 'search_object_icons') return 'Söker ikoner via MCP';
  if (name === 'read_history') return 'Läser sparhistoriken via MCP';
  if (name === 'read_my_save_operations' || name === 'read_save_operation')
    return 'Kontrollerar sparresultatet via MCP';
  if (name === 'prepare_save' || name === 'save_draft') return 'Sparar utkastet via MCP';
  return 'Bearbetar utkastet via MCP';
}

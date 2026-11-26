/** Public descriptions of actual executor stages; never provider reasoning or tool arguments. */
export function assistantToolActivity(name: string): string {
  if (name === 'read_map') return 'Läser kartan';
  if (name === 'read_my_draft') return 'Kontrollerar utkastet';
  if (name === 'read_type_catalog') return 'Läser objekt- och sambandstyper';
  if (name === 'search_object_icons') return 'Söker ikoner';
  if (name === 'read_history') return 'Läser sparhistoriken';
  if (name === 'read_my_save_operations' || name === 'read_save_operation')
    return 'Kontrollerar sparresultatet';
  if (name === 'prepare_save' || name === 'save_draft') return 'Sparar utkastet';
  return 'Bearbetar utkastet';
}

import { readFileSync } from 'node:fs';

// The prisma-client generator does not expose DMMF. Read the committed schema
// directly so new tables/columns join both the migration assertion and cleanup.
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const relations = new Set(blocks.map((block) => block[1]));
export const schemaModels = blocks.map(([, name, body]) => ({
  name: name!,
  table: body!.match(/@@map\("([^"]+)"\)/)?.[1] ?? name!,
  columns: body!.split('\n').flatMap((line) => {
    const field = line.trim().match(/^(\w+)\s+(\w+)(?:\?|\[\])?(?:\s|$)/);
    if (!field || relations.has(field[2])) return [];
    return [line.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1]!];
  }),
}));
if (
  !schemaModels.length ||
  schemaModels.some((model) => !model.columns.length)
) {
  throw new Error('Could not read model/column definitions from Prisma schema');
}

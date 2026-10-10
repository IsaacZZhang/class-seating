import { id, type ProjectData } from "./model";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Older browsers on non-HTTPS local addresses created group IDs that the
// database's uuid column cannot store. Repair those IDs before retrying.
export function repairGroupIds(project: ProjectData): ProjectData {
  const repaired = structuredClone(project);
  for (const klass of repaired.classes) {
    const replacements = new Map<string, string>();
    for (const group of klass.groups ?? []) {
      if (uuid.test(group.id)) continue;
      const replacement = id();
      replacements.set(group.id, replacement);
      group.id = replacement;
    }
    for (const student of klass.students) {
      if (student.groupId && replacements.has(student.groupId)) {
        student.groupId = replacements.get(student.groupId);
      }
    }
  }
  return repaired;
}

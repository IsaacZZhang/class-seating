import { ProjectData } from "./model";

export function withoutClass(project: ProjectData, classId: string): ProjectData {
  const classes = project.classes.filter((klass) => klass.id !== classId);
  const activeClassId = classes.some((klass) => klass.id === project.activeClassId)
    ? project.activeClassId
    : (classes[0]?.id ?? "");
  return { classes, activeClassId };
}

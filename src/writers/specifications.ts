export interface Specification {
  id: string;
  name: string;
  content: string;
  builtin?: boolean;
}
const files = import.meta.glob<string>("./specifications/*.md", { query: "?raw", import: "default", eager: true });
export const builtInSpecifications: Specification[] = Object.entries(files).map(([path, content]) => ({
  id: path.split("/").pop()!,
  name: path.split("/").pop()!,
  content,
  builtin: true,
}));

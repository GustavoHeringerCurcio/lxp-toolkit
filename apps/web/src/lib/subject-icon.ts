import {
  Atom,
  Blocks,
  BrainCircuit,
  Briefcase,
  Code,
  Cpu,
  Database,
  Dna,
  DraftingCompass,
  Factory,
  FlaskConical,
  Globe,
  GraduationCap,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Music,
  Network,
  Palette,
  Scale,
  ShieldCheck,
  Sigma,
  ChartColumn,
  Utensils,
  Users,
  Wheat,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Automatic subject (module) pictogram.
 *
 * A module name maps to a domain icon via accent-insensitive, whole-phrase
 * keywords. The icon is rendered inside the subject-colored `SubjectAvatar`
 * tile, so identity color still comes from `--subject-*` (DESIGN.md §7) and no
 * raw color lives in TSX. Unmatched modules keep the 2-letter monogram.
 */

interface SubjectIconRule {
  icon: LucideIcon;
  keywords: string[];
}

/**
 * Order does not matter: the longest matching keyword wins, so a specific
 * phrase ("arquitetura de software") beats a generic one ("arquitetura").
 */
export const SUBJECT_ICON_RULES: SubjectIconRule[] = [
  {
    icon: Database,
    keywords: [
      "banco de dados",
      "banco de dado",
      "banco",
      "sql",
      "database",
      "modelagem de dados",
      "persistencia",
    ],
  },
  {
    icon: Network,
    keywords: [
      "arquitetura de software",
      "engenharia de software",
      "arquitetura de sistemas",
      "design patterns",
      "padroes de projeto",
      "microsservicos",
      "devops",
      "redes de computadores",
      "redes",
      "infraestrutura",
      "telecomunicacoes",
      "protocolos",
    ],
  },
  {
    icon: Code,
    keywords: [
      "programacao",
      "algoritmos",
      "algoritmo",
      "estrutura de dados",
      "logica de programacao",
      "desenvolvimento",
      "software",
      "front-end",
      "frontend",
      "back-end",
      "backend",
      "full stack",
      "mobile",
      "python",
      "javascript",
      "typescript",
      "java",
      "react",
      "node",
      "html",
      "css",
      "web",
      "codigo",
    ],
  },
  {
    icon: Cpu,
    keywords: [
      "arquitetura de computadores",
      "organizacao de computadores",
      "sistemas operacionais",
      "hardware",
      "microcontroladores",
      "embarcados",
      "compiladores",
    ],
  },
  {
    icon: BrainCircuit,
    keywords: [
      "inteligencia artificial",
      "machine learning",
      "aprendizado de maquina",
      "aprendizagem de maquina",
      "deep learning",
      "redes neurais",
      "neural",
      "ia",
    ],
  },
  {
    icon: ShieldCheck,
    keywords: [
      "seguranca da informacao",
      "ciberseguranca",
      "seguranca",
      "criptografia",
      "ethical hacking",
      "pentest",
      "auditoria",
    ],
  },
  {
    icon: ChartColumn,
    keywords: [
      "ciencia de dados",
      "analise de dados",
      "mineracao de dados",
      "big data",
      "estatistica",
      "probabilidade",
      "amostragem",
      "indicadores",
    ],
  },
  {
    icon: Sigma,
    keywords: [
      "calculo",
      "matematica",
      "algebra",
      "geometria",
      "trigonometria",
      "equacoes",
      "vetores",
      "matrizes",
      "matriz",
    ],
  },
  {
    icon: Atom,
    keywords: ["fisica", "mecanica", "termodinamica", "eletricidade", "ondas", "optica", "cinematica"],
  },
  {
    icon: FlaskConical,
    keywords: ["quimica", "organica", "bioquimica", "reacoes quimicas", "laboratorio"],
  },
  {
    icon: Dna,
    keywords: [
      "biologia",
      "biologicas",
      "genetica",
      "ecologia",
      "citologia",
      "microbiologia",
      "botanica",
      "zoologia",
      "anatomia",
      "fisiologia",
    ],
  },
  {
    icon: HeartPulse,
    keywords: [
      "enfermagem",
      "saude",
      "farmacologia",
      "medicina",
      "clinica",
      "semiologia",
      "biosseguranca",
      "primeiros socorros",
      "cuidado",
    ],
  },
  {
    icon: Scale,
    keywords: ["direito", "juridico", "juridica", "legislacao", "constitucional", "processo civil", "penal"],
  },
  {
    icon: Briefcase,
    keywords: [
      "administracao",
      "gestao",
      "gerencia",
      "gerenciamento de projetos",
      "empreendedorismo",
      "negocios",
      "marketing",
      "contabilidade",
      "financas",
      "economia",
      "comercio",
    ],
  },
  {
    icon: Users,
    keywords: ["recursos humanos", "rh", "psicologia", "comportamento organizacional", "lideranca"],
  },
  {
    icon: Factory,
    keywords: ["logistica", "producao", "qualidade", "lean", "manufatura", "suprimentos"],
  },
  {
    icon: DraftingCompass,
    keywords: [
      "engenharia civil",
      "construcao civil",
      "edificacoes",
      "estruturas",
      "concreto",
      "hidraulica",
      "topografia",
      "saneamento",
      "urbanismo",
      "desenho tecnico",
      "arquitetura",
    ],
  },
  {
    icon: Wrench,
    keywords: ["engenharia", "mecanica dos solidos", "resistencia dos materiais", "eletrica", "eletronica"],
  },
  {
    icon: Wheat,
    keywords: ["agronomia", "agricultura", "zootecnia", "agronegocio", "solo", "culturas"],
  },
  {
    icon: Utensils,
    keywords: ["nutricao", "alimentos", "dietetica", "gastronomia"],
  },
  {
    icon: Leaf,
    keywords: ["ambiental", "meio ambiente", "sustentabilidade", "sustentavel", "reciclagem"],
  },
  {
    icon: Languages,
    keywords: ["ingles", "espanhol", "portugues", "redacao", "literatura", "linguistica", "idiomas", "leitura"],
  },
  {
    icon: Landmark,
    keywords: ["historia", "filosofia", "sociologia", "antropologia", "politica", "geografia", "cidadania"],
  },
  {
    icon: GraduationCap,
    keywords: ["educacao", "pedagogia", "didatica", "ensino", "docencia", "aprendizagem"],
  },
  {
    icon: Palette,
    keywords: ["design", "arte", "artes", "fotografia", "audiovisual", "publicidade", "criatividade", "cultura"],
  },
  {
    icon: Music,
    keywords: ["musica", "musicalizacao", "canto", "instrumento"],
  },
  {
    icon: Globe,
    keywords: ["globalizacao", "geopolitica", "relacoes internacionais", "comercio exterior"],
  },
  {
    icon: Blocks,
    keywords: ["logica", "raciocinio logico", "matematica discreta", "discreta"],
  },
];

/** Lowercase and strip diacritics so "Cálculo" matches "calculo". */
export function normalizeSubjectKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Best-effort domain icon for a module name. Returns `null` when nothing
 * matches, so the caller falls back to the monogram.
 */
export function subjectIcon(moduleName: string | null | undefined): LucideIcon | null {
  const haystack = normalizeSubjectKey(moduleName ?? "");
  if (!haystack) return null;
  const padded = ` ${haystack} `;

  let best: { icon: LucideIcon; length: number } | null = null;
  for (const rule of SUBJECT_ICON_RULES) {
    for (const raw of rule.keywords) {
      const keyword = normalizeSubjectKey(raw);
      if (!keyword) continue;
      if (!padded.includes(` ${keyword} `)) continue;
      if (!best || keyword.length > best.length) best = { icon: rule.icon, length: keyword.length };
    }
  }
  return best?.icon ?? null;
}

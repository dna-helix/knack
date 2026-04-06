import rawPackIndex from "@/data/sets/index.json";
import { Question } from "@/lib/types";

export type PackSourceType = "local" | "qbreader";

export interface PackDefinition {
  id: string;
  title: string;
  focus: string;
  audience?: string;
  questionCount: number;
  difficulty: string;
  difficultyLevel?: number;
  sourceType?: PackSourceType;
  file?: string;
  qbreaderSetName?: string;
  sourceUrl?: string;
}

export const packCatalog = rawPackIndex as PackDefinition[];

export function getPackById(packId?: string | null): PackDefinition | undefined {
  if (!packId) return undefined;
  return packCatalog.find((pack) => pack.id === packId);
}

export function getPackDifficultyLevel(pack: Pick<PackDefinition, "difficulty" | "difficultyLevel">): number {
  if (pack.difficultyLevel && pack.difficultyLevel >= 1 && pack.difficultyLevel <= 4) {
    return pack.difficultyLevel;
  }

  switch (pack.difficulty.toLowerCase()) {
    case "novice":
      return 1;
    case "regular":
    case "moderate":
      return 2;
    case "hard":
      return 3;
    case "very hard":
      return 4;
    default:
      return 2;
  }
}

interface QbreaderTossup {
  _id: string;
  category?: string;
  subcategory?: string;
  alternate_subcategory?: string;
  question?: string;
  question_sanitized?: string;
  answer: string;
}

interface QbreaderPacketResponse {
  tossups: QbreaderTossup[];
}

interface NumPacketsResponse {
  numPackets: number;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function normalizeQuestionText(rawQuestion: string): { question: string; powerIndex: number } {
  const tokens = rawQuestion.trim().match(/\S+/g) || [];
  const cleanedTokens: string[] = [];
  let powerIndex = 500;

  for (const token of tokens) {
    const hasPowerMarker = token.includes("(*)");
    const cleanedToken = token.replace(/\(\*\)/g, "");

    if (hasPowerMarker && powerIndex === 500) {
      powerIndex = cleanedTokens.length;
    }

    if (cleanedToken) {
      cleanedTokens.push(cleanedToken);
    }
  }

  return {
    question: cleanedTokens.join(" ").replace(/\s+/g, " ").trim(),
    powerIndex,
  };
}

function mapTossupToQuestion(tossup: QbreaderTossup): Question {
  const rawQuestion = tossup.question_sanitized || stripTags(tossup.question || "");
  const { question, powerIndex } = normalizeQuestionText(rawQuestion);

  return {
    id: tossup._id,
    category: tossup.category || "Mixed",
    subcategory: tossup.subcategory || tossup.alternate_subcategory,
    question,
    answer: tossup.answer,
    power_index: powerIndex,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function loadRemotePackQuestions(setName: string): Promise<Question[]> {
  const numPacketsUrl = new URL("https://www.qbreader.org/api/num-packets");
  numPacketsUrl.searchParams.set("setName", setName);

  const { numPackets } = await fetchJson<NumPacketsResponse>(numPacketsUrl.toString());

  const packetResponses = await Promise.all(
    Array.from({ length: numPackets }, async (_, index) => {
      const packetUrl = new URL("https://www.qbreader.org/api/packet");
      packetUrl.searchParams.set("setName", setName);
      packetUrl.searchParams.set("packetNumber", String(index + 1));
      packetUrl.searchParams.set("questionTypes", "tossups");
      return fetchJson<QbreaderPacketResponse>(packetUrl.toString());
    }),
  );

  return packetResponses
    .flatMap((packet) => packet.tossups)
    .map(mapTossupToQuestion);
}

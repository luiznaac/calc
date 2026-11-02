import type { CalculateInput, CalculateOutcome, Problem } from "./types";

export type { CalculateInput };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toProblem(value: unknown, status: number): Problem | null {
  if (!isRecord(value)) {
    return null;
  }
  const code = readString(value.code);
  if (code === undefined) {
    return null;
  }
  return {
    code,
    title: readString(value.title) ?? code,
    status,
    type: readString(value.type),
    detail: readString(value.detail),
    field: readString(value.field),
    instance: readString(value.instance),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function networkProblem(detail: string, status?: number): Problem {
  return {
    code: "NETWORK_ERROR",
    title: "Network error",
    detail,
    status,
  };
}

export async function calculate(input: CalculateInput): Promise<CalculateOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/v1/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The request could not be completed.";
    return { ok: false, problem: networkProblem(detail) };
  }

  if (!response.ok) {
    const problem = toProblem(await readJson(response), response.status);
    return {
      ok: false,
      problem:
        problem ?? networkProblem(`Unexpected response (${response.status}).`, response.status),
    };
  }

  const value = await readJson(response);
  if (isRecord(value) && typeof value.result === "number" && Number.isFinite(value.result)) {
    return { ok: true, result: value.result };
  }
  return { ok: false, problem: networkProblem("The server returned an unexpected response.") };
}

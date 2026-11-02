import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { calculate } from "./api";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("calculate", () => {
  it("sends one canonical operation and returns the result", async () => {
    let received: unknown = null;
    server.use(
      http.post("/api/v1/calculate", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ result: 3 });
      }),
    );

    const outcome = await calculate({ operation: "add", operands: [1, 2] });

    expect(received).toEqual({ operation: "add", operands: [1, 2] });
    expect(outcome).toEqual({ ok: true, result: 3 });
  });

  it("parses an RFC 9457 problem response", async () => {
    server.use(
      http.post("/api/v1/calculate", () =>
        HttpResponse.json(
          {
            type: "https://calc.example/problems/division-by-zero",
            title: "Division by zero",
            status: 422,
            detail: "The divisor evaluated to zero.",
            code: "DIVISION_BY_ZERO",
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const outcome = await calculate({ operation: "divide", operands: [1, 0] });

    expect(outcome).toEqual({
      ok: false,
      problem: {
        type: "https://calc.example/problems/division-by-zero",
        title: "Division by zero",
        status: 422,
        detail: "The divisor evaluated to zero.",
        code: "DIVISION_BY_ZERO",
      },
    });
  });

  it("keeps a field pointer from a problem response", async () => {
    server.use(
      http.post("/api/v1/calculate", () =>
        HttpResponse.json(
          {
            title: "Invalid operand type",
            status: 400,
            code: "INVALID_OPERAND_TYPE",
            field: "/operands/1",
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const outcome = await calculate({ operation: "add", operands: [1, 2] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problem.code).toBe("INVALID_OPERAND_TYPE");
      expect(outcome.problem.field).toBe("/operands/1");
    }
  });

  it("turns a non-problem error response into NETWORK_ERROR", async () => {
    server.use(
      http.post("/api/v1/calculate", () => HttpResponse.text("bad gateway", { status: 502 })),
    );

    const outcome = await calculate({ operation: "add", operands: [1, 2] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problem.code).toBe("NETWORK_ERROR");
      expect(outcome.problem.status).toBe(502);
    }
  });

  it("turns a malformed success body into NETWORK_ERROR", async () => {
    server.use(http.post("/api/v1/calculate", () => HttpResponse.json({ nope: true })));

    const outcome = await calculate({ operation: "add", operands: [1, 2] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problem.code).toBe("NETWORK_ERROR");
    }
  });

  it.each([
    ["INVALID_JSON", 400],
    ["MISSING_FIELD", 400],
    ["UNKNOWN_OPERATION", 400],
    ["INVALID_ARITY", 400],
    ["INVALID_OPERAND_TYPE", 400],
    ["UNSUPPORTED_MEDIA_TYPE", 415],
    ["CONTENT_TOO_LARGE", 413],
    ["DIVISION_BY_ZERO", 422],
    ["SQRT_OF_NEGATIVE", 422],
    ["COMPLEX_RESULT", 422],
    ["INDETERMINATE", 422],
    ["OVERFLOW", 422],
    ["INVALID_NUMBER", 422],
    ["NOT_FOUND", 404],
    ["METHOD_NOT_ALLOWED", 405],
    ["INTERNAL_ERROR", 500],
  ])("parses the %s problem", async (code, status) => {
    server.use(
      http.post("/api/v1/calculate", () =>
        HttpResponse.json(
          { title: code, status, code },
          { status, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const outcome = await calculate({ operation: "add", operands: [1, 2] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problem.code).toBe(code);
      expect(outcome.problem.status).toBe(status);
    }
  });

  it("turns a transport failure into NETWORK_ERROR", async () => {
    server.use(http.post("/api/v1/calculate", () => HttpResponse.error()));

    const outcome = await calculate({ operation: "add", operands: [1, 2] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problem.code).toBe("NETWORK_ERROR");
      expect(outcome.problem.detail).toBeTruthy();
    }
  });
});

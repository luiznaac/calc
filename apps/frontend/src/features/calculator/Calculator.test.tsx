import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCalculate } from "../../test/fake-api";
import type { FakeCall } from "../../test/fake-api";
import { Calculator } from "./Calculator";

const server = setupServer();
const requests: FakeCall[] = [];

function problemResponse(outcome: Extract<ReturnType<typeof fakeCalculate>, { ok: false }>) {
  const { status, code, title, detail } = outcome.problem;
  return HttpResponse.json(
    {
      type: `https://calc.example/problems/${code.toLowerCase().replaceAll("_", "-")}`,
      title,
      status,
      detail,
      code,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function useDefaultHandler(): void {
  server.use(
    http.post("/api/v1/calculate", async ({ request }) => {
      const body = (await request.json()) as FakeCall;
      requests.push(body);
      const outcome = fakeCalculate(body);
      return outcome.ok ? HttpResponse.json({ result: outcome.result }) : problemResponse(outcome);
    }),
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  requests.length = 0;
  useDefaultHandler();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function result(): HTMLElement {
  return screen.getByRole("status", { name: "Result" });
}

function expression(): HTMLElement {
  return screen.getByLabelText("Expression");
}

function key(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("Calculator", () => {
  it("renders every required test hook", () => {
    render(<Calculator />);

    expect(result()).toHaveTextContent("0");
    expect(expression()).toHaveTextContent("");
    expect(screen.getByRole("region", { name: "Calculation tape" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const keys = [
      ...Array.from({ length: 10 }, (_, digit) => `key-${digit}`),
      "key-dot",
      "key-add",
      "key-subtract",
      "key-multiply",
      "key-divide",
      "key-power",
      "key-sqrt",
      "key-sign",
      "key-percent",
      "key-equals",
      "key-ac",
      "key-backspace",
    ];
    for (const testId of keys) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it("focuses the root on mount", () => {
    render(<Calculator />);
    expect(screen.getByRole("region", { name: "Calculator" })).toHaveFocus();
  });

  it("sends one request for 1 + 2 = and displays 3", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard("1+2{Enter}");

    await waitFor(() => expect(result()).toHaveTextContent("3"));
    expect(requests).toEqual([{ operation: "add", operands: [1, 2] }]);
    expect(expression()).toHaveTextContent("1 + 2 =");
  });

  it("sends the contextual percent operands", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard("200+10%{Enter}");

    await waitFor(() => expect(result()).toHaveTextContent("220"));
    expect(requests).toEqual([{ operation: "add", operands: [200, 20] }]);
  });

  it("marks the root busy during a request and ignores keys", async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("/api/v1/calculate", async ({ request }) => {
        requests.push((await request.json()) as FakeCall);
        await gate;
        return HttpResponse.json({ result: 3 });
      }),
    );
    render(<Calculator />);

    await user.keyboard("1+2{Enter}");
    await waitFor(() => expect(requests).toHaveLength(1));

    const root = screen.getByRole("region", { name: "Calculator" });
    expect(root).toHaveAttribute("aria-busy", "true");

    await user.keyboard("7{Escape}");
    expect(result()).toHaveTextContent("2");
    expect(requests).toHaveLength(1);

    release();
    await waitFor(() => expect(root).toHaveAttribute("aria-busy", "false"));
    await waitFor(() => expect(result()).toHaveTextContent("3"));
  });

  it("shows a problem from the API in an alert panel", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/calculate", async ({ request }) => {
        requests.push((await request.json()) as FakeCall);
        return HttpResponse.json(
          {
            type: "https://calc.example/problems/division-by-zero",
            title: "Division by zero",
            status: 422,
            detail: "The divisor evaluated to zero.",
            code: "DIVISION_BY_ZERO",
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } },
        );
      }),
    );
    render(<Calculator />);

    await user.keyboard("1/0{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Division by zero");
    expect(alert).toHaveTextContent("The divisor evaluated to zero.");
    expect(result()).toHaveTextContent("DIVISION_BY_ZERO");
    expect(expression()).toHaveTextContent("1 ÷ 0 =");
    expect(requests).toEqual([{ operation: "divide", operands: [1, 0] }]);

    await user.click(key("All clear"));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("issues a new request after AC instead of reusing a request id", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard("2+3{Enter}");
    await waitFor(() => expect(result()).toHaveTextContent("5"));

    await user.click(key("All clear"));
    screen.getByRole("region", { name: "Calculator" }).focus();
    await user.keyboard("1+2{Enter}");

    await waitFor(() => expect(result()).toHaveTextContent("3"));
    expect(requests).toEqual([
      { operation: "add", operands: [2, 3] },
      { operation: "add", operands: [1, 2] },
    ]);
  });

  it("activates a focused key once on Enter without a double action", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.click(key("1"));
    await user.click(key("Add"));
    await user.click(key("2"));
    key("Equals").focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(result()).toHaveTextContent("3"));
    expect(requests).toHaveLength(1);
  });

  it("uses the backspace and power hooks", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.click(key("1"));
    await user.click(key("2"));
    await user.click(key("Backspace"));
    expect(result()).toHaveTextContent("1");

    await user.click(key("All clear"));
    await user.click(key("2"));
    await user.click(key("Power"));
    await user.click(key("3"));
    await user.click(key("Equals"));

    await waitFor(() => expect(result()).toHaveTextContent("8"));
    expect(requests).toEqual([{ operation: "power", operands: [2, 3] }]);
  });

  it("does not intercept Tab", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    const root = screen.getByRole("region", { name: "Calculator" });
    expect(root).toHaveFocus();

    await user.tab();

    expect(root).not.toHaveFocus();
    expect(result()).toHaveTextContent("0");
    expect(requests).toHaveLength(0);
  });

  it("keeps shortcuts scoped to the calculator", async () => {
    const user = userEvent.setup();
    const outside = document.createElement("input");
    document.body.append(outside);
    render(<Calculator />);

    outside.focus();
    await user.keyboard("5");
    expect(result()).toHaveTextContent("0");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "6", bubbles: true }));
    expect(result()).toHaveTextContent("0");

    screen.getByRole("region", { name: "Calculator" }).focus();
    await user.keyboard("5");
    expect(result()).toHaveTextContent("5");

    outside.remove();
  });

  it("records completed calculations on the tape", async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await user.keyboard("2+3{Enter}");
    await waitFor(() => expect(result()).toHaveTextContent("5"));

    const tape = screen.getByRole("region", { name: "Calculation tape" });
    expect(tape).toHaveTextContent("2 + 3 =");
    expect(tape).toHaveTextContent("5");
  });
});

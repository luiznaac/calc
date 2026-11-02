import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Tape } from "./Tape";

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

function expectScrolledIntoView(expression: string): void {
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  const row = screen
    .getAllByRole("listitem")
    .find((item) => item.textContent?.includes(expression));
  expect(row).toBe(scrollIntoView.mock.instances[0]);
}

describe("Tape", () => {
  it("renders a focusable list named Tape entries", () => {
    render(<Tape entries={[{ expression: "2 + 3 =", result: "5" }]} />);

    const list = screen.getByRole("list", { name: "Tape entries" });
    expect(list).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("2 + 3 =")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("scrolls the newest entry into view when it lands", () => {
    const { rerender } = render(<Tape entries={[{ expression: "2 + 3 =", result: "5" }]} />);
    scrollIntoView.mockClear();

    rerender(
      <Tape
        entries={[
          { expression: "2 + 3 =", result: "5" },
          { expression: "5 + 4 =", result: "9" },
        ]}
      />,
    );

    expectScrolledIntoView("5 + 4 =");
  });

  it("scrolls when a new entry replaces the oldest at the cap", () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      expression: `${index + 1} + 1 =`,
      result: `${index + 2}`,
    }));
    const { rerender } = render(<Tape entries={entries} />);
    scrollIntoView.mockClear();

    rerender(<Tape entries={[...entries.slice(1), { expression: "11 + 1 =", result: "12" }]} />);

    expectScrolledIntoView("11 + 1 =");
  });
});

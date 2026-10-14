import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHomePage } from "./StudioHomePage";

afterEach(() => vi.unstubAllGlobals());

const course = {
  id: 3,
  school: 1,
  schoolName: "Rubavu Demo Technical School",
  title: "Solar installation",
  slug: "solar",
  trade: "Electrical",
  description: "",
  modules: [],
  competencies: [
    { id: 9, code: "SOL-01", title: "Isolate a PV array", description: "", masteryThreshold: 80 },
  ],
  lessonCount: 2,
};

function lesson(id: number, title: string, status: string, reviewNotes = "") {
  return {
    id,
    course: 3,
    courseTitle: "Solar installation",
    module: null,
    title,
    slug: title.toLowerCase(),
    summary: "",
    objectives: [],
    safetyNotes: [],
    estimatedMinutes: 30,
    language: "en",
    competencies: [9],
    status,
    contentVersion: 1,
    authoredBy: 1,
    authorName: "Aline Uwase",
    reviewNotes,
    submittedAt: null,
    publishedAt: null,
    scenarios: [],
    updated_at: "2026-10-13T10:00:00Z",
  };
}

function stubStudio(lessons: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/content/courses/")
        ? [course]
        : { count: lessons.length, next: null, previous: null, results: lessons };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StudioHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudioHomePage", () => {
  it("groups lessons by status and flags lessons returned for revision", async () => {
    stubStudio([
      lesson(1, "Isolate a PV array", "draft", "Add the lock-out step."),
      lesson(2, "Measure string voltage", "published"),
    ]);
    renderPage();

    const returned = await screen.findByRole("link", { name: /Isolate a PV array/ });
    expect(within(returned).getByText("Returned for revision")).toBeVisible();
    expect(screen.getByText("1 lesson was returned for revision")).toBeVisible();
    expect(screen.getByRole("link", { name: /Measure string voltage/ })).toHaveAttribute(
      "href",
      "/authoring/lessons/2",
    );
    expect(screen.getAllByRole("link", { name: "New lesson" })[0]).toHaveAttribute(
      "href",
      "/authoring/lessons/new",
    );
  });

  it("explains the first step when nothing has been written yet", async () => {
    stubStudio([]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "No lessons yet" })).toBeVisible();
    expect(screen.getByText("Solar installation")).toBeVisible();
  });
});

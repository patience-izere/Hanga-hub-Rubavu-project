import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SimulationPage } from "./SimulationPage";

vi.mock("../components/simulation/BatteryWorkshopScene", () => ({
  BatteryWorkshopScene: () => <div data-testid="workshop-scene" />,
}));

afterEach(() => vi.unstubAllGlobals());

describe("SimulationPage", () => {
  it("provides an accessible equivalent for a guided 3D action", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/attempts/4/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 4,
              status: "in_progress",
              score: null,
              resume_state: {},
              started_at: "2026-07-17T08:00:00Z",
              completed_at: null,
              updated_at: "2026-07-17T08:00:00Z",
              events: [
                {
                  sequence: 1,
                  event_type: "attempt_started",
                  payload: {},
                  occurred_at: "2026-07-17T08:00:00Z",
                },
              ],
              assignment: {
                id: 2,
                due_at: null,
                created_at: "2026-07-17T08:00:00Z",
                latest_attempt: null,
                lesson: {
                  id: 1,
                  title: "Battery Inspection and Diagnosis",
                  slug: "battery-inspection",
                  summary: "Diagnose safely.",
                  objectives: [],
                  safety_notes: [],
                  estimated_minutes: 25,
                  course_title: "Automotive Electrical Foundations",
                  trade: "Automobile Technology",
                  competencies: [],
                  procedure_steps: [
                    {
                      id: 1,
                      order: 1,
                      code: "ppe",
                      title: "Put on eye protection",
                      instruction: "Select the safety glasses.",
                      action_code: "confirm_ppe",
                      feedback: "Eye protection confirmed.",
                      safety_critical: true,
                      points: 10,
                      metadata: {},
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.endsWith("/api/v1/auth/csrf/")) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: "CSRF cookie set." }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.endsWith("/api/v1/attempts/4/actions/") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              correct: true,
              message: "Eye protection confirmed.",
              currentStep: null,
              isReadyToComplete: true,
              attempt: {
                id: 4,
                status: "in_progress",
                score: null,
                resume_state: { completedSteps: ["ppe"], currentStep: null },
                started_at: "2026-07-17T08:00:00Z",
                completed_at: null,
                updated_at: "2026-07-17T08:01:00Z",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/attempts/4"]}>
          <Routes>
            <Route path="/attempts/:attemptId" element={<SimulationPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Battery Inspection and Diagnosis" }),
    ).toBeVisible();
    expect(screen.getByTestId("workshop-scene")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /put on eye protection/i }));
    expect(await screen.findByText("Eye protection confirmed.")).toBeVisible();
    const actionRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/actions/"));
    expect(JSON.parse(String(actionRequest?.[1]?.body))).toEqual({
      action: "confirm_ppe",
      metadata: { source: "accessible-controls" },
    });
  });
});

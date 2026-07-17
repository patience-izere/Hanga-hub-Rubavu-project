import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("renders the public value proposition for a signed-out visitor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: /practise the procedure/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /enter the platform/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("keeps the platform information pages public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/features"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: /virtual lab designed around the complete learning attempt/i,
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /enter the platform/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows a learner's assigned competency lesson", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/auth/me/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: {
                  id: 2,
                  email: "learner@opedu.local",
                  username: "learner@opedu.local",
                  firstName: "Demo",
                  lastName: "Learner",
                  organization: "Rubavu Demo Technical School",
                  isStaff: false,
                  roles: ["learner"],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [
                {
                  id: 1,
                  due_at: null,
                  created_at: "2026-07-17T08:00:00Z",
                  latest_attempt: null,
                  lesson: {
                    id: 1,
                    title: "Battery Inspection and Diagnosis",
                    slug: "battery-inspection-and-diagnosis",
                    summary: "Prepare, inspect, and diagnose a vehicle battery.",
                    objectives: ["Identify battery hazards."],
                    safety_notes: ["Wear eye protection."],
                    estimated_minutes: 25,
                    course_title: "Automotive Electrical Foundations",
                    trade: "Automobile Technology",
                    competencies: [
                      {
                        id: 1,
                        code: "AUTO-SAFE-01",
                        title: "Prepare safely",
                        description: "Identify hazards.",
                        mastery_threshold: 100,
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Battery Inspection and Diagnosis" }),
    ).toBeVisible();
    expect(screen.getByText("Automotive Electrical Foundations")).toBeVisible();
  });

  it("shows school-scoped attempt evidence to an instructor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/auth/me/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: {
                  id: 1,
                  email: "instructor@opedu.local",
                  username: "instructor@opedu.local",
                  firstName: "Demo",
                  lastName: "Instructor",
                  organization: "Rubavu Demo Technical School",
                  isStaff: true,
                  roles: ["instructor"],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("/api/v1/instructor/overview/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                metrics: {
                  learners: 1,
                  assignments: 1,
                  attempts: 1,
                  completedAttempts: 0,
                  inProgressAttempts: 1,
                  safetyErrors: 1,
                },
                attempts: [
                  {
                    id: 7,
                    learner: { id: 2, name: "Demo Learner", email: "learner@opedu.local" },
                    lesson: {
                      id: 1,
                      title: "Battery Inspection and Diagnosis",
                      courseTitle: "Automotive Electrical Foundations",
                      trade: "Automobile Technology",
                    },
                    status: "in_progress",
                    score: null,
                    completed_steps: 2,
                    total_steps: 7,
                    incorrect_actions: 1,
                    safety_errors: 1,
                    started_at: "2026-07-17T08:00:00Z",
                    completed_at: null,
                    updated_at: "2026-07-17T08:05:00Z",
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: /workshop progress at a glance/i }),
    ).toBeVisible();
    expect(await screen.findByText("Demo Learner")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review evidence" })).toHaveAttribute(
      "href",
      "/instructor/attempts/7",
    );
    expect(screen.queryByText("My learning")).not.toBeInTheDocument();
  });
});

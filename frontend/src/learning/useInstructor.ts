import { useQuery } from "@tanstack/react-query";

import { getInstructorAttempt, getInstructorOverview } from "../api/instructor";

export const instructorOverviewKey = ["learning", "instructor", "overview"] as const;

export function useInstructorOverview() {
  return useQuery({ queryKey: instructorOverviewKey, queryFn: getInstructorOverview });
}

export function useInstructorAttempt(id: number) {
  return useQuery({
    queryKey: ["learning", "instructor", "attempts", id],
    queryFn: () => getInstructorAttempt(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

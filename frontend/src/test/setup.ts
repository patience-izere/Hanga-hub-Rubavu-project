import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// The signed-in shell and pages load on demand; on a busy CI runner that can take more than the
// default one second, which made workspace tests fail at random.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

import { describe, expect, it } from "vitest";

import { en } from "../i18n/messages";
import { fr } from "../i18n/messages.fr";
import { sw } from "../i18n/messages.sw";
import { resolvedSteps, variantsOf } from "./variants";

const definition = {
  steps: [
    {
      order: 1,
      code: "read",
      title: "Read",
      action_code: "read_voltage",
      metadata: { unit: "V", reading: 12.6 },
    },
    {
      order: 2,
      code: "decide",
      title: "Decide",
      action_code: "choose_ok",
      choices: [
        { action_code: "choose_ok", label: "OK" },
        { action_code: "choose_low", label: "Low" },
      ],
    },
  ],
  variants: [
    {
      code: "low",
      label: "Low charge",
      steps: {
        read: { metadata: { reading: 12.1 } },
        decide: { action_code: "choose_low", code: "renamed", order: 9 },
      },
    },
    { label: "no code" },
  ],
};

describe("resolvedSteps", () => {
  it("applies a fault case over the base steps without renaming or reordering them", () => {
    const steps = resolvedSteps(definition, "low");
    expect(steps[0].metadata).toEqual({ unit: "V", reading: 12.1 });
    expect(steps[1].action_code).toBe("choose_low");
    expect(steps[1].code).toBe("decide");
    expect(steps[1].order).toBe(2);
    expect(steps[1].choices).toHaveLength(2);
  });

  it("keeps the base steps for no case or an unknown one, and ignores cases without a code", () => {
    expect(resolvedSteps(definition)[1].action_code).toBe("choose_ok");
    expect(resolvedSteps(definition, "missing")[0].metadata.reading).toBe(12.6);
    expect(variantsOf(definition).map((item) => item.code)).toEqual(["low"]);
  });
});

describe("translations", () => {
  const keys = Object.keys(en) as Array<keyof typeof en>;
  it.each([
    ["French", fr],
    ["Swahili", sw],
  ])("%s covers every interface string with the same placeholders", (_name, catalogue) => {
    for (const key of keys) {
      expect(catalogue[key], key).toBeTruthy();
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(catalogue[key]!), key).toEqual(placeholders(en[key]));
    }
  });
});

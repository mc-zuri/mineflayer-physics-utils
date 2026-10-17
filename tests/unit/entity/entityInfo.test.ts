import { describe, it } from "mocha";
import expect from "expect";
import md from "minecraft-data";
import entityInfo from "../../../src/physics/info/entityInfo.json";

// entityInfo.json is the 1.17 - 1.18 entity list: every entity's size as vanilla's EntityType.sized gives it there
// (minecraft-data 1.18.2, checked against the 1.18.2 jar)
describe("entityInfo", () => {
  it("has each entity's vanilla 1.18 width and height", () => {
    const vanilla = md("1.18.2").entitiesByName;
    const wrong = Object.values(entityInfo as Record<string, { name: string; width: number; height: number }>)
      .filter((e) => !vanilla[e.name] || vanilla[e.name].width !== e.width || vanilla[e.name].height !== e.height)
      .map((e) => `${e.name} ${e.width} x ${e.height}`);
    expect(wrong).toEqual([]);
  });

  it("has the horse family, the hoglin and the zoglin 1.3964844F wide", () => {
    const info = entityInfo as Record<string, { width: number }>;
    for (const name of ["horse", "donkey", "mule", "skeleton_horse", "zombie_horse", "hoglin", "zoglin"]) {
      expect(info[name].width).toBe(1.3964844);
    }
  });
});

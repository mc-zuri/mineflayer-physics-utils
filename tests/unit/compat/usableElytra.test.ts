import { describe, it } from "mocha";
import expect from "expect";
import md from "minecraft-data";
import { isUsableElytraItem } from "../../../src/util/physicsUtils";

// ElytraItem.isFlyEnabled: an elytra glides while its damage is below its max damage (432) - 1
describe("usable elytra", () => {
  for (const version of ["1.20.4", "1.20.6", "1.21.1"]) {
    it(`flies with a new elytra whatever max durability the data lists (${version})`, () => {
      // a new elytra as prismarine-item makes it: the data's max durability (1 in minecraft-data 1.20.6), none used
      const { maxDurability } = md(version).itemsByName.elytra as { maxDurability?: number };
      expect(isUsableElytraItem({ name: "elytra", durabilityUsed: 0, maxDurability } as any)).toBe(true);
    });
  }

  it("stops flying at 431 damage", () => {
    expect(isUsableElytraItem({ name: "elytra", durabilityUsed: 430 })).toBe(true);
    expect(isUsableElytraItem({ name: "elytra", durabilityUsed: 431 })).toBe(false);
  });
});

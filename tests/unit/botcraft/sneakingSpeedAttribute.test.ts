import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// q_swift_sneak_3: a vanilla client walks forward sneaking on stone, facing south, in Swift Sneak III leggings. Its
// second tick is the first crouched one: from the recorded state after the first tick, the input is slowed by
// 0.3F + 3 * 0.15F (1.19 - 1.20 from the enchantment level, 1.21+ the sneaking speed attribute with the
// enchantment's modifier, through getAttributeValue).
function crouchedTick(version: string, setUp: (rig: ReturnType<typeof createBotcraftPlayerRig>) => void) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.59800000336766), groundLevel });
  rig.playerState.vel.set(0, -0.0784000015258789, 0.053508008053839436);
  rig.playerState.yawDegrees = 0;
  Object.assign(rig.playerState.control, { forward: true, sneak: true });
  rig.playerState.prevControl.sneak = true;
  setUp(rig);

  rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

  expect(rig.playerState.pos.z).toBe(38.725008013947246);
  expect(rig.playerState.vel.z).toBe(0.06934638183121856);
}

const swiftSneakModifier = {
  uuid: "minecraft:enchantment.swift_sneak/legs",
  amount: 0.45000001788139343,
  operation: 0,
};

describe("Botcraft sneaking speed attribute", () => {
  it("slows a crouched walk by the Swift Sneak level (1.20.6)", () => {
    crouchedTick("1.20.6", (rig) => {
      rig.playerState.swiftSneak = 3;
    });
  });

  // the attribute is player.sneaking_speed on 1.21 - 1.21.1, sneaking_speed since
  for (const [version, key] of [
    ["1.21.1", "minecraft:player.sneaking_speed"],
    ["1.21.11", "minecraft:sneaking_speed"],
  ]) {
    it(`slows a crouched walk by the synced sneaking speed with its modifiers (${version})`, () => {
      crouchedTick(version, (rig) => {
        rig.playerState.attributes[key] = { value: 0.3, modifiers: [swiftSneakModifier] } as any;
      });
    });
  }
});

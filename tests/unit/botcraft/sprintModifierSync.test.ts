import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// q_soul_speed_1_sprint_soul_sand, tick 2: a vanilla client sprints east on soul sand in Soul Speed I boots. On 1.20.6
// the server's movement speed sync that tick (the soul speed modifier renewed) lacks the sprint modifier, and the
// client goes on sprinting without it until its next setSprinting: LivingEntity.getSpeed reads the attribute as it
// is. On 1.20.4 the sync still carries it.
const SPRINTING = "662a6b8d-da3e-4c1c-8813-96ea6097278d";
const SOUL_SPEED = "87f46a96-686f-4796-b035-22e16ee9e038";

function sprintOnSoulSand(version: string, modifiers: { uuid: string; amount: number; operation: number }[]) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.6789970033435822, 100.875, 1173.5), groundLevel: 100.875 });
  const world = createFlatWorld(version, 100) as any;
  for (let x = -2; x <= 4; x++) {
    for (let z = 1172; z <= 1174; z++) world.setOverrideBlock(new Vec3(x, 100, z), rig.mcData.blocksByName.soul_sand.id);
  }
  rig.playerState.attributes = { [rig.physics.movementSpeedAttribute]: { value: 0.10000000149011612, modifiers } } as any;
  rig.playerState.soulSpeed = 1;
  rig.playerState.vel.set(0.09773237517746804, -0.0784000015258789, 0);
  rig.playerState.onGround = true;
  rig.playerState.sprinting = true;
  rig.playerState.yawDegrees = 270;
  Object.assign(rig.playerState.control, { forward: true, sprint: true });

  rig.physics.simulate(rig.playerCtx, world);
  return rig.playerState;
}

describe("Botcraft sprint modifier as synced", () => {
  it("sprints without the modifier a sync dropped (1.20.6)", () => {
    const state = sprintOnSoulSand("1.20.6", [{ uuid: SOUL_SPEED, amount: 0.04050000011920929, operation: 0 }]);

    expect(state.sprinting).toBe(true);
    expect(state.pos.x).toBe(0.9144193900795831);
    expect(state.vel.x).toBe(0.12854063808818936);
  });

  it("sprints with the modifier the sync kept (1.20.4)", () => {
    const state = sprintOnSoulSand("1.20.4", [
      { uuid: SPRINTING, amount: 0.30000001192092896, operation: 2 },
      { uuid: SOUL_SPEED, amount: 0.04050000011920929, operation: 0 },
    ]);

    expect(state.pos.x).toBe(0.9557263818646323);
    expect(state.vel.x).toBe(0.1510942582224885);
  });
});

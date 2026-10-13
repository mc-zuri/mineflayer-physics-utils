import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;
const SPRINTING = "662a6b8d-da3e-4c1c-8813-96ea6097278d";
const SPEED = "91aeaa56-376b-4498-935b-2f7f68070635";

// e_speed_1_sprint tick 3 (1.12.2): a vanilla client with Speed I sprints south on stone. The server has synced the
// movement speed with its sprint modifier first, the effect's second. AttributeInstance.removeModifier takes out the
// sprint modifier alone; the speed modifier after it stays.
describe("Botcraft sprint modifier replacement", () => {
  it("keeps the synced modifiers after the sprint one (1.12.2)", () => {
    const version = "1.12.2";
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.88923244688894), groundLevel });
    rig.playerState.attributes = {
      [rig.physics.movementSpeedAttribute]: {
        value: 0.10000000149011612,
        modifiers: [
          { uuid: SPRINTING, amount: 0.30000001192092896, operation: 2 },
          { uuid: SPEED, amount: 0.20000000298023224, operation: 2 },
        ],
      },
    } as any;
    rig.playerState.vel.set(0, -0.0784000015258789, 0.12904846017072977);
    rig.playerState.onGround = true;
    rig.playerState.sprinting = true;
    rig.playerState.yawDegrees = 0;
    rig.playerState.control.forward = true;
    rig.playerState.control.sprint = true;

    rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

    expect(rig.playerState.pos.z).toBe(39.17116089024639);
    expect(rig.playerState.vel.z).toBe(0.15393294795288495);
  });
});

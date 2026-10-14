import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Before 1.13 Entity.handleWaterMovement looks for water in the box shrunk by 0.4F vertically (and 0.001 all round):
// a player falling into water is in it only once that box reaches the water, about 0.4 later than the 1.13+ fluid
// height test of the whole box.
// Recorded as b_water_surface_idle: falling from y 100.92 into a pool of still water topped at 100.89, ticks 3 - 4.
const recorded: { version: string; ticks: { inWater: boolean; y: number; velY: number }[] }[] = [
  {
    version: "1.12.2",
    ticks: [
      { inWater: false, y: 100.76636799395752, velY: -0.230527368912964 },
      { inWater: true, y: 100.53584062504456, velY: -0.30431682745754424 },
    ],
  },
  {
    version: "1.13.2",
    ticks: [
      { inWater: true, y: 100.76636799395752, velY: -0.230527368912964 },
      { inWater: true, y: 100.53584062504456, velY: -0.18942189787847158 },
    ],
  },
];

describe("Botcraft water before 1.13", () => {
  for (const { version, ticks } of recorded) {
    it(`finds water in the box shrunk by 0.4 ${version < "1.13" ? "" : "only before 1.13 "}(${version}, b_water_surface_idle)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(4.5, 100.92159999847412, 1833.5), groundLevel: 99 });
      const world = createFlatWorld(version, 99);
      for (let x = 2; x <= 6; x++) {
        for (let y = 99; y <= 100; y++) {
          for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
        }
      }
      const state = rig.playerState;
      state.vel.set(0, -0.1552320045166016, 0);
      state.onGround = false;

      for (const { inWater, y, velY } of ticks) {
        rig.physics.simulate(rig.playerCtx, world as any);

        expect(state.isInWater).toBe(inWater);
        expect(state.pos.y).toBe(y);
        expect(state.vel.y).toBe(velY);
      }
    });
  }
});

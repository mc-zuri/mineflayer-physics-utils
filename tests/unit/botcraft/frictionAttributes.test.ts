import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const version = "26.3";
const groundLevel = 101;

// 26.2 added the FRICTION_MODIFIER, AIR_DRAG_MODIFIER and BOUNCINESS attributes. LivingEntity.travelInAir modifies the
// block's friction and the 0.91F and 0.98F drags by them (computeModifiedFriction: clamp(1 - (1 - f) * modifier, 0, 1));
// a modified friction of 0.6 or less takes the movement speed as it is. Entity.restituteMovementAfterCollisions bounces
// a landing by the entity's BOUNCINESS.
function rigWith(attributes: Record<string, number>, pos: Vec3, vel: Vec3) {
  const rig = createBotcraftPlayerRig({ version, position: pos, groundLevel });
  const byName = rig.mcData.attributesByName as any;
  rig.playerState.attributes = Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [byName[name].resource, { value, modifiers: [] }]),
  ) as any;
  rig.playerState.vel.set(vel.x, vel.y, vel.z);
  rig.playerState.yawDegrees = 270;
  return rig;
}

function sprintTick(attributes: Record<string, number>, x: number, velX: number, velY: number) {
  const rig = rigWith(attributes, new Vec3(x, groundLevel, 3345.5), new Vec3(velX, velY, 0));
  rig.playerState.onGround = true;
  rig.playerState.lastOnGround = true;
  // already sprinting: the movement speed carries setSprinting's modifier (the recording's attributeModifiers)
  rig.playerState.sprinting = true;
  rig.playerState.attributes[rig.physics.movementSpeedAttribute] = {
    value: 0.10000000149011612,
    modifiers: [{ uuid: rig.playerCtx.worldSettings.sprintingUUID, amount: 0.30000001192092896, operation: 2 }],
  } as any;
  rig.playerState.control.forward = true;
  rig.playerState.control.sprint = true;

  rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

  return { x: rig.playerState.pos.x, velX: rig.playerState.vel.x, velY: rig.playerState.vel.y };
}

describe("Botcraft friction, air drag and bounciness attributes", () => {
  // c_move_friction_modifier_half t2 (26.3 recording): sprinting east on stone with FRICTION_MODIFIER 0.5, the friction
  // 1 - 0.4 * 0.5 = 0.8 keeps more of the motion than stone's 0.6.
  it("keeps more motion with a FRICTION_MODIFIER of 0.5 (c_move_friction_modifier_half t2)", () => {
    expect(sprintTick({ frictionModifier: 0.5 }, 0.5537468832015993, 0.0391277333798443, -0.0784000015258789)).toEqual({
      x: 0.6466214997830428,
      velX: 0.06761272503418132,
      velY: -0.0784000015258789,
    });
  });

  // c_move_friction_modifier_double t2: FRICTION_MODIFIER 1.6 makes the friction 1 - 0.4 * 1.6 = 0.36, which (0.6 or
  // less) takes the movement speed as it is instead of 0.1 * 0.21600002F / f^3.
  it("takes the movement speed as it is at a friction of 0.6 or less (c_move_friction_modifier_double t2)", () => {
    expect(sprintTick({ frictionModifier: 1.6 }, 0.6274000124096872, 0.04173624815382527, -0.0784000015258789)).toEqual({
      x: 0.7965362729731997,
      velX: 0.05540904438838224,
      velY: -0.0784000015258789,
    });
  });

  // c_move_air_drag_modifier_half t2: AIR_DRAG_MODIFIER 0.5 makes the 0.91F drag 0.955 and the vertical 0.98F 0.99, so
  // standing on the ground falls by 0.08 * 0.99 = 0.0792 a tick.
  it("modifies the horizontal and the vertical drag by AIR_DRAG_MODIFIER (c_move_air_drag_modifier_half t2)", () => {
    expect(sprintTick({ airDragModifier: 0.5 }, 0.6274000124096872, 0.07300021646610601, -0.07920000076293945)).toEqual({
      x: 0.8278002412854805,
      velX: 0.11482934586180397,
      velY: -0.07920000076293945,
    });
  });

  // c_move_bounciness_half t16: falling from y 109 onto stone with BOUNCINESS 0.5, the landing bounces up at half the
  // speed (after undoing the gravity and drag the move did not use).
  it("bounces a landing by the BOUNCINESS attribute (c_move_bounciness_half t16)", () => {
    const rig = rigWith({ bounciness: 0.5 }, new Vec3(0.5, 101.44045513047197, 3345.5), new Vec3(0, -1.0248092696844984, 0));

    rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

    expect(rig.playerState.pos.y).toBe(101);
    expect(rig.playerState.onGround).toBe(true);
    expect(rig.playerState.vel.y).toBe(0.4361431310777485);
  });

  // Entity.restituteMovementAfterCollisions: a fall no faster than gravity (-vel.y <= gravity) does not bounce. With
  // AIR_DRAG_MODIFIER 0 the vertical drag is 1, so standing on a slime block moves down by exactly the gravity, 0.08,
  // each tick, and keeps it (vanilla's formula; a bounce would turn it to 0.08 - 0.08 = 0).
  it("does not bounce a fall exactly as fast as gravity", () => {
    const rig = rigWith({ airDragModifier: 0 }, new Vec3(0.5, groundLevel, 3345.5), new Vec3(0, -0.08, 0));
    const world = createFlatWorld(version, groundLevel);
    for (let x = -1; x <= 1; x++) {
      for (let z = 3344; z <= 3346; z++) world.setOverrideBlock(new Vec3(x, groundLevel - 1, z), rig.mcData.blocksByName.slime_block.id);
    }
    rig.playerState.onGround = true;
    rig.playerState.lastOnGround = true;

    rig.physics.simulate(rig.playerCtx, world as any);

    expect(rig.playerState.pos.y).toBe(groundLevel);
    expect(rig.playerState.onGround).toBe(true);
    expect(rig.playerState.vel.y).toBe(-0.08);
  });
});

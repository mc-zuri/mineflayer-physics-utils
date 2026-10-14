import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { Vec3 } from "vec3";

//0: STANDING, 1: FALL_FLYING, 2: SLEEPING, 3: SWIMMING, 4: SPIN_ATTACK, 5: SNEAKING, 6: LONG_JUMPING, 7: DYING
export enum PlayerPoses {
  STANDING,
  FALL_FLYING,
  SLEEPING,
  SWIMMING,
  SPIN_ATTACK, // dunno
  SNEAKING,
  LONG_JUMPING,
  DYING,
}

/**
 * From minecraft's Player.java file.
 */

type PlayerPoseContext = { [key in PlayerPoses]: { width: number; height: number } };

const f32 = Math.fround;

export const playerPoseCtx: PlayerPoseContext = {
  0: { width: f32(0.6), height: f32(1.8) },
  1: { width: f32(0.6), height: f32(0.6) },
  2: { width: f32(0.2), height: f32(0.2) },
  3: { width: f32(0.6), height: f32(0.6) },
  4: { width: f32(0.6), height: f32(0.6) },
  5: { width: f32(0.6), height: f32(1.5) },
  6: { width: f32(0.6), height: f32(1.8) },
  7: { width: f32(0.2), height: f32(0.2) },
};

/**
 * LivingEntity.getDimensions: the pose's size scaled by the scale attribute (1.20.5+; float), except sleeping.
 */
export function playerPoseSize(entityPose: PlayerPoses, scale = 1): { width: number; height: number } {
  const size = playerPoseCtx[entityPose];
  if (scale === 1 || entityPose === PlayerPoses.SLEEPING) return size;
  return { width: f32(size.width * scale), height: f32(size.height * scale) };
}

export function getCollider(entityPose: PlayerPoses, middleBottomPos: Vec3, scale = 1): AABB {
  const { width, height } = playerPoseSize(entityPose, scale);
  return new AABB(-width / 2, 0, -width / 2, width / 2, height, width / 2).translate(
    middleBottomPos.x,
    middleBottomPos.y,
    middleBottomPos.z
  );
}
